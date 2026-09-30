import { withSupabase } from 'npm:@supabase/server@1.4.1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.4';

import {
  AdminAuthorizationError,
  requireActiveAdmin,
  toAdminAuthorizationResponse,
} from '../_shared/admin-auth.ts';
import { isAiAnalysisEnabled } from '../_shared/ai-operational-guardrails.ts';
import {
  InvalidAdminDetailInputError,
  parseAdminGetPotholeInput,
} from '../_shared/admin-get-pothole-input.ts';
import {
  parseAdminDetail,
  toAdminDetailDto,
  type AdminPhotoDto,
  type RawPhoto,
} from '../_shared/admin-detail-dto.ts';
import { loadOptionalAdminAiAssessmentSummary } from '../_shared/pothole-ai-assessment.ts';
import {
  buildPotholeAutoVerifyShadowDecision,
} from '../_shared/pothole-ai-decision-policy.ts';
import { REPORT_PHOTO_BUCKET } from '../_shared/report-submission.ts';

const PHOTO_URL_TTL_SECONDS = 5 * 60;

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    if (request.method !== 'POST') {
      return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    }

    try {
      const admin = await requireActiveAdmin(context);
      const publicId = parseAdminGetPotholeInput(await readJsonBody(request));
      const { data, error } = await context.supabaseAdmin.rpc('admin_get_pothole', {
        p_public_id: publicId,
      });

      if (error) {
        console.error('admin-get-pothole failed');
        return Response.json({ error: 'pothole_unavailable' }, { status: 500 });
      }

      if (data === null) {
        return Response.json({ error: 'not_found' }, { status: 404 });
      }

      const detail = parseAdminDetail(data);

      if (!detail) {
        console.error('admin-get-pothole received an unexpected RPC response');
        return Response.json({ error: 'pothole_unavailable' }, { status: 500 });
      }

      const browserDetail = await toAdminDetailDto(detail, (photo) =>
        toSignedPhoto(context.supabaseAdmin, photo),
      );

      const aiSummary = await loadOptionalAdminAiAssessmentSummary(
        (functionName, arguments_) => context.supabaseAdmin.rpc(functionName, arguments_),
        { publicId, actorUserId: admin.userId },
      );

      if (aiSummary.availability === 'unavailable') {
        console.error('admin-get-pothole AI summary lookup failed');
      }

      const shadowAutomation = aiSummary.assessment
        ? buildPotholeAutoVerifyShadowDecision(
            aiSummary.assessment,
            Deno.env.get('AI_AUTOMATION_ENABLED'),
          )
        : null;

      // `toAdminDetailDto` is an explicit browser allowlist. In particular,
      // database-only Storage paths, Auth IDs, and submission IDs remain on
      // the server even though the Edge Function created a short-lived image
      // URL for the authorized administrator.
      return Response.json(
        {
          ...browserDetail,
          aiAnalysisEnabled: isAiAnalysisEnabled(Deno.env.get('AI_ANALYSIS_ENABLED')),
          aiAssessmentAvailability: aiSummary.availability,
          aiAssessment: aiSummary.assessment,
          aiAssessmentCount: aiSummary.assessmentCount,
          shadowAutomation,
        },
        {
          // The DTO includes short-lived private-photo URLs. Do not allow a
          // browser or intermediary to retain the containing response beyond
          // this authorized detail request.
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    } catch (error) {
      if (error instanceof AdminAuthorizationError) {
        return toAdminAuthorizationResponse(error);
      }

      if (error instanceof InvalidAdminDetailInputError) {
        return Response.json({ error: 'invalid_request' }, { status: 400 });
      }

      console.error('admin-get-pothole failed');
      return Response.json({ error: 'pothole_unavailable' }, { status: 500 });
    }
  }),
};

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new InvalidAdminDetailInputError('request body must be valid JSON');
  }
}

async function toSignedPhoto(
  supabaseAdmin: SupabaseClient,
  photo: RawPhoto,
): Promise<AdminPhotoDto> {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(REPORT_PHOTO_BUCKET)
      .createSignedUrl(photo.storage_path, PHOTO_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) {
      // A deleted or otherwise unavailable private object is expected to be a
      // recoverable display state. Never return its path or raw Storage error.
      return unavailablePhoto(photo);
    }

    return {
      mimeType: photo.mime_type,
      fileSizeBytes: photo.file_size_bytes,
      createdAt: photo.created_at,
      available: true,
      signedUrl: data.signedUrl,
      expiresInSeconds: PHOTO_URL_TTL_SECONDS,
    };
  } catch {
    return unavailablePhoto(photo);
  }
}

function unavailablePhoto(photo: RawPhoto): AdminPhotoDto {
  return {
    mimeType: photo.mime_type,
    fileSizeBytes: photo.file_size_bytes,
    createdAt: photo.created_at,
    available: false,
    signedUrl: null,
    expiresInSeconds: null,
  };
}
