import { describe, expect, it, vi } from 'vitest';

import {
  OPENAI_POTHOLE_MODEL,
  OPENAI_POTHOLE_PROMPT_VERSION,
  OPENAI_POTHOLE_SCHEMA_VERSION,
  OpenAiPotholeAnalysisError,
  analyzePotholePhotos,
} from '../../supabase/functions/_shared/openai-pothole-analysis';

const validAssessment = {
  classification: 'likely_pothole',
  confidence: 0.99,
  photoQuality: 'good',
  suggestedSeverity: 'MEDIUM',
  visibleEvidence: ['Broken asphalt edges surround a localized cavity'],
  cautions: ['Exact depth is not visible without a scale'],
  summary: 'Visible damage is strongly consistent with a pothole.',
};

const tinyJpeg = 'data:image/jpeg;base64,/9j/2Q==';

function completedResponse(assessment: unknown = validAssessment): Response {
  return Response.json({
    id: 'resp_safe_123',
    status: 'completed',
    output: [
      {
        type: 'message',
        content: [{ type: 'output_text', text: JSON.stringify(assessment) }],
      },
    ],
  });
}

describe('OpenAI pothole analysis provider boundary', () => {
  it('maps a real Responses-style success and sends only structured visual input', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(completedResponse());

    await expect(
      analyzePotholePhotos({
        apiKey: 'test-key-never-logged',
        imageDataUrls: [tinyJpeg, tinyJpeg],
        fetchImpl,
      }),
    ).resolves.toEqual({
      assessment: validAssessment,
      providerResponseId: 'resp_safe_123',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse(String(init.body));

    expect(body.model).toBe(OPENAI_POTHOLE_MODEL);
    expect(body.store).toBe(false);
    expect(body.text.format).toMatchObject({
      type: 'json_schema',
      strict: true,
      name: 'pothole_visual_assessment',
    });
    expect(body.input[0].content.filter((item: { type: string }) => item.type === 'input_image'))
      .toHaveLength(2);

    const serializedBody = JSON.stringify(body);
    for (const forbidden of [
      'reporter_user_id',
      'requested_by_user_id',
      'latitude',
      'longitude',
      'formatted_address',
      'postal_code',
      'submission_id',
      'storage_path',
      'authorization',
    ]) {
      expect(serializedBody.toLowerCase()).not.toContain(forbidden);
    }
  });

  it.each([
    ['classification', { ...validAssessment, classification: 'crack' }],
    ['low confidence', { ...validAssessment, confidence: -0.1 }],
    ['high confidence', { ...validAssessment, confidence: 1.1 }],
    ['severity', { ...validAssessment, suggestedSeverity: 'CRITICAL' }],
  ])('rejects an invalid structured %s', async (_label, assessment) => {
    await expect(
      analyzePotholePhotos({
        apiKey: 'test-key',
        imageDataUrls: [tinyJpeg],
        fetchImpl: vi.fn().mockResolvedValue(completedResponse(assessment)),
      }),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('sanitizes provider rate limits and generic failures without retrying', async () => {
    const rateLimitedFetch = vi.fn().mockResolvedValue(new Response(null, { status: 429 }));
    await expect(
      analyzePotholePhotos({
        apiKey: 'test-key',
        imageDataUrls: [tinyJpeg],
        fetchImpl: rateLimitedFetch,
      }),
    ).rejects.toEqual(new OpenAiPotholeAnalysisError('rate_limited'));
    expect(rateLimitedFetch).toHaveBeenCalledTimes(1);

    const failedFetch = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    await expect(
      analyzePotholePhotos({
        apiKey: 'test-key',
        imageDataUrls: [tinyJpeg],
        fetchImpl: failedFetch,
      }),
    ).rejects.toMatchObject({ code: 'unavailable' });
    expect(failedFetch).toHaveBeenCalledTimes(1);
  });

  it('uses a bounded abort timeout and returns only a safe timeout code', async () => {
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('request aborted', 'AbortError'));
        });
      }));

    await expect(
      analyzePotholePhotos({
        apiKey: 'test-key',
        imageDataUrls: [tinyJpeg],
        timeoutMs: 5,
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'timeout' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps the timeout active while a response body is still being read', async () => {
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve({
        status: 200,
        ok: true,
        json: () =>
          new Promise<unknown>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('response body aborted', 'AbortError'));
            });
          }),
      } as Response));

    await expect(
      analyzePotholePhotos({
        apiKey: 'test-key',
        imageDataUrls: [tinyJpeg],
        timeoutMs: 5,
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'timeout' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps the requested model, prompt version, and schema version centralized', () => {
    expect(OPENAI_POTHOLE_MODEL).toBe('gpt-5.6-terra');
    expect(OPENAI_POTHOLE_PROMPT_VERSION).toBe('pothole-vision-v1');
    expect(OPENAI_POTHOLE_SCHEMA_VERSION).toBe('pothole-assessment-v1');
  });
});
