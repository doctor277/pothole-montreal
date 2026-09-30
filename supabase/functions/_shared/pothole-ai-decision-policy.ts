import type { AdminAiAssessmentDto } from './pothole-ai-assessment.ts';
import {
  OPENAI_POTHOLE_MODEL,
  OPENAI_POTHOLE_PROMPT_VERSION,
  OPENAI_POTHOLE_SCHEMA_VERSION,
} from './openai-pothole-analysis.ts';

export const POTHOLE_AUTO_VERIFY_POLICY_VERSION = 'pothole-auto-verify-v1';
export const POTHOLE_AUTO_VERIFY_POLICY_VERSION_V2 = 'pothole-auto-verify-v2';

export type PotholeAutoVerifyReason =
  | 'automation_disabled'
  | 'classification_not_likely_pothole'
  | 'confidence_below_threshold'
  | 'photo_quality_not_good'
  | 'suggested_severity_unknown'
  | 'model_not_approved'
  | 'prompt_version_not_approved'
  | 'schema_version_not_approved'
  | 'insufficient_photo_evidence';

export type PotholeAutoVerifyShadowDecisionDto = {
  policyVersion: typeof POTHOLE_AUTO_VERIFY_POLICY_VERSION;
  eligible: boolean;
  reasons: PotholeAutoVerifyReason[];
};

export type PotholeAutoVerifyPolicy = {
  policyVersion: typeof POTHOLE_AUTO_VERIFY_POLICY_VERSION;
  automationEnabled: boolean;
  minimumConfidence: number;
  requireGoodPhoto: boolean;
  requireSuggestedSeverity: boolean;
  minimumPhotoCount: number;
  approvedModels: readonly string[];
  approvedPromptVersions: readonly string[];
  approvedSchemaVersions: readonly string[];
};

export type PotholeAutoVerifyPolicyEnvironment = {
  automationEnabled?: string;
  minimumConfidence?: string;
  requireGoodPhoto?: string;
};

export const DEFAULT_POTHOLE_AUTO_VERIFY_POLICY: PotholeAutoVerifyPolicy = Object.freeze({
  policyVersion: POTHOLE_AUTO_VERIFY_POLICY_VERSION,
  automationEnabled: false,
  minimumConfidence: 0.99,
  requireGoodPhoto: true,
  requireSuggestedSeverity: true,
  minimumPhotoCount: 1,
  approvedModels: Object.freeze([OPENAI_POTHOLE_MODEL]),
  approvedPromptVersions: Object.freeze([OPENAI_POTHOLE_PROMPT_VERSION]),
  approvedSchemaVersions: Object.freeze([OPENAI_POTHOLE_SCHEMA_VERSION]),
});

/**
 * Resolves server-only policy configuration fail-closed. This config controls
 * only a simulated decision; no function in this module can mutate data.
 */
export function resolvePotholeAutoVerifyPolicy(
  environment: PotholeAutoVerifyPolicyEnvironment,
): PotholeAutoVerifyPolicy {
  return {
    ...DEFAULT_POTHOLE_AUTO_VERIFY_POLICY,
    automationEnabled: environment.automationEnabled === 'true',
    minimumConfidence: parseConfidenceThreshold(environment.minimumConfidence),
    requireGoodPhoto:
      environment.requireGoodPhoto === 'false'
        ? false
        : DEFAULT_POTHOLE_AUTO_VERIFY_POLICY.requireGoodPhoto,
  };
}

/**
 * Pure shadow evaluator. It returns a deterministic explanation and has no
 * database, Storage, provider, or moderation dependencies.
 */
export function evaluatePotholeAutoVerifyEligibility(
  assessment: AdminAiAssessmentDto,
  policy: PotholeAutoVerifyPolicy = DEFAULT_POTHOLE_AUTO_VERIFY_POLICY,
): PotholeAutoVerifyShadowDecisionDto {
  const reasons: PotholeAutoVerifyReason[] = [];

  if (!policy.automationEnabled) {
    reasons.push('automation_disabled');
  }
  if (assessment.classification !== 'likely_pothole') {
    reasons.push('classification_not_likely_pothole');
  }
  if (assessment.confidence < policy.minimumConfidence) {
    reasons.push('confidence_below_threshold');
  }
  if (policy.requireGoodPhoto && assessment.photoQuality !== 'good') {
    reasons.push('photo_quality_not_good');
  }
  if (policy.requireSuggestedSeverity && assessment.suggestedSeverity === 'unknown') {
    reasons.push('suggested_severity_unknown');
  }
  if (!policy.approvedModels.includes(assessment.model)) {
    reasons.push('model_not_approved');
  }
  if (!policy.approvedPromptVersions.includes(assessment.promptVersion)) {
    reasons.push('prompt_version_not_approved');
  }
  if (!policy.approvedSchemaVersions.includes(assessment.schemaVersion)) {
    reasons.push('schema_version_not_approved');
  }
  if (assessment.inputPhotoCount < policy.minimumPhotoCount) {
    reasons.push('insufficient_photo_evidence');
  }

  return {
    policyVersion: policy.policyVersion,
    eligible: reasons.length === 0,
    reasons,
  };
}

