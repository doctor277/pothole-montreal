import type { NearbyPotholeCandidate } from '@/src/types/nearby-pothole';

export const severityIds = ['small', 'medium', 'large'] as const;

export type Severity = (typeof severityIds)[number];

export type ReportLocationSource = 'gps' | 'adjusted';

export type ReportAddress = {
  streetNumber: string | null;
  street: string | null;
  city: string | null;
  district: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
};

export type ReportLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  source: ReportLocationSource;
  address: ReportAddress | null;
};

export type ReportDraft = {
  photoUri: string | null;
  location: ReportLocation | null;
  // Candidate data contains only the scoped public DTO returned by the nearby
  // Edge Function. It is transient report-flow state, never a database ID.
  nearbyCandidates: readonly NearbyPotholeCandidate[] | null;
  selectedExistingPothole: NearbyPotholeCandidate | null;
  severity: Severity | null;
  note: string;
};

export type ReportSubmissionAttempt = {
  submissionId: string;
  storagePath: string;
};

export type SubmittedReport = {
  publicId: string;
  status: SubmittedPotholeStatus;
  matchedExisting: boolean;
  reportCount: number;
};

export type SubmittedPotholeStatus =
  | 'REPORTED'
  | 'UNDER_REVIEW'
  | 'VERIFIED'
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'REPAIRED'
  | 'REJECTED'
  | 'DUPLICATE';
