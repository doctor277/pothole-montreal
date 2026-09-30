import { File } from 'expo-file-system';
import { FunctionsHttpError, StorageApiError } from '@supabase/supabase-js';

import { ensureAnonymousSession } from '@/src/services/anonymous-session';
import { supabase } from '@/src/lib/supabase';
import type {
  ReportAddress,
  ReportDraft,
  ReportSubmissionAttempt,
  Severity,
  SubmittedReport,
  SubmittedPotholeStatus,
} from '@/src/types/report';
import { formatReportAddress, hasValidReportLocation } from '@/src/utils/report-location';

const reportPhotoBucket = 'report-photos';
const reportPhotoMimeType = 'image/jpeg';
const maxReportPhotoSizeBytes = 10 * 1024 * 1024;
const maxReportNoteLength = 500;

export type SubmissionStage = 'preparing' | 'uploading' | 'saving';

type SubmissionFailureKind =
  | 'incompleteDraft'
  | 'photoInvalid'
  | 'photoTooLarge'
  | 'photoUpload'
  | 'session'
  | 'existingPotholeUnavailable'
  | 'submission';

type PreparedUpload = ReportSubmissionAttempt & {
  uploadToken: string;
  replacedPreviousAttempt: boolean;
};

type SubmitCitizenReportOptions = {
  draft: ReportDraft;
  existingAttempt: ReportSubmissionAttempt | null;
  onAttemptReady?: (attempt: ReportSubmissionAttempt) => void;
  onStage?: (stage: SubmissionStage) => void;
};

type SubmitCitizenReportResult = {
  attempt: ReportSubmissionAttempt;
  report: SubmittedReport;
};

type FinalSubmissionPayload = {
  submission_id: string;
  storage_path: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  address: {
    formatted_address: string | null;
    street_number: string | null;
    street: string | null;
    city: string | null;
    district: string | null;
    region: string | null;
    postal_code: string | null;
    country: string | null;
  };
  severity: 'SMALL' | 'MEDIUM' | 'DANGEROUS';
  note: string | null;
  existing_pothole_public_id: string | null;
};

type SubmittedReportResponse = SubmittedReport & {
  potholeId: string;
  reportId: string;
};

export class CitizenReportSubmissionError extends Error {
  constructor(
    readonly kind: SubmissionFailureKind,
    readonly attempt: ReportSubmissionAttempt | null,
  ) {
    super(kind);
    this.name = 'CitizenReportSubmissionError';
  }
}

export async function submitCitizenReport({
  draft,
  existingAttempt,
  onAttemptReady,
  onStage,
}: SubmitCitizenReportOptions): Promise<SubmitCitizenReportResult> {
  const submissionInput = createSubmissionInput(draft, existingAttempt);
  const photoBytes = await readReportPhoto(draft.photoUri, existingAttempt);

  onStage?.('preparing');
  await ensureSubmissionSession(existingAttempt);

  const preparedUpload = await preparePhotoUpload(existingAttempt);
  const preparedAttempt: ReportSubmissionAttempt = {
    submissionId: preparedUpload.submissionId,
    storagePath: preparedUpload.storagePath,
  };

  // Persist the server-generated identifier before any network-sensitive photo
  // or database operation. A retry then reuses the same durable idempotency key.
  onAttemptReady?.(preparedAttempt);
  const finalSubmissionPayload: FinalSubmissionPayload = {
    ...submissionInput,
    submission_id: preparedUpload.submissionId,
    storage_path: preparedUpload.storagePath,
  };

  onStage?.('uploading');
  const uploadError = await uploadReportPhoto(preparedUpload, photoBytes);

  // A known client-side Storage rejection means the object was not accepted.
  // Keep the prepared attempt so Retry uses its server-generated idempotency
  // key, but do not ask the finalizer to create a report without its photo.
  if (isDefiniteSignedUploadFailure(uploadError)) {
    throw new CitizenReportSubmissionError('photoUpload', preparedAttempt);
  }

  // A retry may receive a conflict after the first upload reached Storage, and
  // an unknown transport/server failure can also happen after Storage accepted
  // the object. In those ambiguous cases, ask the idempotent finalizer whether
  // this exact submission already completed before showing a retry state.
  onStage?.('saving');
  const report = await finalizePotholeReport(finalSubmissionPayload, preparedUpload);

  if (report) {
    return {
      attempt: {
        ...preparedAttempt,
      },
      report,
    };
  }

  throw new CitizenReportSubmissionError('submission', preparedAttempt);
}

