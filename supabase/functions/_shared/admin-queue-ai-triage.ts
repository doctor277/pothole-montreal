import { isPublicId } from './admin-detail-dto.ts';
import { evaluatePotholeAiTriage, type PotholeAiTriageDto, type TriageAssessment } from './pothole-ai-triage-policy.ts';

type RpcInvoker = (
  name: 'admin_get_queue_ai_triage_inputs',
  input: { p_public_ids: string[]; p_actor_user_id: string },
) => PromiseLike<{ data: unknown; error: unknown }>;

/** Supplemental, single-batch read. A failure never removes the human queue. */
export async function loadQueueAiTriage(
  invokeRpc: RpcInvoker,
  publicIds: string[],
  actorUserId: string,
  timeoutMs = 2_000,
): Promise<Map<string, PotholeAiTriageDto> | null> {
  if (!publicIds.length) return new Map();
  if (publicIds.length > 50 || publicIds.some((id) => !isPublicId(id)) ||
    new Set(publicIds).size !== publicIds.length || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return null;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      Promise.resolve(invokeRpc('admin_get_queue_ai_triage_inputs', {
        p_public_ids: publicIds,
        p_actor_user_id: actorUserId,
      })),
      new Promise<null>((resolve) => { timeout = setTimeout(() => resolve(null), timeoutMs); }),
    ]);
    if (!response) return null;
    const { data, error } = response;
    if (error || !isRecord(data) || data.outcome !== 'OK' || !Array.isArray(data.items) ||
      data.items.length !== publicIds.length) return null;

    const result = new Map<string, PotholeAiTriageDto>();
    for (const item of data.items) {
      if (!isRecord(item) || !isPublicId(item.public_id) || !publicIds.includes(item.public_id) ||
        result.has(item.public_id) || typeof item.evidence_changed_since_assessment !== 'boolean' ||
        !(item.latest_evidence_created_at === null || isTimestamp(item.latest_evidence_created_at))) return null;
      const assessment = item.assessment === null ? null : parseAssessment(item.assessment);
      if (item.assessment !== null && !assessment) return null;
      if (assessment === null && item.evidence_changed_since_assessment) return null;
      result.set(item.public_id, evaluatePotholeAiTriage({
        assessment,
        // PostgreSQL compares timestamptz at full precision; do not round it through JS Date.
        evidenceChangedSinceAssessment: item.evidence_changed_since_assessment,
      }));
    }
    return result;
  } catch {
    return null;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function parseAssessment(value: unknown): TriageAssessment | null {
  if (!isRecord(value) ||
    !['likely_pothole', 'uncertain', 'unlikely_pothole'].includes(value.classification as string) ||
    typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1 ||
    !['good', 'usable', 'poor'].includes(value.photo_quality as string) ||
    !(value.suggested_severity === null || ['SMALL', 'MEDIUM', 'DANGEROUS'].includes(value.suggested_severity as string)) ||
    typeof value.input_photo_count !== 'number' || !Number.isSafeInteger(value.input_photo_count) || value.input_photo_count < 1 || value.input_photo_count > 3 ||
    !isLabel(value.model) || !isLabel(value.prompt_version) || !isLabel(value.schema_version) ||
    !isTimestamp(value.requested_at) || !isTimestamp(value.created_at)) return null;
  return {
    classification: value.classification as TriageAssessment['classification'],
    confidence: value.confidence,
    photoQuality: value.photo_quality as TriageAssessment['photoQuality'],
    suggestedSeverity: value.suggested_severity === null ? 'unknown' : value.suggested_severity as TriageAssessment['suggestedSeverity'],
    inputPhotoCount: value.input_photo_count,
    model: value.model,
    promptVersion: value.prompt_version,
    schemaVersion: value.schema_version,
  };
}

function isLabel(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}
function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
