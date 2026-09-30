import { isPublicId } from './admin-detail-dto.ts';

export const aiOperationalEventTypes = [
  'analysis_disabled',
  'analysis_concurrent',
  'no_usable_photos',
  'evidence_unavailable',
  'provider_started',
  'provider_succeeded',
  'provider_timeout',
  'provider_rate_limited',
  'provider_invalid_response',
  'provider_unavailable',
  'assessment_persisted',
  'persistence_failure',
] as const;

export type AiOperationalEventType = (typeof aiOperationalEventTypes)[number];

export type AiOperationalEvent = {
  publicId: string;
  requestId: string;
  eventType: AiOperationalEventType;
  provider?: 'openai';
  model?: string;
  promptVersion?: string;
  schemaVersion?: string;
  selectedPhotoCount?: number;
  durationMs?: number;
  automationOperationallyEnabled?: boolean;
  actionPerformed?: false;
};

type TelemetryRpcInvoker = (
  functionName: 'record_pothole_ai_operational_event',
  arguments_: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: unknown }>;

const MAX_DURATION_MS = 5 * 60 * 1000;
const TELEMETRY_WRITE_TIMEOUT_MS = 1_000;
const providerEventTypes: readonly AiOperationalEventType[] = [
  'provider_started',
  'provider_succeeded',
  'provider_timeout',
  'provider_rate_limited',
  'provider_invalid_response',
  'provider_unavailable',
  'assessment_persisted',
  'persistence_failure',
];

/**
 * Best-effort server-only telemetry writer. The explicit allowlist prevents
 * callers from attaching raw errors, identities, paths, URLs, or image data.
 */
export async function recordAiOperationalEvent(
  invokeRpc: TelemetryRpcInvoker,
  event: AiOperationalEvent,
  timeoutMs = TELEMETRY_WRITE_TIMEOUT_MS,
): Promise<boolean> {
  if (!isValidEvent(event) || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return false;
  }

  try {
    const result = await withDeadline(
      Promise.resolve(invokeRpc('record_pothole_ai_operational_event', {
        p_public_id: event.publicId,
        p_request_id: event.requestId,
        p_event_type: event.eventType,
        p_provider: event.provider ?? null,
        p_model: event.model ?? null,
        p_prompt_version: event.promptVersion ?? null,
        p_schema_version: event.schemaVersion ?? null,
        p_selected_photo_count: event.selectedPhotoCount ?? null,
        p_duration_ms: event.durationMs ?? null,
        p_automation_operationally_enabled:
          event.automationOperationallyEnabled ?? false,
        p_action_performed: event.actionPerformed ?? false,
      })),
      timeoutMs,
    );

    return result !== null && result.error === null && result.data === true;
  } catch {
    return false;
  }
}

async function withDeadline<T>(operation: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timeout = setTimeout(() => resolve(null), timeoutMs);
  });

  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

function isValidEvent(event: AiOperationalEvent): boolean {
  return (
    isPublicId(event.publicId) &&
    isUuid(event.requestId) &&
    aiOperationalEventTypes.includes(event.eventType) &&
    hasValidProviderMetadata(event) &&
    (event.selectedPhotoCount === undefined ||
      (Number.isSafeInteger(event.selectedPhotoCount) &&
        event.selectedPhotoCount >= 0 &&
        event.selectedPhotoCount <= 3)) &&
    (event.durationMs === undefined ||
      (Number.isSafeInteger(event.durationMs) &&
        event.durationMs >= 0 &&
        event.durationMs <= MAX_DURATION_MS)) &&
    (event.automationOperationallyEnabled === undefined ||
      typeof event.automationOperationallyEnabled === 'boolean') &&
    (event.actionPerformed === undefined || event.actionPerformed === false)
  );
}

function hasValidProviderMetadata(event: AiOperationalEvent): boolean {
  if (!providerEventTypes.includes(event.eventType)) {
    return (
      event.provider === undefined &&
      event.model === undefined &&
      event.promptVersion === undefined &&
      event.schemaVersion === undefined
    );
  }

  return (
    event.provider === 'openai' &&
    isLabel(event.model, 128, /^gpt-[A-Za-z0-9._:-]+$/) &&
    isLabel(event.promptVersion, 64, /^pothole-vision-v[0-9]+$/) &&
    isLabel(event.schemaVersion, 64, /^pothole-assessment-v[0-9]+$/)
  );
}

function isLabel(
  value: string | undefined,
  maximumLength: number,
  pattern: RegExp,
): value is string {
  return (
    typeof value === 'string' &&
    value.length <= maximumLength &&
    pattern.test(value)
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
