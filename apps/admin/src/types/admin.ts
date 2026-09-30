export const potholeStatuses = [
  "REPORTED",
  "UNDER_REVIEW",
  "VERIFIED",
  "ASSIGNED",
  "ACCEPTED",
  "IN_PROGRESS",
  "REPAIRED",
  "REJECTED",
  "DUPLICATE",
] as const;

export const reportSeverities = ["SMALL", "MEDIUM", "DANGEROUS"] as const;

export type PotholeStatus = (typeof potholeStatuses)[number];
export type ReportSeverity = (typeof reportSeverities)[number];
export type AdminTransitionTarget = "UNDER_REVIEW" | "VERIFIED" | "REJECTED";
export type AiPotholeClassification = "likely_pothole" | "uncertain" | "unlikely_pothole";
export type AiPhotoQuality = "good" | "usable" | "poor";
export type AiSuggestedSeverity = ReportSeverity | "unknown";
export type AiAssessmentAvailability = "available" | "unavailable";
export type AiShadowAutomationReason =
  | "classification_not_likely_pothole"
  | "confidence_below_threshold"
  | "photo_quality_not_good"
  | "suggested_severity_unknown"
  | "model_not_approved"
  | "prompt_version_not_approved"
  | "schema_version_not_approved"
  | "insufficient_photo_evidence";

export type AiShadowAutomationDecision = {
  policyVersion: "pothole-auto-verify-v2";
  technicallyEligible: boolean;
  technicalReasons: AiShadowAutomationReason[];
  automationOperationallyEnabled: boolean;
  actionPerformed: false;
};

export type AdminQueueFilter = "review" | "all" | "reported" | "under-review" | "verified" | "rejected";

export type AdminQueueCursor = {
  createdAt: string;
  publicId: string;
};

export type AdminQueueItem = {
  publicId: string;
  status: PotholeStatus;
  formattedAddress: string | null;
  latitude: number;
  longitude: number;
  reportCount: number;
  latestSeverity: ReportSeverity | null;
  createdAt: string;
  latestReportCreatedAt: string | null;
  aiTriageAvailability: "available" | "unavailable";
  aiTriage: PotholeAiTriageDto | null;
};

export type AdminQueueResponse = {
  potholes: AdminQueueItem[];
  nextCursor: AdminQueueCursor | null;
};

export type AdminAddress = {
  formattedAddress: string | null;
  streetNumber: string | null;
  street: string | null;
  city: string | null;
  district: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
};

export type AdminPothole = {
  publicId: string;
  status: PotholeStatus;
  latitude: number;
  longitude: number;
  reportCount: number;
  address: AdminAddress;
  createdAt: string;
  updatedAt: string;
  repairedAt: string | null;
};

export type AdminPhoto = {
  mimeType: string | null;
  fileSizeBytes: number | null;
  createdAt: string;
  available: boolean;
  signedUrl: string | null;
  expiresInSeconds: number | null;
};

export type AdminReport = {
  id: string;
  severity: ReportSeverity;
  note: string | null;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  matchedExistingPothole: boolean;
  address: AdminAddress;
  createdAt: string;
  photos: AdminPhoto[];
};

export type AdminStatusEvent = {
  fromStatus: PotholeStatus;
  toStatus: PotholeStatus;
  reason: string | null;
  createdAt: string;
};

export type AdminAiAssessment = {
  classification: AiPotholeClassification;
  confidence: number;
  photoQuality: AiPhotoQuality;
  suggestedSeverity: AiSuggestedSeverity;
  visibleEvidence: string[];
  cautions: string[];
  summary: string;
  inputPhotoCount: number;
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  createdAt: string;
};

export type AdminPotholeDetail = {
  pothole: AdminPothole;
  reports: AdminReport[];
  statusEvents: AdminStatusEvent[];
  aiAnalysisEnabled: boolean;
  aiAssessmentAvailability: AiAssessmentAvailability;
  aiAssessment: AdminAiAssessment | null;
  aiAssessmentCount: number | null;
  shadowAutomation: AiShadowAutomationDecision | null;
};

export type AdminAnalyzePotholeResult = {
  assessment: AdminAiAssessment;
  assessmentCount: number;
  shadowAutomation: AiShadowAutomationDecision;
};

export type AdminTransitionResult = {
  pothole: {
    publicId: string;
    fromStatus: PotholeStatus;
    status: PotholeStatus;
    updatedAt: string;
  };
};
import type { PotholeAiTriageDto } from "../../../../supabase/functions/_shared/pothole-ai-triage-policy";
