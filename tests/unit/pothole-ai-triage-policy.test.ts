import { describe, expect, it } from 'vitest';

import {
  evaluatePotholeAiTriage,
  POTHOLE_AI_TRIAGE_POLICY_V1,
  type TriageAssessment,
} from '../../supabase/functions/_shared/pothole-ai-triage-policy';

const assessment: TriageAssessment = {
  classification: 'likely_pothole', confidence: 0.99, photoQuality: 'good',
  suggestedSeverity: 'MEDIUM', inputPhotoCount: 2,
  model: 'gpt-5.6-terra', promptVersion: 'pothole-vision-v1', schemaVersion: 'pothole-assessment-v1',
};
const evaluate = (override: Partial<TriageAssessment> = {}, stale = false) =>
  evaluatePotholeAiTriage({ assessment: { ...assessment, ...override }, evidenceChangedSinceAssessment: stale });

describe('immutable, pure shadow AI triage v1', () => {
  it('owns all historical criteria independently of provider or environment defaults', () => {
    expect(POTHOLE_AI_TRIAGE_POLICY_V1).toEqual({
      triageVersion: 'pothole-ai-triage-v1', highConfidenceThreshold: 0.99,
      requireGoodPhoto: true, requireKnownSeverity: true, minimumPhotoCount: 1,
      approvedModels: ['gpt-5.6-terra'], approvedPromptVersions: ['pothole-vision-v1'],
      approvedSchemaVersions: ['pothole-assessment-v1'],
    });
    expect(Object.isFrozen(POTHOLE_AI_TRIAGE_POLICY_V1)).toBe(true);
    expect(Object.isFrozen(POTHOLE_AI_TRIAGE_POLICY_V1.approvedModels)).toBe(true);
    expect(() => evaluatePotholeAiTriage({ assessment, evidenceChangedSinceAssessment: false }, 'v99' as never))
      .toThrow('Unsupported pothole AI triage version');
  });
  it('returns no_assessment without inventing evidence', () => {
    expect(evaluatePotholeAiTriage({ assessment: null, evidenceChangedSinceAssessment: false }))
      .toMatchObject({ category: 'no_assessment', reasons: ['no_ai_assessment'], shadowOnly: true });
  });
  it('makes new citizen evidence override even perfect high-confidence evidence', () => {
    expect(evaluate({}, true)).toEqual({
      triageVersion: 'pothole-ai-triage-v1', category: 'stale_assessment',
      priorityBand: 'normal', reasons: ['newer_citizen_evidence'], shadowOnly: true,
    });
  });
  it('returns only a high review hint for approved, current, good evidence at the threshold', () => {
    expect(evaluate()).toEqual({
      triageVersion: 'pothole-ai-triage-v1', category: 'high_confidence_likely_pothole',
      priorityBand: 'high', reasons: ['high_confidence_visual_evidence'], shadowOnly: true,
    });
  });
  it.each([
    [{ confidence: 0.989 }, 'likely_pothole_review', 'confidence_below_high_threshold'],
    [{ photoQuality: 'usable' }, 'likely_pothole_review', 'photo_quality_not_good'],
    [{ suggestedSeverity: 'unknown' }, 'likely_pothole_review', 'suggested_severity_unknown'],
    [{ classification: 'uncertain' }, 'uncertain', 'classification_uncertain'],
    [{ photoQuality: 'poor' }, 'poor_evidence', 'poor_photo_quality'],
    [{ inputPhotoCount: 0 }, 'poor_evidence', 'insufficient_photo_evidence'],
    [{ classification: 'unlikely_pothole' }, 'likely_not_pothole', 'classification_unlikely_pothole'],
    [{ model: 'gpt-future-provider' }, 'uncertain', 'model_not_approved'],
    [{ promptVersion: 'pothole-vision-v99' }, 'uncertain', 'prompt_version_not_approved'],
    [{ schemaVersion: 'pothole-assessment-v99' }, 'uncertain', 'schema_version_not_approved'],
  ] as const)('classifies %o safely as %s', (override, category, reason) => {
    expect(evaluate(override)).toMatchObject({ category, reasons: [reason], shadowOnly: true });
  });
  it('keeps reason order deterministic and does not mutate inputs', () => {
    const input = Object.freeze({ ...assessment, confidence: 0.1, photoQuality: 'usable' as const, suggestedSeverity: 'unknown' as const });
    const before = structuredClone(input);
    const result = evaluatePotholeAiTriage({ assessment: input, evidenceChangedSinceAssessment: false });
    expect(result.reasons).toEqual(['confidence_below_high_threshold', 'photo_quality_not_good', 'suggested_severity_unknown']);
    expect(input).toEqual(before);
    expect(evaluatePotholeAiTriage({ assessment: input, evidenceChangedSinceAssessment: false })).toEqual(result);
    expect(Object.keys(result).sort()).toEqual(['category', 'priorityBand', 'reasons', 'shadowOnly', 'triageVersion']);
    expect(evaluate({ model: 'gpt-other', promptVersion: 'pothole-vision-v2', schemaVersion: 'pothole-assessment-v2' }).reasons)
      .toEqual(['model_not_approved', 'prompt_version_not_approved', 'schema_version_not_approved']);
  });
});
