export const potholeAiClassifications = [
  'likely_pothole',
  'uncertain',
  'unlikely_pothole',
] as const;

export const potholeAiPhotoQualities = ['good', 'usable', 'poor'] as const;
export const potholeAiSuggestedSeverities = ['SMALL', 'MEDIUM', 'DANGEROUS', 'unknown'] as const;

export const MAX_AI_LIST_ITEMS = 5;
export const MAX_AI_LIST_ITEM_LENGTH = 160;
export const MAX_AI_SUMMARY_LENGTH = 500;

export type PotholeAiClassification = (typeof potholeAiClassifications)[number];
export type PotholeAiPhotoQuality = (typeof potholeAiPhotoQualities)[number];
export type PotholeAiSuggestedSeverity = (typeof potholeAiSuggestedSeverities)[number];

export type PotholeAiAssessment = {
  classification: PotholeAiClassification;
  confidence: number;
  photoQuality: PotholeAiPhotoQuality;
  suggestedSeverity: PotholeAiSuggestedSeverity;
  visibleEvidence: string[];
  cautions: string[];
  summary: string;
};

export type AdminAiAssessmentDto = PotholeAiAssessment & {
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  inputPhotoCount: number;
  createdAt: string;
};

export type AdminAiAssessmentSummaryDto = {
  assessment: AdminAiAssessmentDto | null;
  assessmentCount: number;
};

export type OptionalAdminAiAssessmentSummaryDto =
  | (AdminAiAssessmentSummaryDto & { availability: 'available' })
  | { availability: 'unavailable'; assessment: null; assessmentCount: null };

type AdminAiSummaryRpcInvoker = (
  functionName: 'admin_get_pothole_ai_summary',
  arguments_: { p_public_id: string; p_actor_user_id: string },
) => PromiseLike<{ data: unknown; error: unknown }>;

const providerAssessmentKeys = [
  'classification',
  'confidence',
  'photoQuality',
  'suggestedSeverity',
  'visibleEvidence',
  'cautions',
  'summary',
] as const;

/**
 * Revalidates the provider result after Structured Outputs. Unknown keys are
 * rejected because the provider contract is deliberately exact.
 */
export function parsePotholeAiAssessment(value: unknown): PotholeAiAssessment | null {
  if (!isRecord(value) || !hasOnlyKeys(value, providerAssessmentKeys)) {
    return null;
  }

  const visibleEvidence = parseBoundedStringList(value.visibleEvidence);
  const cautions = parseBoundedStringList(value.cautions);
  const summary = parseBoundedString(value.summary, MAX_AI_SUMMARY_LENGTH);

  if (
    !isPotholeAiClassification(value.classification) ||
    !isConfidence(value.confidence) ||
    !isPotholeAiPhotoQuality(value.photoQuality) ||
    !isPotholeAiSuggestedSeverity(value.suggestedSeverity) ||
    !visibleEvidence ||
    !cautions ||
    !summary
  ) {
    return null;
  }

  return {
    classification: value.classification,
    confidence: value.confidence,
    photoQuality: value.photoQuality,
    suggestedSeverity: value.suggestedSeverity,
    visibleEvidence,
    cautions,
    summary,
  };
}

/**
 * Parses the service-role-only latest-assessment RPC and emits a strict
 * browser allowlist. Internal IDs, requester identity, evidence hashes, raw
 * provider data, and photo locations are intentionally ignored.
 */
export function parseAdminAiAssessmentSummary(
  value: unknown,
): AdminAiAssessmentSummaryDto | null {
  if (!isRecord(value) || !isNonNegativeInteger(value.assessment_count)) {
    return null;
  }

  if (value.assessment === null) {
    return value.assessment_count === 0
      ? { assessment: null, assessmentCount: 0 }
      : null;
  }

  if (value.assessment_count < 1) {
    return null;
  }

  const assessment = parsePersistedAssessment(value.assessment);
  return assessment
    ? { assessment, assessmentCount: value.assessment_count }
    : null;
}

