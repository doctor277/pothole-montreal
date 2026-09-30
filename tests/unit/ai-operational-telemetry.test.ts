import { describe, expect, it, vi } from 'vitest';

import {
  recordAiOperationalEvent,
  type AiOperationalEvent,
} from '../../supabase/functions/_shared/ai-operational-telemetry';

const baseEvent = {
  publicId: 'MTL-000003',
  requestId: '00000000-0000-4000-8000-000000000201',
} as const;

describe('AI operational telemetry boundary', () => {
  it('writes only the fixed privacy-safe RPC allowlist', async () => {
    const invokeRpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const event: AiOperationalEvent = {
      ...baseEvent,
      eventType: 'provider_succeeded',
      provider: 'openai',
      model: 'gpt-5.6-terra',
      promptVersion: 'pothole-vision-v1',
      schemaVersion: 'pothole-assessment-v1',
      selectedPhotoCount: 3,
      durationMs: 1250,
      automationOperationallyEnabled: true,
      actionPerformed: false,
    };

    await expect(recordAiOperationalEvent(invokeRpc, event)).resolves.toBe(true);
    expect(invokeRpc).toHaveBeenCalledWith('record_pothole_ai_operational_event', {
      p_public_id: baseEvent.publicId,
      p_request_id: baseEvent.requestId,
      p_event_type: 'provider_succeeded',
      p_provider: 'openai',
      p_model: 'gpt-5.6-terra',
      p_prompt_version: 'pothole-vision-v1',
      p_schema_version: 'pothole-assessment-v1',
      p_selected_photo_count: 3,
      p_duration_ms: 1250,
      p_automation_operationally_enabled: true,
      p_action_performed: false,
    });

    const serialized = JSON.stringify(invokeRpc.mock.calls[0]);
    for (const forbidden of [
      'error_message',
      'stack',
      'storage_path',
      'signed_url',
      'reporter_user_id',
      'actor_user_id',
      'image',
      'base64',
      'latitude',
      'longitude',
      'address',
      'note',
      'token',
      'api_key',
    ]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden);
    }
  });

  it.each([
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
  ] as const)('accepts the controlled %s category', async (eventType) => {
    const invokeRpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const providerMetadata = eventType.startsWith('provider_') ||
      eventType === 'assessment_persisted' || eventType === 'persistence_failure'
      ? {
          provider: 'openai' as const,
          model: 'gpt-5.6-terra',
          promptVersion: 'pothole-vision-v1',
          schemaVersion: 'pothole-assessment-v1',
        }
      : {};

    await expect(
      recordAiOperationalEvent(invokeRpc, {
        ...baseEvent,
        eventType,
        ...providerMetadata,
      }),
    ).resolves.toBe(true);
  });

  it('fails closed before RPC invocation for unbounded or malformed metadata', async () => {
    const invokeRpc = vi.fn();

    await expect(
      recordAiOperationalEvent(invokeRpc, {
        ...baseEvent,
        eventType: 'provider_unavailable',
        durationMs: -1,
      }),
    ).resolves.toBe(false);
    await expect(
      recordAiOperationalEvent(invokeRpc, {
        ...baseEvent,
        eventType: 'provider_unavailable',
        provider: 'openai',
        model: 'x'.repeat(129),
        promptVersion: 'pothole-vision-v1',
        schemaVersion: 'pothole-assessment-v1',
      }),
    ).resolves.toBe(false);
    await expect(
      recordAiOperationalEvent(invokeRpc, {
        ...baseEvent,
        eventType: 'provider_unavailable',
        provider: 'openai',
        model: 'raw_database_error',
        promptVersion: 'pothole-vision-v1',
        schemaVersion: 'pothole-assessment-v1',
      }),
    ).resolves.toBe(false);
    expect(invokeRpc).not.toHaveBeenCalled();
  });

  it('is best-effort and never propagates database telemetry failures', async () => {
    await expect(
      recordAiOperationalEvent(
        vi.fn().mockRejectedValue(new Error('raw database error must not escape')),
        { ...baseEvent, eventType: 'analysis_disabled' },
      ),
    ).resolves.toBe(false);

    await expect(
      recordAiOperationalEvent(
        vi.fn().mockResolvedValue({ data: null, error: { message: 'unsafe raw error' } }),
        { ...baseEvent, eventType: 'analysis_disabled' },
      ),
    ).resolves.toBe(false);
  });

  it('bounds a stalled telemetry write so it cannot block the AI path', async () => {
    const stalled = vi.fn(
      () => new Promise<{ data: unknown; error: unknown }>(() => undefined),
    );

    await expect(
      recordAiOperationalEvent(
        stalled,
        {
          ...baseEvent,
          eventType: 'provider_started',
          provider: 'openai',
          model: 'gpt-5.6-terra',
          promptVersion: 'pothole-vision-v1',
          schemaVersion: 'pothole-assessment-v1',
        },
        5,
      ),
    ).resolves.toBe(false);
    expect(stalled).toHaveBeenCalledTimes(1);
  });
});
