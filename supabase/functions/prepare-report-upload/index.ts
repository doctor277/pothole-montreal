import { withSupabase } from 'npm:@supabase/server@1.4.1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.4';

import {
  buildReportPhotoPath,
  InvalidSubmissionInputError,
  parsePrepareUploadInput,
  readJsonBody,
  REPORT_PHOTO_BUCKET,
} from '../_shared/report-submission.ts';

type UploadIntent = {
  submission_id: string;
  reporter_user_id: string;
  storage_path: string;
  cleanup_requested_at: string | null;
};

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    if (request.method !== 'POST') {
      return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    }

    try {
      const { data: userData, error: userError } = await context.supabase.auth.getUser();

      if (userError || !userData.user) {
        return Response.json({ error: 'unauthorized' }, { status: 401 });
      }

      const { submissionId: requestedSubmissionId } = parsePrepareUploadInput(await readJsonBody(request));
      const userId = userData.user.id;
      let createdIntent = false;
      let replacedPreviousAttempt = false;
      let intent: UploadIntent;

      if (requestedSubmissionId) {
        const { data, error } = await context.supabaseAdmin
          .from('report_upload_intents')
          .select('submission_id, reporter_user_id, storage_path, cleanup_requested_at')
          .eq('submission_id', requestedSubmissionId)
          .eq('reporter_user_id', userId)
          .maybeSingle();

        if (error || !data || !isUploadIntent(data)) {
          return Response.json({ error: 'submission_not_found' }, { status: 404 });
        }

        if (data.cleanup_requested_at) {
          // The finalizer locked this known-unfinalized intent before requesting
          // cleanup. Retry a prior failed removal before issuing a replacement
          // path, so the old private object is not needlessly abandoned.
          const { error: cleanupError } = await context.supabaseAdmin.storage
            .from(REPORT_PHOTO_BUCKET)
            .remove([data.storage_path]);

          if (cleanupError) {
            console.error('prepare-report-upload retry cleanup failed', cleanupError);
            return Response.json({ error: 'preparation_failed' }, { status: 500 });
          }

          const replacement = await createUploadIntent(context.supabaseAdmin, userId);

          if (!replacement) {
            return Response.json({ error: 'preparation_failed' }, { status: 500 });
          }

          intent = replacement;
          createdIntent = true;
          replacedPreviousAttempt = true;
        } else {
          intent = data;
        }
      } else {
        const created = await createUploadIntent(context.supabaseAdmin, userId);

        if (!created) {
          return Response.json({ error: 'preparation_failed' }, { status: 500 });
        }

        intent = created;
        createdIntent = true;
      }

      const { data: signedUpload, error: signedUploadError } = await context.supabaseAdmin.storage
        .from(REPORT_PHOTO_BUCKET)
        .createSignedUploadUrl(intent.storage_path, { upsert: false });

      if (signedUploadError || !signedUpload?.token) {
        if (createdIntent) {
          await context.supabaseAdmin
            .from('report_upload_intents')
            .delete()
            .eq('submission_id', intent.submission_id)
            .eq('reporter_user_id', userId);
        }

        return Response.json({ error: 'preparation_failed' }, { status: 500 });
      }

      return Response.json({
        submissionId: intent.submission_id,
        storagePath: intent.storage_path,
        uploadToken: signedUpload.token,
        replacedPreviousAttempt,
      });
    } catch (error) {
      if (error instanceof InvalidSubmissionInputError) {
        return Response.json({ error: 'invalid_request' }, { status: 400 });
      }

      console.error('prepare-report-upload failed', error);
      return Response.json({ error: 'preparation_failed' }, { status: 500 });
    }
  }),
};

function isUploadIntent(value: unknown): value is UploadIntent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const intent = value as Record<string, unknown>;

  return (
    typeof intent.submission_id === 'string' &&
    typeof intent.reporter_user_id === 'string' &&
    typeof intent.storage_path === 'string' &&
    (intent.cleanup_requested_at === null || typeof intent.cleanup_requested_at === 'string')
  );
}

async function createUploadIntent(
  supabaseAdmin: SupabaseClient,
  userId: string,
): Promise<UploadIntent | null> {
  const submissionId = crypto.randomUUID();
  const storagePath = buildReportPhotoPath(userId, submissionId);
  const { data, error } = await supabaseAdmin
    .from('report_upload_intents')
    .insert({
      submission_id: submissionId,
      reporter_user_id: userId,
      storage_path: storagePath,
    })
    .select('submission_id, reporter_user_id, storage_path, cleanup_requested_at')
    .single();

  return !error && isUploadIntent(data) ? data : null;
}
