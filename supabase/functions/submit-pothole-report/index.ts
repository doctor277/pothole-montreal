import { withSupabase } from 'npm:@supabase/server@1.4.1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.4';

import {
  InvalidSubmissionInputError,
  isJpegSignature,
  isFinalizationRpcRow,
  isSubmissionPotholeStatus,
  parseFinalSubmissionInput,
  readJsonBody,
  REPORT_PHOTO_BUCKET,
  REPORT_PHOTO_MIME_TYPE,
  MAX_REPORT_PHOTO_SIZE_BYTES,
  toSubmissionResult,
  type SubmissionPotholeStatus,
  type SubmissionResult,
} from '../_shared/report-submission.ts';

type UploadIntent = {
  submission_id: string;
  reporter_user_id: string;
  storage_path: string;
};

type SubmissionLookup =
  | { state: 'found'; result: SubmissionResult }
  | { state: 'missing' }
  | { state: 'unverified' };

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

      const input = parseFinalSubmissionInput(await readJsonBody(request));
      const userId = userData.user.id;
      const { data: intentData, error: intentError } = await context.supabaseAdmin
        .from('report_upload_intents')
        .select('submission_id, reporter_user_id, storage_path')
        .eq('submission_id', input.submissionId)
        .eq('reporter_user_id', userId)
        .maybeSingle();

      if (intentError || !intentData || !isUploadIntent(intentData)) {
        return Response.json({ error: 'submission_not_found' }, { status: 404 });
      }

      const intent = intentData;

      if (intent.storage_path !== input.storagePath) {
        return Response.json({ error: 'submission_not_found' }, { status: 404 });
      }

      // A lost client response after a committed transaction should be treated as
      // success before checking Storage, so retrying cannot create a second report.
      const existingSubmission = await lookupExistingSubmission(
        context.supabaseAdmin,
        input.submissionId,
        userId,
      );

      if (existingSubmission.state === 'found') {
        return Response.json(existingSubmission.result);
      }

      const { data: photo, error: photoError } = await context.supabaseAdmin.storage
        .from(REPORT_PHOTO_BUCKET)
        .download(intent.storage_path);

      if (photoError || !photo || !isValidJpeg(photo)) {
        return Response.json({ error: 'photo_missing_or_invalid' }, { status: 422 });
      }

      const header = await photo.slice(0, 3).arrayBuffer();

      if (!isJpegSignature(header)) {
        return Response.json({ error: 'photo_missing_or_invalid' }, { status: 422 });
      }

      const { data: finalizeData, error: finalizeError } = await context.supabaseAdmin.rpc(
        'finalize_citizen_report_v2',
        {
          p_submission_id: input.submissionId,
          p_reporter_user_id: userId,
          p_storage_path: intent.storage_path,
          p_existing_pothole_public_id: input.existingPotholePublicId,
          p_latitude: input.latitude,
          p_longitude: input.longitude,
          p_accuracy_meters: input.accuracy,
          p_formatted_address: input.address.formattedAddress,
          p_street_number: input.address.streetNumber,
          p_street: input.address.street,
          p_city: input.address.city,
          p_district: input.address.district,
          p_region: input.address.region,
          p_postal_code: input.address.postalCode,
          p_country: input.address.country,
          p_severity: input.severity,
          p_note: input.note,
          p_mime_type: REPORT_PHOTO_MIME_TYPE,
          p_file_size_bytes: photo.size,
        },
      );

      const finalizationOutcome = getFinalizationOutcome(finalizeData);

      if (!finalizeError && finalizationOutcome.kind === 'finalized') {
        return Response.json(finalizationOutcome.result);
      }

      // A citizen-selected candidate can become unavailable after the nearby
      // lookup. That is a safe, recoverable domain outcome, not a failed
      // upload: retain the intent and private JPEG so the draft can be checked
      // again without creating a new submission identity.
      if (!finalizeError && finalizationOutcome.kind === 'existingPotholeUnavailable') {
        return Response.json({ error: 'existing_pothole_unavailable' }, { status: 409 });
      }

      // A database RPC error can still mean its transaction committed but its
      // response was lost, so verify first. Only a database cleanup claim that
      // locks and invalidates a known-unfinalized intent may authorize removal.
      // An unverified outcome retains its original ID for a safe retry.
      const postFailureLookup = await lookupExistingSubmission(
        context.supabaseAdmin,
        input.submissionId,
        userId,
      );

      if (postFailureLookup.state === 'found') {
        return Response.json(postFailureLookup.result);
      }

      if (postFailureLookup.state === 'missing') {
        const cleanupClaimed = await claimFailedUploadCleanup(
          context.supabaseAdmin,
          input.submissionId,
          userId,
        );

        if (cleanupClaimed) {
          const { error: cleanupError } = await context.supabaseAdmin.storage
            .from(REPORT_PHOTO_BUCKET)
            .remove([intent.storage_path]);

          if (cleanupError) {
            console.error('submit-pothole-report photo cleanup failed', cleanupError);
          }
        }
      }

      console.error('submit-pothole-report finalization failed', finalizeError);
      return Response.json({ error: 'submission_failed' }, { status: 500 });
    } catch (error) {
      if (error instanceof InvalidSubmissionInputError) {
        return Response.json({ error: 'invalid_request' }, { status: 400 });
      }

      console.error('submit-pothole-report failed', error);
      return Response.json({ error: 'submission_failed' }, { status: 500 });
    }
  }),
};