function parseConfidenceThreshold(value: string | undefined): number {
  if (value === undefined || value.length === 0 || value.trim() !== value) {
    return DEFAULT_POTHOLE_AUTO_VERIFY_POLICY.minimumConfidence;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
    ? parsed
    : DEFAULT_POTHOLE_AUTO_VERIFY_POLICY.minimumConfidence;
}

export type PotholeAutoVerifyTechnicalReason = Exclude<
  PotholeAutoVerifyReason,
  'automation_disabled'
>;

export type PotholeAutoVerifyTechnicalDecisionDto = {
  policyVersion: typeof POTHOLE_AUTO_VERIFY_POLICY_VERSION_V2;
  technicallyEligible: boolean;
  technicalReasons: PotholeAutoVerifyTechnicalReason[];
};

export type PotholeAutoVerifyShadowDecisionV2Dto =
  PotholeAutoVerifyTechnicalDecisionDto & {
    automationOperationallyEnabled: boolean;
    actionPerformed: false;
  };

export type PotholeAutoVerifyPolicyV2 = Readonly<{
  policyVersion: typeof POTHOLE_AUTO_VERIFY_POLICY_VERSION_V2;
  minimumConfidence: number;
  requireGoodPhoto: boolean;
  requireSuggestedSeverity: boolean;
  minimumPhotoCount: number;
  approvedModels: readonly string[];
  approvedPromptVersions: readonly string[];
  approvedSchemaVersions: readonly string[];
}>;

/**
 * Immutable technical meaning for policy v2. Runtime environment values must
 * never redefine these criteria; a criteria change requires a new version.
 */
export const POTHOLE_AUTO_VERIFY_POLICY_V2: PotholeAutoVerifyPolicyV2 = Object.freeze({
  policyVersion: POTHOLE_AUTO_VERIFY_POLICY_VERSION_V2,
  minimumConfidence: 0.99,
  requireGoodPhoto: true,
  requireSuggestedSeverity: true,
  minimumPhotoCount: 1,
  approvedModels: Object.freeze(['gpt-5.6-terra']),
  approvedPromptVersions: Object.freeze(['pothole-vision-v1']),
  approvedSchemaVersions: Object.freeze(['pothole-assessment-v1']),
});

/**
 * Replays immutable assessment evidence against the explicitly requested
 * technical policy version. This pure function has no environment, database,
 * Storage, provider, or moderation dependency.
 */
export function replayPotholeAutoVerifyPolicy(
  assessment: AdminAiAssessmentDto,
  policyVersion: typeof POTHOLE_AUTO_VERIFY_POLICY_VERSION_V2,
): PotholeAutoVerifyTechnicalDecisionDto {
  if (policyVersion !== POTHOLE_AUTO_VERIFY_POLICY_VERSION_V2) {
    throw new Error('Unsupported pothole auto-verify policy version');
  }

  const policy = POTHOLE_AUTO_VERIFY_POLICY_V2;
  const technicalReasons: PotholeAutoVerifyTechnicalReason[] = [];

  if (assessment.classification !== 'likely_pothole') {
    technicalReasons.push('classification_not_likely_pothole');
  }
  if (assessment.confidence < policy.minimumConfidence) {
    technicalReasons.push('confidence_below_threshold');
  }
  if (policy.requireGoodPhoto && assessment.photoQuality !== 'good') {
    technicalReasons.push('photo_quality_not_good');
  }
  if (policy.requireSuggestedSeverity && assessment.suggestedSeverity === 'unknown') {
    technicalReasons.push('suggested_severity_unknown');
  }
  if (!policy.approvedModels.includes(assessment.model)) {
    technicalReasons.push('model_not_approved');
  }
  if (!policy.approvedPromptVersions.includes(assessment.promptVersion)) {
    technicalReasons.push('prompt_version_not_approved');
  }
  if (!policy.approvedSchemaVersions.includes(assessment.schemaVersion)) {
    technicalReasons.push('schema_version_not_approved');
  }
  if (assessment.inputPhotoCount < policy.minimumPhotoCount) {
    technicalReasons.push('insufficient_photo_evidence');
  }

  return {
    policyVersion: policy.policyVersion,
    technicallyEligible: technicalReasons.length === 0,
    technicalReasons,
  };
}

/**
 * Adds the independent runtime operational state to the technical replay.
 * M10.2 is shadow-only, so actionPerformed is deliberately a false literal.
 */
export function buildPotholeAutoVerifyShadowDecision(
  assessment: AdminAiAssessmentDto,
  automationEnabledValue: string | undefined,
): PotholeAutoVerifyShadowDecisionV2Dto {
  return {
    ...replayPotholeAutoVerifyPolicy(
      assessment,
      POTHOLE_AUTO_VERIFY_POLICY_VERSION_V2,
    ),
    automationOperationallyEnabled: isAiAutomationOperationallyEnabled(
      automationEnabledValue,
    ),
    actionPerformed: false,
  };
}

export function isAiAutomationOperationallyEnabled(
  value: string | undefined,
): boolean {
  return value === 'true';
}
