import { describe, expect, it, vi } from 'vitest';

import {
  loadAdminAiAssessmentSummary,
  loadOptionalAdminAiAssessmentSummary,
  parseAdminAiAssessmentSummary,
  parsePotholeAiAssessment,
} from '../../supabase/functions/_shared/pothole-ai-assessment';

const providerAssessment = {
  classification: 'likely_pothole',
  confidence: 0.97,
  photoQuality: 'good',
  suggestedSeverity: 'DANGEROUS',
  visibleEvidence: ['Irregular cavity with broken asphalt edges'],
  cautions: ['Depth cannot be established without a reliable scale'],
  summary: 'The visible road surface contains damage consistent with a pothole.',
};

describe('pothole AI assessment validation', () => {
  it('accepts and normalizes the strict provider contract', () => {
    expect(
      parsePotholeAiAssessment({
        ...providerAssessment,
        summary: `  ${providerAssessment.summary}  `,
      }),
    ).toEqual(providerAssessment);
  });

  it.each([
    { ...providerAssessment, classification: 'crack' },
    { ...providerAssessment, confidence: -0.01 },
    { ...providerAssessment, confidence: 1.01 },
    { ...providerAssessment, suggestedSeverity: 'CRITICAL' },
    { ...providerAssessment, photoQuality: 'perfect' },
    { ...providerAssessment, visibleEvidence: Array(6).fill('evidence') },
    { ...providerAssessment, cautions: [''] },
    { ...providerAssessment, extra: 'not allowed' },
  ])('rejects an invalid structured provider result %#', (value) => {
    expect(parsePotholeAiAssessment(value)).toBeNull();
  });

  it('maps persisted data to a browser allowlist without private metadata', () => {
    const summary = parseAdminAiAssessmentSummary({
      assessment_count: 2,
      assessment: {
        provider: 'openai',
        model: 'gpt-5.6-terra',
        prompt_version: 'pothole-vision-v1',
        schema_version: 'pothole-assessment-v1',
        classification: providerAssessment.classification,
        confidence: providerAssessment.confidence,
        photo_quality: providerAssessment.photoQuality,
        suggested_severity: providerAssessment.suggestedSeverity,
        visible_evidence: providerAssessment.visibleEvidence,
        cautions: providerAssessment.cautions,
        summary: providerAssessment.summary,
        input_photo_count: 3,
        created_at: '2026-09-03T12:00:00.000Z',
        requested_by_user_id: 'must-not-leak-admin-id',
        provider_response_id: 'must-not-leak-provider-id',
        input_evidence_sha256: 'must-not-leak-fingerprint',
        storage_path: 'must-not-leak-storage-path',
        signed_url: 'must-not-leak-signed-url',
        reporter_user_id: 'must-not-leak-reporter-id',
      },
    });

    expect(summary).toEqual({
      assessment: {
        ...providerAssessment,
        provider: 'openai',
        model: 'gpt-5.6-terra',
        promptVersion: 'pothole-vision-v1',
        schemaVersion: 'pothole-assessment-v1',
        inputPhotoCount: 3,
        createdAt: '2026-09-03T12:00:00.000Z',
      },
      assessmentCount: 2,
    });

    const serialized = JSON.stringify(summary);
    for (const forbidden of [
      'must-not-leak-admin-id',
      'must-not-leak-provider-id',
      'must-not-leak-fingerprint',
      'must-not-leak-storage-path',
      'must-not-leak-signed-url',
      'must-not-leak-reporter-id',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('accepts the empty persisted state and rejects inconsistent counts', () => {
    expect(
      parseAdminAiAssessmentSummary({ assessment: null, assessment_count: 0 }),
    ).toEqual({ assessment: null, assessmentCount: 0 });

    expect(
      parseAdminAiAssessmentSummary({ assessment: null, assessment_count: 1 }),
    ).toBeNull();
    expect(
      parseAdminAiAssessmentSummary({ assessment: {}, assessment_count: 0 }),
    ).toBeNull();
  });

  it('loads the latest assessment through the production admin-detail RPC contract', async () => {
    const invokeRpc = vi.fn().mockResolvedValue({
      data: {
        outcome: 'OK',
        assessment_count: 1,
        assessment: {
          provider: 'openai',
          model: 'gpt-5.6-terra',
          prompt_version: 'pothole-vision-v1',
          schema_version: 'pothole-assessment-v1',
          classification: providerAssessment.classification,
          confidence: providerAssessment.confidence,
          photo_quality: providerAssessment.photoQuality,
          suggested_severity: providerAssessment.suggestedSeverity,
          visible_evidence: providerAssessment.visibleEvidence,
          cautions: providerAssessment.cautions,
          summary: providerAssessment.summary,
          input_photo_count: 2,
          created_at: '2026-09-03T12:00:00.000Z',
        },
      },
      error: null,
    });

    await expect(
      loadAdminAiAssessmentSummary(invokeRpc, {
        publicId: 'MTL-000003',
        actorUserId: '00000000-0000-4000-8000-000000000101',
      }),
    ).resolves.toMatchObject({
      assessment: { classification: 'likely_pothole' },
      assessmentCount: 1,
    });

    expect(invokeRpc).toHaveBeenCalledWith('admin_get_pothole_ai_summary', {
      p_public_id: 'MTL-000003',
      p_actor_user_id: '00000000-0000-4000-8000-000000000101',
    });
  });

  it('loads the explicit null/zero AI state and rejects RPC failures', async () => {
    await expect(
      loadAdminAiAssessmentSummary(
        vi.fn().mockResolvedValue({
          data: { outcome: 'OK', assessment: null, assessment_count: 0 },
          error: null,
        }),
        {
          publicId: 'MTL-000003',
          actorUserId: '00000000-0000-4000-8000-000000000101',
        },
      ),
    ).resolves.toEqual({ assessment: null, assessmentCount: 0 });

    await expect(
      loadAdminAiAssessmentSummary(
        vi.fn().mockResolvedValue({ data: null, error: { code: 'database_error' } }),
        {
          publicId: 'MTL-000003',
          actorUserId: '00000000-0000-4000-8000-000000000101',
        },
      ),
    ).resolves.toBeNull();
  });

  it('isolates rejected and malformed AI-summary reads behind an unavailable DTO', async () => {
    for (const invokeRpc of [
      vi.fn().mockResolvedValue({ data: null, error: { code: 'database_error' } }),
      vi.fn().mockRejectedValue(new Error('AI database unavailable')),
    ]) {
      await expect(
        loadOptionalAdminAiAssessmentSummary(invokeRpc, {
          publicId: 'MTL-000003',
          actorUserId: '00000000-0000-4000-8000-000000000101',
        }),
      ).resolves.toEqual({
        availability: 'unavailable',
        assessment: null,
        assessmentCount: null,
      });
    }
  });

  it('marks a successful empty AI-summary read available without inventing an assessment', async () => {
    await expect(
      loadOptionalAdminAiAssessmentSummary(
        vi.fn().mockResolvedValue({
          data: { outcome: 'OK', assessment: null, assessment_count: 0 },
          error: null,
        }),
        {
          publicId: 'MTL-000003',
          actorUserId: '00000000-0000-4000-8000-000000000101',
        },
      ),
    ).resolves.toEqual({
      availability: 'available',
      assessment: null,
      assessmentCount: 0,
    });
  });
});