async function lookupExistingSubmission(
  supabaseAdmin: SupabaseClient,
  submissionId: string,
  reporterUserId: string,
): Promise<SubmissionLookup> {
  const { data: reportData, error: reportError } = await supabaseAdmin
    .from('reports')
    .select('id, pothole_id, matched_existing_pothole')
    .eq('submission_id', submissionId)
    .eq('reporter_user_id', reporterUserId)
    .maybeSingle();

  if (reportError) {
    return { state: 'unverified' };
  }

  if (!isExistingReport(reportData)) {
    return reportData ? { state: 'unverified' } : { state: 'missing' };
  }

  const { data: potholeData, error: potholeError } = await supabaseAdmin
    .from('potholes')
    .select('id, public_id, status, report_count')
    .eq('id', reportData.pothole_id)
    .maybeSingle();

  if (potholeError || !isExistingPothole(potholeData)) {
    return { state: 'unverified' };
  }

  return {
    state: 'found',
    result: {
      potholeId: potholeData.id,
      reportId: reportData.id,
      publicId: potholeData.public_id,
      status: potholeData.status,
      matchedExisting: reportData.matched_existing_pothole,
      reportCount: potholeData.report_count,
    },
  };
}

async function claimFailedUploadCleanup(
  supabaseAdmin: SupabaseClient,
  submissionId: string,
  reporterUserId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('claim_failed_report_upload_cleanup', {
    p_submission_id: submissionId,
    p_reporter_user_id: reporterUserId,
  });

  return !error && data === true;
}

type FinalizationOutcome =
  | { kind: 'finalized'; result: SubmissionResult }
  | { kind: 'existingPotholeUnavailable' }
  | { kind: 'unexpected' };

function getFinalizationOutcome(value: unknown): FinalizationOutcome {
  const row = Array.isArray(value) ? (value.length === 1 ? value[0] : null) : value;

  if (isFinalizationRpcRow(row)) {
    return { kind: 'finalized', result: toSubmissionResult(row) };
  }

  if (isExistingPotholeUnavailableRow(row)) {
    return { kind: 'existingPotholeUnavailable' };
  }

  return { kind: 'unexpected' };
}

function isValidJpeg(photo: Blob): boolean {
  return (
    photo.size > 0 &&
    photo.size <= MAX_REPORT_PHOTO_SIZE_BYTES &&
    photo.type.toLowerCase().split(';', 1)[0].trim() === REPORT_PHOTO_MIME_TYPE
  );
}

function isUploadIntent(value: unknown): value is UploadIntent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const intent = value as Record<string, unknown>;

  return (
    typeof intent.submission_id === 'string' &&
    typeof intent.reporter_user_id === 'string' &&
    typeof intent.storage_path === 'string'
  );
}

function isExistingReport(value: unknown): value is {
  id: string;
  pothole_id: string;
  matched_existing_pothole: boolean;
} {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const report = value as Record<string, unknown>;

  return (
    typeof report.id === 'string' &&
    typeof report.pothole_id === 'string' &&
    typeof report.matched_existing_pothole === 'boolean'
  );
}

function isExistingPothole(value: unknown): value is {
  id: string;
  public_id: string;
  status: SubmissionPotholeStatus;
  report_count: number;
} {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const pothole = value as Record<string, unknown>;

  return (
    typeof pothole.id === 'string' &&
    typeof pothole.public_id === 'string' &&
    isSubmissionPotholeStatus(pothole.status) &&
    typeof pothole.report_count === 'number' &&
    Number.isSafeInteger(pothole.report_count) &&
    pothole.report_count >= 0
  );
}

function isExistingPotholeUnavailableRow(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const row = value as Record<string, unknown>;

  // The v2 RPC intentionally returns this fully-null, fixed domain outcome
  // instead of exposing a PostgreSQL error. Validate every field before using
  // it to decide that an upload intent should remain retriable.
  return (
    row.outcome === 'EXISTING_POTHOLE_UNAVAILABLE' &&
    row.pothole_id === null &&
    row.report_id === null &&
    row.public_id === null &&
    row.status === null &&
    row.matched_existing === null &&
    row.report_count === null
  );
}
