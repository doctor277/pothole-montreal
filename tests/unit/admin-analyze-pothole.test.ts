import { describe, expect, it, vi } from 'vitest';

import { handleAdminAnalyzePothole } from '../../supabase/functions/_shared/admin-analyze-pothole';
import { OpenAiPotholeAnalysisError } from '../../supabase/functions/_shared/openai-pothole-analysis';

const ADMIN_ID = '00000000-0000-4000-8000-000000000101';
const REQUEST_ID = '00000000-0000-4000-8000-000000000201';

const assessment = {
  classification: 'likely_pothole',
  confidence: 0.98,
  photoQuality: 'good',
  suggestedSeverity: 'MEDIUM',
  visibleEvidence: ['Localized cavity with broken asphalt edges'],
  cautions: ['Depth cannot be confirmed without a visual scale'],
  summary: 'The visible road damage is strongly consistent with a pothole.',
} as const;

function rawAssessment() {
  return {
    provider: 'openai',
    model: 'gpt-5.6-terra',
    prompt_version: 'pothole-vision-v1',
    schema_version: 'pothole-assessment-v1',
    classification: assessment.classification,
    confidence: assessment.confidence,
    photo_quality: assessment.photoQuality,
    suggested_severity: assessment.suggestedSeverity,
    visible_evidence: assessment.visibleEvidence,
    cautions: assessment.cautions,
    summary: assessment.summary,
    input_photo_count: 1,
    created_at: '2026-09-03T15:00:00.000Z',
    requested_by_user_id: 'must-not-leak-admin-id',
    storage_path: 'must-not-leak-storage-path',
    reporter_user_id: 'must-not-leak-reporter-id',
  };
}

function beginReady(photoCount = 1) {
  return {
    outcome: 'READY',
    photos: Array.from({ length: photoCount }, (_, index) => ({
      photo_id: `00000000-0000-4000-8000-00000000030${index}`,
      storage_path: `submissions/private/report-${index}.jpg`,
      mime_type: 'image/jpeg',
      file_size_bytes: 6,
      created_at: `2026-09-03T14:00:0${index}.000Z`,
    })),
  };
}