async function uploadReportPhoto(
  preparedUpload: PreparedUpload,
  photoBytes: ArrayBuffer,
): Promise<unknown | null> {
  try {
    const { error } = await supabase.storage
      .from(reportPhotoBucket)
      .uploadToSignedUrl(preparedUpload.storagePath, preparedUpload.uploadToken, photoBytes, {
        contentType: reportPhotoMimeType,
      });

    return error;
  } catch (error) {
    // A transport exception has no reliable completion signal. Treat it like
    // other ambiguous failures and let the idempotent server boundary decide.
    return error;
  }
}

function isDefiniteSignedUploadFailure(error: unknown): boolean {
  if (!(error instanceof StorageApiError)) {
    return false;
  }

  // 409 is the expected "object already exists" retry case. 408 can be a
  // response to a request whose completion was not observable by the phone.
  // Other 4xx Storage API responses are deterministic input/auth/path failures
  // and must stop before report finalization.
  return error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 409;
}

async function ensureSubmissionSession(existingAttempt: ReportSubmissionAttempt | null): Promise<void> {
  try {
    await ensureAnonymousSession();
  } catch {
    throw new CitizenReportSubmissionError('session', existingAttempt);
  }
}

async function preparePhotoUpload(
  existingAttempt: ReportSubmissionAttempt | null,
): Promise<PreparedUpload> {
  const { data, error } = await supabase.functions.invoke('prepare-report-upload', {
    body: existingAttempt ? { submission_id: existingAttempt.submissionId } : {},
  });

  if (error || !isPreparedUpload(data)) {
    throw new CitizenReportSubmissionError('submission', existingAttempt);
  }

  if (
    existingAttempt &&
    !data.replacedPreviousAttempt &&
    (data.submissionId !== existingAttempt.submissionId || data.storagePath !== existingAttempt.storagePath)
  ) {
    throw new CitizenReportSubmissionError('submission', existingAttempt);
  }

  return data;
}

async function finalizePotholeReport(
  payload: FinalSubmissionPayload,
  attempt: PreparedUpload,
): Promise<SubmittedReport | null> {
  const { data, error } = await supabase.functions.invoke('submit-pothole-report', {
    body: payload,
  });

  if (error) {
    if (await isExistingPotholeUnavailableError(error)) {
      throw new CitizenReportSubmissionError('existingPotholeUnavailable', {
        submissionId: attempt.submissionId,
        storagePath: attempt.storagePath,
      });
    }

    return null;
  }

  if (!isSubmittedReportResponse(data)) {
    throw new CitizenReportSubmissionError('submission', {
      submissionId: attempt.submissionId,
      storagePath: attempt.storagePath,
    });
  }

  return {
    publicId: data.publicId,
    status: data.status,
    matchedExisting: data.matchedExisting,
    reportCount: data.reportCount,
  };
}

function createSubmissionInput(
  draft: ReportDraft,
  existingAttempt: ReportSubmissionAttempt | null,
): Omit<FinalSubmissionPayload, 'submission_id' | 'storage_path'> {
  if (!draft.photoUri || !draft.severity || !hasValidReportLocation(draft.location)) {
    throw new CitizenReportSubmissionError('incompleteDraft', existingAttempt);
  }

  const note = normalizeNullableText(draft.note, maxReportNoteLength);

  if (draft.note.trim().length > maxReportNoteLength) {
    throw new CitizenReportSubmissionError('incompleteDraft', existingAttempt);
  }

  return {
    latitude: draft.location.latitude,
    longitude: draft.location.longitude,
    accuracy: normalizeAccuracy(draft.location.accuracy),
    address: serializeAddress(draft.location.address),
    severity: toDatabaseSeverity(draft.severity),
    note,
    existing_pothole_public_id: draft.selectedExistingPothole?.publicId ?? null,
  };
}

