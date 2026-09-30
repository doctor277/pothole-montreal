import { describe, expect, it, vi } from 'vitest';

import { isAiAnalysisEnabled } from '../../supabase/functions/_shared/ai-operational-guardrails';
import {
  DEFAULT_POTHOLE_AUTO_VERIFY_POLICY,
  POTHOLE_AUTO_VERIFY_POLICY_V2,
  buildPotholeAutoVerifyShadowDecision,
  evaluatePotholeAutoVerifyEligibility,
  replayPotholeAutoVerifyPolicy,
  resolvePotholeAutoVerifyPolicy,
} from '../../supabase/functions/_shared/pothole-ai-decision-policy';

const assessment = {
  classification: 'likely_pothole',
  confidence: 1,
  photoQuality: 'good',
  suggestedSeverity: 'MEDIUM',
  visibleEvidence: ['A visible asphalt cavity'],
  cautions: [],
  summary: 'Visible damage is consistent with a pothole.',
  provider: 'openai',
  model: 'gpt-5.6-terra',
  promptVersion: 'pothole-vision-v1',
  schemaVersion: 'pothole-assessment-v1',
  inputPhotoCount: 2,
  createdAt: '2026-09-15T12:00:00.000Z',
} as const;

describe('AI operational guardrails', () => {
  it.each([undefined, '', 'false', 'TRUE', ' true ', '1', 'yes'])(
    'keeps analysis disabled for %s',
    (value) => {
      expect(isAiAnalysisEnabled(value)).toBe(false);
    },
  );

  it('enables analysis only for the exact server-side value true', () => {
    expect(isAiAnalysisEnabled('true')).toBe(true);
  });
});

describe('pothole auto-verify shadow policy', () => {
  it('defaults automation off even for a perfect likely-pothole assessment', () => {
    expect(DEFAULT_POTHOLE_AUTO_VERIFY_POLICY.automationEnabled).toBe(false);
    expect(evaluatePotholeAutoVerifyEligibility(assessment)).toEqual({
      policyVersion: 'pothole-auto-verify-v1',
      eligible: false,
      reasons: ['automation_disabled'],
    });
  });

  it('can mark qualifying evidence shadow-eligible without performing an action', () => {
    const result = evaluatePotholeAutoVerifyEligibility(assessment, {
      ...DEFAULT_POTHOLE_AUTO_VERIFY_POLICY,
      automationEnabled: true,
    });

    expect(result).toEqual({
      policyVersion: 'pothole-auto-verify-v1',
      eligible: true,
      reasons: [],
    });
    expect(Object.keys(result).sort()).toEqual(['eligible', 'policyVersion', 'reasons']);
  });

  it.each([
    [{ confidence: 0.989 }, 'confidence_below_threshold'],
    [{ classification: 'uncertain' }, 'classification_not_likely_pothole'],
    [{ classification: 'unlikely_pothole' }, 'classification_not_likely_pothole'],
    [{ photoQuality: 'usable' }, 'photo_quality_not_good'],
    [{ photoQuality: 'poor' }, 'photo_quality_not_good'],
    [{ suggestedSeverity: 'unknown' }, 'suggested_severity_unknown'],
    [{ model: 'unapproved-model' }, 'model_not_approved'],
    [{ promptVersion: 'unapproved-prompt' }, 'prompt_version_not_approved'],
    [{ schemaVersion: 'unapproved-schema' }, 'schema_version_not_approved'],
  ] as const)('rejects %o with the deterministic reason %s', (override, reason) => {
    const result = evaluatePotholeAutoVerifyEligibility(
      { ...assessment, ...override },
      { ...DEFAULT_POTHOLE_AUTO_VERIFY_POLICY, automationEnabled: true },
    );

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain(reason);
  });

  it('returns all failure reasons in stable policy order without mutating the assessment', () => {
    const input = {
      ...assessment,
      classification: 'uncertain' as const,
      confidence: 0.2,
      photoQuality: 'poor' as const,
      suggestedSeverity: 'unknown' as const,
      model: 'old-model',
      promptVersion: 'old-prompt',
      schemaVersion: 'old-schema',
    };
    const before = structuredClone(input);

    expect(evaluatePotholeAutoVerifyEligibility(input)).toEqual({
      policyVersion: 'pothole-auto-verify-v1',
      eligible: false,
      reasons: [
        'automation_disabled',
        'classification_not_likely_pothole',
        'confidence_below_threshold',
        'photo_quality_not_good',
        'suggested_severity_unknown',
        'model_not_approved',
        'prompt_version_not_approved',
        'schema_version_not_approved',
      ],
    });
    expect(input).toEqual(before);
  });

  it('loads fail-closed environment configuration with safe threshold defaults', () => {
    expect(resolvePotholeAutoVerifyPolicy({})).toEqual(DEFAULT_POTHOLE_AUTO_VERIFY_POLICY);
    expect(
      resolvePotholeAutoVerifyPolicy({
        automationEnabled: 'true',
        minimumConfidence: '0.995',
        requireGoodPhoto: 'false',
      }),
    ).toMatchObject({
      automationEnabled: true,
      minimumConfidence: 0.995,
      requireGoodPhoto: false,
    });
    expect(
      resolvePotholeAutoVerifyPolicy({
        automationEnabled: 'TRUE',
        minimumConfidence: 'not-a-number',
        requireGoodPhoto: 'malformed',
      }),
    ).toMatchObject({
      automationEnabled: false,
      minimumConfidence: 0.99,
      requireGoodPhoto: true,
    });
  });
});