function createContext(input?: {
  user?: unknown | null;
  membership?: unknown | null;
  rpc?: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  download?: (path: string) => Promise<{ data: Blob | null; error: unknown }>;
}) {
  const getUser = vi.fn().mockResolvedValue({
    data: {
      user:
        input && 'user' in input
          ? input.user
          : { id: ADMIN_ID, email: 'admin@example.test', is_anonymous: false },
    },
    error: null,
  });
  const maybeSingle = vi.fn().mockResolvedValue({
    data:
      input && 'membership' in input
        ? input.membership
        : { is_active: true },
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn((table: string) => {
    if (table === 'admin_users') {
      return { select };
    }

    throw new Error('unexpected table access');
  });
  const rpc = vi.fn(
    input?.rpc ??
      (async (name: string) => {
        if (name === 'admin_begin_pothole_ai_analysis') {
          return { data: beginReady(), error: null };
        }
        if (name === 'admin_complete_pothole_ai_analysis') {
          return {
            data: { outcome: 'COMPLETED', assessment: rawAssessment(), assessment_count: 1 },
            error: null,
          };
        }
        if (name === 'admin_release_pothole_ai_analysis') {
          return { data: true, error: null };
        }
        if (name === 'record_pothole_ai_operational_event') {
          return { data: true, error: null };
        }
        throw new Error(`unexpected RPC ${name}`);
      }),
  );
  const download = vi.fn(
    input?.download ??
      (async () => ({
        data: new Blob([Uint8Array.of(0xff, 0xd8, 0xff, 0xd9, 0x01, 0x02)], {
          type: 'image/jpeg',
        }),
        error: null,
      })),
  );

  return {
    context: {
      supabase: { auth: { getUser } },
      supabaseAdmin: {
        from,
        rpc,
        storage: { from: vi.fn().mockReturnValue({ download }) },
      },
    } as never,
    rpc,
    download,
  };
}

function request(body: unknown): Request {
  return new Request('https://example.test/admin-analyze-pothole', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function dependencies(analyzePhotos = vi.fn().mockResolvedValue({
  assessment,
  providerResponseId: 'resp_safe_123',
})) {
  return {
    getAiAnalysisEnabled: () => 'true',
    getOpenAiApiKey: () => 'test-key',
    createRequestId: () => REQUEST_ID,
    analyzePhotos,
  };
}

describe('admin-analyze-pothole authorized shadow-mode path', () => {
  it('creates a production request ID without detaching Web Crypto randomUUID', async () => {
    const fake = createContext();
    const analyzePhotos = vi.fn().mockResolvedValue({
      assessment,
      providerResponseId: null,
    });

    const response = await handleAdminAnalyzePothole(
      request({ publicId: 'MTL-000003' }),
      fake.context,
      {
        getAiAnalysisEnabled: () => 'true',
        getOpenAiApiKey: () => 'test-key',
        analyzePhotos,
      },
    );

    expect(response.status).toBe(200);
    expect(fake.rpc.mock.calls[0][1].p_request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(analyzePhotos).toHaveBeenCalledTimes(1);
  });

  it('allows an active admin, persists one assessment, and returns only a safe DTO', async () => {
    const fake = createContext();
    const analyzePhotos = vi.fn().mockResolvedValue({
      assessment,
      providerResponseId: 'resp_safe_123',
    });

    const response = await handleAdminAnalyzePothole(
      request({ publicId: 'MTL-000003' }),
      fake.context,
      dependencies(analyzePhotos),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    const payload = await response.json();
    expect(payload).toEqual({
      assessment: {
        ...assessment,
        provider: 'openai',
        model: 'gpt-5.6-terra',
        promptVersion: 'pothole-vision-v1',
        schemaVersion: 'pothole-assessment-v1',
        inputPhotoCount: 1,
        createdAt: '2026-09-03T15:00:00.000Z',
      },
      assessmentCount: 1,
      shadowAutomation: {
        policyVersion: 'pothole-auto-verify-v2',
        technicallyEligible: false,
        technicalReasons: ['confidence_below_threshold'],
        automationOperationallyEnabled: false,
        actionPerformed: false,
      },
    });

    expect(analyzePhotos).toHaveBeenCalledTimes(1);
    expect(analyzePhotos.mock.calls[0][0].imageDataUrls).toHaveLength(1);
    expect(analyzePhotos.mock.calls[0][0].imageDataUrls[0]).toMatch(/^data:image\/jpeg;base64,/);

    const rpcNames = fake.rpc.mock.calls.map(([name]) => name);
    expect(rpcNames).toEqual([
      'admin_begin_pothole_ai_analysis',
      'record_pothole_ai_operational_event',
      'record_pothole_ai_operational_event',
      'admin_complete_pothole_ai_analysis',
      'record_pothole_ai_operational_event',
    ]);
    expect(rpcNames).not.toContain('admin_transition_pothole_status');

    const telemetryCalls = fake.rpc.mock.calls.filter(
      ([name]) => name === 'record_pothole_ai_operational_event',
    );
    expect(telemetryCalls.map(([, args]) => args.p_event_type)).toEqual([
      'provider_started',
      'provider_succeeded',
      'assessment_persisted',
    ]);
    expect(telemetryCalls.at(-1)?.[1]).toMatchObject({
      p_automation_operationally_enabled: false,
      p_action_performed: false,
    });
    const serializedTelemetry = JSON.stringify(telemetryCalls);
    for (const forbidden of [
      ADMIN_ID,
      'submissions/private',
      'storage_path',
      'signed_url',
      'reporter_user_id',
      'resp_safe_123',
      'test-key',
    ]) {
      expect(serializedTelemetry).not.toContain(forbidden);
    }

    const completionArgs = fake.rpc.mock.calls.find(
      ([name]) => name === 'admin_complete_pothole_ai_analysis',
    )?.[1];
    expect(completionArgs).toMatchObject({
      p_actor_user_id: ADMIN_ID,
      p_provider: 'openai',
      p_model: 'gpt-5.6-terra',
      p_prompt_version: 'pothole-vision-v1',
      p_schema_version: 'pothole-assessment-v1',
      p_input_photo_count: 1,
    });
    expect(completionArgs.p_input_evidence_sha256).toMatch(/^[0-9a-f]{64}$/);

    const serialized = JSON.stringify(payload);
    for (const forbidden of [
      'must-not-leak-admin-id',
      'must-not-leak-storage-path',
      'must-not-leak-reporter-id',
      'submissions/private',
      'resp_safe_123',
      REQUEST_ID,
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('caps the provider input at the three server-selected photos', async () => {
    const fake = createContext({
      rpc: async (name) => {
        if (name === 'admin_begin_pothole_ai_analysis') {
          return { data: beginReady(3), error: null };
        }
        if (name === 'admin_complete_pothole_ai_analysis') {
          return {
            data: {
              outcome: 'COMPLETED',
              assessment: { ...rawAssessment(), input_photo_count: 3 },
              assessment_count: 1,
            },
            error: null,
          };
        }
        return { data: true, error: null };
      },
    });
    const analyzePhotos = vi.fn().mockResolvedValue({ assessment, providerResponseId: null });

    const response = await handleAdminAnalyzePothole(
      request({ publicId: 'MTL-000003' }),
      fake.context,
      dependencies(analyzePhotos),
    );

    expect(response.status).toBe(200);
    expect(analyzePhotos.mock.calls[0][0].imageDataUrls).toHaveLength(3);
  });

  it('retries only idempotent database completion after an ambiguous error', async () => {
    let completionCalls = 0;
    const fake = createContext({
      rpc: async (name) => {
        if (name === 'admin_begin_pothole_ai_analysis') {
          return { data: beginReady(), error: null };
        }
        if (name === 'admin_complete_pothole_ai_analysis') {
          completionCalls += 1;
          return completionCalls === 1
            ? { data: null, error: { code: 'network' } }
            : {
                data: {
                  outcome: 'ALREADY_COMPLETED',
                  assessment: rawAssessment(),
                  assessment_count: 1,
                },
                error: null,
              };
        }
        return { data: true, error: null };
      },
    });
    const analyzePhotos = vi.fn().mockResolvedValue({ assessment, providerResponseId: null });

    const response = await handleAdminAnalyzePothole(
      request({ publicId: 'MTL-000003' }),
      fake.context,
      dependencies(analyzePhotos),
    );

    expect(response.status).toBe(200);
    expect(completionCalls).toBe(2);
    expect(analyzePhotos).toHaveBeenCalledTimes(1);
  });

  it('keeps duplicate-call protection after two ambiguous persistence failures', async () => {
    const fake = createContext({
      rpc: async (name) => {
        if (name === 'admin_begin_pothole_ai_analysis') {
          return { data: beginReady(), error: null };
        }
        if (name === 'admin_complete_pothole_ai_analysis') {
          return { data: null, error: { code: 'network' } };
        }
        return { data: true, error: null };
      },
    });
    const analyzePhotos = vi.fn().mockResolvedValue({ assessment, providerResponseId: null });

    const response = await handleAdminAnalyzePothole(
      request({ publicId: 'MTL-000003' }),
      fake.context,
      dependencies(analyzePhotos),
    );

    expect(response.status).toBe(503);
    expect(analyzePhotos).toHaveBeenCalledTimes(1);
    const rpcNames = fake.rpc.mock.calls.map(([name]) => name);
    expect(
      rpcNames.filter((name) => name === 'admin_complete_pothole_ai_analysis'),
    ).toHaveLength(2);
    expect(rpcNames).not.toContain('admin_release_pothole_ai_analysis');
  });

  it('fingerprints the exact image bytes rather than only photo metadata', async () => {
    async function fingerprintFor(bytes: number[]) {
      const fake = createContext({
        download: async () => ({
          data: new Blob([Uint8Array.from(bytes)], { type: 'image/jpeg' }),
          error: null,
        }),
      });

      const response = await handleAdminAnalyzePothole(
        request({ publicId: 'MTL-000003' }),
        fake.context,
        dependencies(),
      );

      expect(response.status).toBe(200);
      return fake.rpc.mock.calls.find(
        ([name]) => name === 'admin_complete_pothole_ai_analysis',
      )?.[1].p_input_evidence_sha256;
    }

    const first = await fingerprintFor([0xff, 0xd8, 0xff, 0xd9, 0x01, 0x02]);
    const second = await fingerprintFor([0xff, 0xd8, 0xff, 0xd9, 0x03, 0x04]);

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toBe(second);
  });
});

describe('admin-analyze-pothole authorization and safe failures', () => {
  it.each([
    [{ id: 'anon', email: null, is_anonymous: true }, { is_active: true }, 403],
    [{ id: 'user', email: 'user@example.test', is_anonymous: false }, null, 403],
  ])('denies anonymous and non-admin users before AI work', async (user, membership, status) => {
    const fake = createContext({ user, membership });
    const analyzePhotos = vi.fn();
    const getAiAnalysisEnabled = vi.fn().mockReturnValue(undefined);

    const response = await handleAdminAnalyzePothole(
      request({ publicId: 'MTL-000003' }),
      fake.context,
      { ...dependencies(analyzePhotos), getAiAnalysisEnabled },
    );

    expect(response.status).toBe(status);
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(analyzePhotos).not.toHaveBeenCalled();
    expect(getAiAnalysisEnabled).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 'false', 'TRUE', ' true ', '1'])(
    'fails closed for AI_ANALYSIS_ENABLED=%s before evidence or secret access',
    async (configuredValue) => {
      const fake = createContext();
      const analyzePhotos = vi.fn();
      const getOpenAiApiKey = vi.fn().mockReturnValue(undefined);

      const response = await handleAdminAnalyzePothole(
        request({ publicId: 'MTL-000003' }),
        fake.context,
        {
          ...dependencies(analyzePhotos),
          getAiAnalysisEnabled: () => configuredValue,
          getOpenAiApiKey,
        },
      );

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ error: 'ai_disabled' });
      expect(fake.rpc).toHaveBeenCalledTimes(1);
      expect(fake.rpc).toHaveBeenCalledWith(
        'record_pothole_ai_operational_event',
        expect.objectContaining({
          p_public_id: 'MTL-000003',
          p_request_id: REQUEST_ID,
          p_event_type: 'analysis_disabled',
        }),
      );
      expect(fake.download).not.toHaveBeenCalled();
      expect(getOpenAiApiKey).not.toHaveBeenCalled();
      expect(analyzePhotos).not.toHaveBeenCalled();
    },
  );

  it('rejects a malformed public ID through the existing production parser', async () => {
    const fake = createContext();
    const response = await handleAdminAnalyzePothole(
      request({ publicId: 'MTL-3' }),
      fake.context,
      dependencies(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_request' });
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['NOT_FOUND', 404, 'pothole_not_found'],
    ['NO_USABLE_PHOTOS', 422, 'no_usable_photos'],
  ] as const)('maps %s without making a paid provider call', async (outcome, status, code) => {
    const fake = createContext({
      rpc: async () => ({ data: { outcome, photos: [] }, error: null }),
    });
    const analyzePhotos = vi.fn();

    const response = await handleAdminAnalyzePothole(
      request({ publicId: 'MTL-000003' }),
      fake.context,
      dependencies(analyzePhotos),
    );

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: code });
    expect(analyzePhotos).not.toHaveBeenCalled();
  });

  it.each([
    ['timeout', 504, 'ai_timeout'],
    ['rate_limited', 429, 'ai_rate_limited'],
    ['invalid_response', 502, 'invalid_ai_response'],
    ['unavailable', 503, 'ai_unavailable'],
  ] as const)('sanitizes provider %s failures', async (providerCode, status, browserCode) => {
    const fake = createContext();
    const analyzePhotos = vi.fn().mockRejectedValue(new OpenAiPotholeAnalysisError(providerCode));

    const response = await handleAdminAnalyzePothole(
      request({ publicId: 'MTL-000003' }),
      fake.context,
      dependencies(analyzePhotos),
    );

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: browserCode });
    const rpcNames = fake.rpc.mock.calls.map(([name]) => name);
    expect(rpcNames).toContain('admin_release_pothole_ai_analysis');
    expect(rpcNames).not.toContain('admin_complete_pothole_ai_analysis');
    expect(analyzePhotos).toHaveBeenCalledTimes(1);
    expect(fake.rpc).toHaveBeenCalledWith(
      'record_pothole_ai_operational_event',
      expect.objectContaining({
        p_event_type: `provider_${providerCode}`,
      }),
    );
  });

  it('keeps assessment persistence successful when best-effort telemetry fails', async () => {
    const fake = createContext({
      rpc: async (name) => {
        if (name === 'admin_begin_pothole_ai_analysis') {
          return { data: beginReady(), error: null };
        }
        if (name === 'admin_complete_pothole_ai_analysis') {
          return {
            data: { outcome: 'COMPLETED', assessment: rawAssessment(), assessment_count: 1 },
            error: null,
          };
        }
        if (name === 'record_pothole_ai_operational_event') {
          return { data: null, error: { message: 'telemetry unavailable' } };
        }
        return { data: true, error: null };
      },
    });

    const response = await handleAdminAnalyzePothole(
      request({ publicId: 'MTL-000003' }),
      fake.context,
      dependencies(),
    );

    expect(response.status).toBe(200);
    expect(
      fake.rpc.mock.calls.filter(([name]) => name === 'admin_complete_pothole_ai_analysis'),
    ).toHaveLength(1);
  });

  it('records a persistence failure without fabricating an assessment', async () => {
    const fake = createContext({
      rpc: async (name) => {
        if (name === 'admin_begin_pothole_ai_analysis') {
          return { data: beginReady(), error: null };
        }
        if (name === 'admin_complete_pothole_ai_analysis') {
          return { data: null, error: { code: 'database_unavailable' } };
        }
        return { data: true, error: null };
      },
    });

    const response = await handleAdminAnalyzePothole(
      request({ publicId: 'MTL-000003' }),
      fake.context,
      dependencies(),
    );

    expect(response.status).toBe(503);
    expect(fake.rpc).toHaveBeenCalledWith(
      'record_pothole_ai_operational_event',
      expect.objectContaining({ p_event_type: 'persistence_failure' }),
    );
    const payload = await response.json();
    expect(payload).toEqual({ error: 'ai_unavailable' });
    expect(JSON.stringify(payload)).not.toContain('assessment');
  });

  it('does not call the provider when the server-only OpenAI key is absent', async () => {
    const fake = createContext();
    const analyzePhotos = vi.fn();

    const response = await handleAdminAnalyzePothole(
      request({ publicId: 'MTL-000003' }),
      fake.context,
      {
        ...dependencies(analyzePhotos),
        getOpenAiApiKey: () => undefined,
      },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'ai_unavailable' });
    expect(analyzePhotos).not.toHaveBeenCalled();
    expect(fake.rpc.mock.calls.map(([name]) => name)).toContain(
      'admin_release_pothole_ai_analysis',
    );
  });

  it('does not call the provider when selected Storage evidence is unusable', async () => {
    const fake = createContext({
      download: async () => ({
        data: new Blob([Uint8Array.of(0x00, 0x01, 0x02)], { type: 'image/jpeg' }),
        error: null,
      }),
    });
    const analyzePhotos = vi.fn();

    const response = await handleAdminAnalyzePothole(
      request({ publicId: 'MTL-000003' }),
      fake.context,
      dependencies(analyzePhotos),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: 'no_usable_photos' });
    expect(analyzePhotos).not.toHaveBeenCalled();
  });

  it('bounds stalled private Storage reads before any paid provider call', async () => {
    const fake = createContext({
      download: () =>
        new Promise<{ data: Blob | null; error: unknown }>(() => undefined),
    });
    const analyzePhotos = vi.fn();

    const response = await handleAdminAnalyzePothole(
      request({ publicId: 'MTL-000003' }),
      fake.context,
      {
        ...dependencies(analyzePhotos),
        evidenceLoadTimeoutMs: 5,
      },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'ai_unavailable' });
    expect(analyzePhotos).not.toHaveBeenCalled();
    expect(fake.rpc.mock.calls.map(([name]) => name)).toContain(
      'admin_release_pothole_ai_analysis',
    );
  });
});
