import type { PublicPothole, PublicPotholeSeverity, PublicPotholeStatus } from '@/src/types/public-pothole';

export type NearbyPotholeCandidate = PublicPothole & {
  distanceMeters: number;
};

export type NearbyPotholesResult = {
  candidates: readonly NearbyPotholeCandidate[];
};

export type { PublicPotholeSeverity, PublicPotholeStatus };