/**
 * Keeps the production admin-detail RPC name, server-derived actor argument,
 * outcome check, and browser allowlist behind one directly tested boundary.
 */
export async function loadAdminAiAssessmentSummary(
  invokeRpc: AdminAiSummaryRpcInvoker,
  input: { publicId: string; actorUserId: string },
): Promise<AdminAiAssessmentSummaryDto | null> {
  const { data, error } = await invokeRpc('admin_get_pothole_ai_summary', {
    p_public_id: input.publicId,
    p_actor_user_id: input.actorUserId,
  });

  if (error || !isRecord(data) || data.outcome !== 'OK') {
    return null;
  }

  return parseAdminAiAssessmentSummary(data);
}

/**
 * AI summary data is supplemental to the core moderation record. Convert all
 * AI-only RPC, transport, and validation failures into a sanitized optional
 * section so they cannot suppress reports, photos, or human actions.
 */
export async function loadOptionalAdminAiAssessmentSummary(
  invokeRpc: AdminAiSummaryRpcInvoker,
  input: { publicId: string; actorUserId: string },
): Promise<OptionalAdminAiAssessmentSummaryDto> {
  try {
    const summary = await loadAdminAiAssessmentSummary(invokeRpc, input);
    return summary
      ? { availability: 'available', ...summary }
      : { availability: 'unavailable', assessment: null, assessmentCount: null };
  } catch {
    return { availability: 'unavailable', assessment: null, assessmentCount: null };
  }
}

function parsePersistedAssessment(value: unknown): AdminAiAssessmentDto | null {
  if (!isRecord(value)) {
    return null;
  }

  const suggestedSeverity = value.suggested_severity === null
    ? 'unknown'
    : value.suggested_severity;

  const assessment = parsePotholeAiAssessment({
    classification: value.classification,
    confidence: value.confidence,
    photoQuality: value.photo_quality,
    suggestedSeverity,
    visibleEvidence: value.visible_evidence,
    cautions: value.cautions,
    summary: value.summary,
  });

  if (
    !assessment ||
    !isBoundedMetadata(value.provider) ||
    !isBoundedMetadata(value.model) ||
    !isBoundedMetadata(value.prompt_version) ||
    !isBoundedMetadata(value.schema_version) ||
    !isInputPhotoCount(value.input_photo_count) ||
    !isTimestamp(value.created_at)
  ) {
    return null;
  }

  return {
    ...assessment,
    provider: value.provider,
    model: value.model,
    promptVersion: value.prompt_version,
    schemaVersion: value.schema_version,
    inputPhotoCount: value.input_photo_count,
    createdAt: value.created_at,
  };
}

function parseBoundedStringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_AI_LIST_ITEMS) {
    return null;
  }

  const strings = value.map((item) => parseBoundedString(item, MAX_AI_LIST_ITEM_LENGTH));
  return strings.some((item) => item === null) ? null : (strings as string[]);
}

function parseBoundedString(value: unknown, maximumLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maximumLength ? normalized : null;
}

function isPotholeAiClassification(value: unknown): value is PotholeAiClassification {
  return (
    typeof value === 'string' &&
    potholeAiClassifications.includes(value as PotholeAiClassification)
  );
}

function isPotholeAiPhotoQuality(value: unknown): value is PotholeAiPhotoQuality {
  return (
    typeof value === 'string' &&
    potholeAiPhotoQualities.includes(value as PotholeAiPhotoQuality)
  );
}

function isPotholeAiSuggestedSeverity(value: unknown): value is PotholeAiSuggestedSeverity {
  return (
    typeof value === 'string' &&
    potholeAiSuggestedSeverities.includes(value as PotholeAiSuggestedSeverity)
  );
}

function isConfidence(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isInputPhotoCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 3;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isBoundedMetadata(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return keys.length === allowedKeys.length && keys.every((key) => allowedKeys.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