async function readReportPhoto(
  photoUri: string | null,
  existingAttempt: ReportSubmissionAttempt | null,
): Promise<ArrayBuffer> {
  if (!photoUri) {
    throw new CitizenReportSubmissionError('incompleteDraft', existingAttempt);
  }

  const file = new File(photoUri);

  if (!file.exists || file.size <= 0) {
    throw new CitizenReportSubmissionError('photoInvalid', existingAttempt);
  }

  if (file.size > maxReportPhotoSizeBytes) {
    throw new CitizenReportSubmissionError('photoTooLarge', existingAttempt);
  }

  const detectedMimeType = file.type.toLowerCase().split(';', 1)[0].trim();

  if (detectedMimeType && detectedMimeType !== reportPhotoMimeType) {
    throw new CitizenReportSubmissionError('photoInvalid', existingAttempt);
  }

  try {
    const bytes = await file.arrayBuffer();

    if (
      bytes.byteLength <= 0 ||
      bytes.byteLength > maxReportPhotoSizeBytes ||
      !hasJpegSignature(bytes)
    ) {
      throw new CitizenReportSubmissionError('photoInvalid', existingAttempt);
    }

    return bytes;
  } catch (error) {
    if (error instanceof CitizenReportSubmissionError) {
      throw error;
    }

    throw new CitizenReportSubmissionError('photoInvalid', existingAttempt);
  }
}

function serializeAddress(address: ReportAddress | null): FinalSubmissionPayload['address'] {
  const formattedAddress = formatReportAddress(address);

  return {
    formatted_address: formattedAddress
      ? [formattedAddress.primary, formattedAddress.secondary].filter(Boolean).join(', ')
      : null,
    street_number: normalizeNullableText(address?.streetNumber ?? null, 32),
    street: normalizeNullableText(address?.street ?? null, 255),
    city: normalizeNullableText(address?.city ?? null, 160),
    district: normalizeNullableText(address?.district ?? null, 160),
    region: normalizeNullableText(address?.region ?? null, 160),
    postal_code: normalizeNullableText(address?.postalCode ?? null, 32),
    country: normalizeNullableText(address?.country ?? null, 160),
  };
}

function normalizeAccuracy(accuracy: number | null): number | null {
  return typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0 && accuracy < 100000
    ? accuracy
    : null;
}

function normalizeNullableText(value: string | null, maxLength: number): string | null {
  const normalizedValue = value?.trim() ?? '';

  return normalizedValue.length > 0 && normalizedValue.length <= maxLength ? normalizedValue : null;
}

function toDatabaseSeverity(severity: Severity): FinalSubmissionPayload['severity'] {
  switch (severity) {
    case 'small':
      return 'SMALL';
    case 'medium':
      return 'MEDIUM';
    case 'large':
      return 'DANGEROUS';
  }
}

function hasJpegSignature(bytes: ArrayBuffer): boolean {
  const header = new Uint8Array(bytes.slice(0, 3));

  return header.length === 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
}

function isPreparedUpload(value: unknown): value is PreparedUpload {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isUuid(value.submissionId) &&
    typeof value.storagePath === 'string' &&
    value.storagePath.length > 0 &&
    typeof value.uploadToken === 'string' &&
    value.uploadToken.length > 0 &&
    typeof value.replacedPreviousAttempt === 'boolean'
  );
}

function isSubmittedReportResponse(value: unknown): value is SubmittedReportResponse {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isUuid(value.potholeId) &&
    isUuid(value.reportId) &&
    typeof value.publicId === 'string' &&
    /^MTL-[0-9]{6}$/.test(value.publicId) &&
    isSubmittedPotholeStatus(value.status) &&
    typeof value.matchedExisting === 'boolean' &&
    isNonNegativeInteger(value.reportCount)
  );
}

async function isExistingPotholeUnavailableError(error: unknown): Promise<boolean> {
  if (!(error instanceof FunctionsHttpError) || !isResponse(error.context) || error.context.status !== 409) {
    return false;
  }

  try {
    const responseBody: unknown = await error.context.clone().json();

    return isRecord(responseBody) && responseBody.error === 'existing_pothole_unavailable';
  } catch {
    return false;
  }
}

function isSubmittedPotholeStatus(value: unknown): value is SubmittedPotholeStatus {
  return (
    value === 'REPORTED' ||
    value === 'UNDER_REVIEW' ||
    value === 'VERIFIED' ||
    value === 'ASSIGNED' ||
    value === 'ACCEPTED' ||
    value === 'IN_PROGRESS' ||
    value === 'REPAIRED' ||
    value === 'REJECTED' ||
    value === 'DUPLICATE'
  );
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isResponse(value: unknown): value is Response {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    typeof value.status === 'number' &&
    'clone' in value &&
    typeof value.clone === 'function'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