describe('pothole auto-verify v2 replay policy', () => {
  it('locks the exact historical provider criteria owned by policy v2', () => {
    expect(POTHOLE_AUTO_VERIFY_POLICY_V2).toMatchObject({
      policyVersion: 'pothole-auto-verify-v2',
      minimumConfidence: 0.99,
      requireGoodPhoto: true,
      requireSuggestedSeverity: true,
      minimumPhotoCount: 1,
      approvedModels: ['gpt-5.6-terra'],
      approvedPromptVersions: ['pothole-vision-v1'],
      approvedSchemaVersions: ['pothole-assessment-v1'],
    });

    expect(
      replayPotholeAutoVerifyPolicy(assessment, 'pothole-auto-verify-v2'),
    ).toMatchObject({ technicallyEligible: true, technicalReasons: [] });
  });

  it('does not let future live provider defaults redefine policy v2', async () => {
    vi.resetModules();
    vi.doMock(
      '../../supabase/functions/_shared/openai-pothole-analysis.ts',
      () => ({
        OPENAI_POTHOLE_MODEL: 'gpt-future-provider',
        OPENAI_POTHOLE_PROMPT_VERSION: 'pothole-vision-v99',
        OPENAI_POTHOLE_SCHEMA_VERSION: 'pothole-assessment-v99',
      }),
    );

    try {
      const policyModule = await import(
        '../../supabase/functions/_shared/pothole-ai-decision-policy'
      );

      expect(policyModule.POTHOLE_AUTO_VERIFY_POLICY_V2).toMatchObject({
        approvedModels: ['gpt-5.6-terra'],
        approvedPromptVersions: ['pothole-vision-v1'],
        approvedSchemaVersions: ['pothole-assessment-v1'],
      });
      expect(
        policyModule.replayPotholeAutoVerifyPolicy(
          assessment,
          'pothole-auto-verify-v2',
        ),
      ).toMatchObject({ technicallyEligible: true, technicalReasons: [] });
      expect(
        policyModule.replayPotholeAutoVerifyPolicy(
          {
            ...assessment,
            model: 'gpt-future-provider',
            promptVersion: 'pothole-vision-v99',
            schemaVersion: 'pothole-assessment-v99',
          },
          'pothole-auto-verify-v2',
        ),
      ).toMatchObject({
        technicallyEligible: false,
        technicalReasons: [
          'model_not_approved',
          'prompt_version_not_approved',
          'schema_version_not_approved',
        ],
      });
    } finally {
      vi.doUnmock('../../supabase/functions/_shared/openai-pothole-analysis.ts');
      vi.resetModules();
    }
  });

  it('separates technical eligibility from operational enablement', () => {
    expect(buildPotholeAutoVerifyShadowDecision(assessment, undefined)).toEqual({
      policyVersion: 'pothole-auto-verify-v2',
      technicallyEligible: true,
      technicalReasons: [],
      automationOperationallyEnabled: false,
      actionPerformed: false,
    });
  });

  it('does not let the runtime flag redefine technical eligibility', () => {
    const disabled = buildPotholeAutoVerifyShadowDecision(assessment, 'false');
    const enabled = buildPotholeAutoVerifyShadowDecision(assessment, 'true');

    expect(disabled.technicallyEligible).toBe(true);
    expect(enabled.technicallyEligible).toBe(true);
    expect(disabled.technicalReasons).toEqual(enabled.technicalReasons);
    expect(disabled.automationOperationallyEnabled).toBe(false);
    expect(enabled.automationOperationallyEnabled).toBe(true);
    expect(disabled.actionPerformed).toBe(false);
    expect(enabled.actionPerformed).toBe(false);
  });

  it.each([undefined, '', 'false', 'TRUE', ' true ', '1'])(
    'keeps operational automation disabled for %s',
    (value) => {
      expect(
        buildPotholeAutoVerifyShadowDecision(assessment, value)
          .automationOperationallyEnabled,
      ).toBe(false);
    },
  );

  it.each([
    [{ confidence: 0.989 }, 'confidence_below_threshold'],
    [{ classification: 'uncertain' }, 'classification_not_likely_pothole'],
    [{ classification: 'unlikely_pothole' }, 'classification_not_likely_pothole'],
    [{ photoQuality: 'usable' }, 'photo_quality_not_good'],
    [{ photoQuality: 'poor' }, 'photo_quality_not_good'],
    [{ suggestedSeverity: 'unknown' }, 'suggested_severity_unknown'],
    [{ model: 'unapproved-model' }, 'model_not_approved'],
    [{ promptVersion: 'unapproved-prompt' }, 'prompt_version_not_approved'],
    [{ schemaVersion: 'unapproved-schema' }, 'schema_version_not_approved'],
    [{ inputPhotoCount: 0 }, 'insufficient_photo_evidence'],
  ] as const)('replays %o as technically ineligible because %s', (override, reason) => {
    const result = replayPotholeAutoVerifyPolicy(
      { ...assessment, ...override },
      'pothole-auto-verify-v2',
    );

    expect(result.technicallyEligible).toBe(false);
    expect(result.technicalReasons).toContain(reason);
  });

  it('binds the explicit version to frozen technical criteria', () => {
    expect(Object.isFrozen(POTHOLE_AUTO_VERIFY_POLICY_V2)).toBe(true);
    expect(POTHOLE_AUTO_VERIFY_POLICY_V2.minimumConfidence).toBe(0.99);
    expect(POTHOLE_AUTO_VERIFY_POLICY_V2.requireGoodPhoto).toBe(true);

    expect(() =>
      replayPotholeAutoVerifyPolicy(assessment, 'pothole-auto-verify-v999' as never),
    ).toThrow('Unsupported pothole auto-verify policy version');
  });

  it('returns deterministic reasons without mutating immutable assessment input', () => {
    const input = {
      ...assessment,
      classification: 'uncertain' as const,
      confidence: 0.1,
      photoQuality: 'poor' as const,
      suggestedSeverity: 'unknown' as const,
      model: 'old-model',
      promptVersion: 'old-prompt',
      schemaVersion: 'old-schema',
      inputPhotoCount: 0,
    };
    const before = structuredClone(input);

    expect(replayPotholeAutoVerifyPolicy(input, 'pothole-auto-verify-v2')).toEqual({
      policyVersion: 'pothole-auto-verify-v2',
      technicallyEligible: false,
      technicalReasons: [
        'classification_not_likely_pothole',
        'confidence_below_threshold',
        'photo_quality_not_good',
        'suggested_severity_unknown',
        'model_not_approved',
        'prompt_version_not_approved',
        'schema_version_not_approved',
        'insufficient_photo_evidence',
      ],
    });
    expect(input).toEqual(before);
  });
});
