export const POTHOLE_AI_TRIAGE_VERSION = 'pothole-ai-triage-v1';

// Historical policy-owned literals, deliberately independent of provider/env defaults.
export const POTHOLE_AI_TRIAGE_POLICY_V1 = Object.freeze({
  triageVersion: POTHOLE_AI_TRIAGE_VERSION,
  highConfidenceThreshold: 0.99,
  requireGoodPhoto: true,
  requireKnownSeverity: true,
  minimumPhotoCount: 1,
  approvedModels: Object.freeze(['gpt-5.6-terra']),
  approvedPromptVersions: Object.freeze(['pothole-vision-v1']),
  approvedSchemaVersions: Object.freeze(['pothole-assessment-v1']),
});

export type TriageAssessment = {
  classification: 'likely_pothole' | 'uncertain' | 'unlikely_pothole';
  confidence: number;
  photoQuality: 'good' | 'usable' | 'poor';
  suggestedSeverity: 'SMALL' | 'MEDIUM' | 'DANGEROUS' | 'unknown';
  inputPhotoCount: number;
  model: string;
  promptVersion: string;
  schemaVersion: string;
};

export type PotholeAiTriageCategory =
  | 'no_assessment'
  | 'stale_assessment'
  | 'high_confidence_likely_pothole'
  | 'likely_pothole_review'
  | 'uncertain'
  | 'poor_evidence'
  | 'likely_not_pothole';

export type PotholeAiTriageReason =
  | 'no_ai_assessment'
  | 'newer_citizen_evidence'
  | 'model_not_approved'
  | 'prompt_version_not_approved'
  | 'schema_version_not_approved'
  | 'insufficient_photo_evidence'
  | 'poor_photo_quality'
  | 'classification_uncertain'
  | 'classification_unlikely_pothole'
  | 'confidence_below_high_threshold'
  | 'photo_quality_not_good'
  | 'suggested_severity_unknown'
  | 'high_confidence_visual_evidence';

export type PotholeAiTriageDto = {
  triageVersion: typeof POTHOLE_AI_TRIAGE_VERSION;
  category: PotholeAiTriageCategory;
  priorityBand: 'high' | 'normal' | 'low';
  reasons: PotholeAiTriageReason[];
  shadowOnly: true;
};

/** Pure informational replay: no clock, environment, provider, or mutation capability. */
export function evaluatePotholeAiTriage(
  input: { assessment: TriageAssessment | null; evidenceChangedSinceAssessment: boolean },
  triageVersion: typeof POTHOLE_AI_TRIAGE_VERSION = POTHOLE_AI_TRIAGE_VERSION,
): PotholeAiTriageDto {
  if (triageVersion !== POTHOLE_AI_TRIAGE_VERSION) {
    throw new Error('Unsupported pothole AI triage version');
  }
  const result = (
    category: PotholeAiTriageCategory,
    reasons: PotholeAiTriageReason[],
    priorityBand: PotholeAiTriageDto['priorityBand'] = 'normal',
  ): PotholeAiTriageDto => ({ triageVersion, category, priorityBand, reasons, shadowOnly: true });

  const assessment = input.assessment;
  if (!assessment) return result('no_assessment', ['no_ai_assessment']);
  if (input.evidenceChangedSinceAssessment) {
    return result('stale_assessment', ['newer_citizen_evidence']);
  }

  const policy = POTHOLE_AI_TRIAGE_POLICY_V1;
  const reasons: PotholeAiTriageReason[] = [];
  if (!policy.approvedModels.includes(assessment.model)) reasons.push('model_not_approved');
  if (!policy.approvedPromptVersions.includes(assessment.promptVersion)) {
    reasons.push('prompt_version_not_approved');
  }
  if (!policy.approvedSchemaVersions.includes(assessment.schemaVersion)) {
    reasons.push('schema_version_not_approved');
  }
  if (reasons.length) return result('uncertain', reasons);
  if (assessment.inputPhotoCount < policy.minimumPhotoCount) reasons.push('insufficient_photo_evidence');
  if (assessment.photoQuality === 'poor') reasons.push('poor_photo_quality');
  if (reasons.length) return result('poor_evidence', reasons);
  if (assessment.classification === 'uncertain') {
    return result('uncertain', ['classification_uncertain']);
  }
  if (assessment.classification === 'unlikely_pothole') {
    return result('likely_not_pothole', ['classification_unlikely_pothole'], 'low');
  }
  if (assessment.confidence < policy.highConfidenceThreshold) reasons.push('confidence_below_high_threshold');
  if (policy.requireGoodPhoto && assessment.photoQuality !== 'good') reasons.push('photo_quality_not_good');
  if (policy.requireKnownSeverity && assessment.suggestedSeverity === 'unknown') {
    reasons.push('suggested_severity_unknown');
  }
  return reasons.length
    ? result('likely_pothole_review', reasons)
    : result('high_confidence_likely_pothole', ['high_confidence_visual_evidence'], 'high');
}
