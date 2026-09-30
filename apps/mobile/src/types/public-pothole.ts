import type { SubmittedPotholeStatus } from '@/src/types/report';

export const publicPotholeStatuses = [
  'REPORTED',
  'UNDER_REVIEW',
  'VERIFIED',
  'ASSIGNED',
  'ACCEPTED',
  'IN_PROGRESS',
  'REPAIRED',
  'REJECTED',
  'DUPLICATE',
] as const satisfies readonly SubmittedPotholeStatus[];

export const publicPotholeSeverities = ['SMALL', 'MEDIUM', 'DANGEROUS'] as const;

export type PublicPotholeStatus = (typeof publicPotholeStatuses)[number];
export type PublicPotholeSeverity = (typeof publicPotholeSeverities)[number];

export type PublicPotholeBounds = {
  minLatitude: number;
  minLongitude: number;
  maxLatitude: number;
  maxLongitude: number;
};

export type PublicPothole = {
  publicId: string;
  latitude: number;
  longitude: number;
  status: PublicPotholeStatus;
  formattedAddress: string | null;
  reportCount: number;
  latestSeverity: PublicPotholeSeverity | null;
  createdAt: string;
};

export type PublicPotholesResult = {
  potholes: readonly PublicPothole[];
  resultLimitReached: boolean;
};
