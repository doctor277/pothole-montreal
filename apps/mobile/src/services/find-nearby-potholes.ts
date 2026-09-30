import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/src/lib/supabase';
import {
  ensureAnonymousSession,
  recoverAnonymousSessionAfterAuthFailure,
} from '@/src/services/anonymous-session';
import {
  publicPotholeSeverities,
  publicPotholeStatuses,
  type PublicPotholeSeverity,
  type PublicPotholeStatus,
} from '@/src/types/public-pothole';
import type { NearbyPotholeCandidate, NearbyPotholesResult } from '@/src/types/nearby-pothole';

const nearbyPotholesFunctionName = 'find-nearby-potholes';
const maximumNearbyCandidateDistanceMeters = 50;
const maximumNearbyCandidateCount = 5;

type NearbyPotholesFailureKind = 'invalidLocation' | 'session' | 'request';

type NearbyPotholesFunctionResponse = {
  candidates: NearbyPotholeCandidate[];
};

export class NearbyPotholesError extends Error {
  constructor(readonly kind: NearbyPotholesFailureKind) {
    super(kind);
    this.name = 'NearbyPotholesError';
  }
}

// One deliberate request after the citizen confirms a pin. This service never
// reads application tables directly and validates the safe Edge DTO before UI
// code receives it.
export async function findNearbyPotholes(
  location: Pick<NearbyPotholeCandidate, 'latitude' | 'longitude'>,
): Promise<NearbyPotholesResult> {
  if (!isLatitude(location.latitude) || !isLongitude(location.longitude)) {
    throw new NearbyPotholesError('invalidLocation');
  }

  try {
    await ensureAnonymousSession();
  } catch {
    throw new NearbyPotholesError('session');
  }

  try {
    const firstResponse = await invokeFindNearbyPotholes(location);

    if (!firstResponse.error && isNearbyPotholesFunctionResponse(firstResponse.data)) {
      return firstResponse.data;
    }

    if (
      isEdgeFunctionAuthenticationFailure(firstResponse.error) &&
      (await recoverAnonymousSessionAfterAuthFailure())
    ) {
      const retryResponse = await invokeFindNearbyPotholes(location);

      if (!retryResponse.error && isNearbyPotholesFunctionResponse(retryResponse.data)) {
        return retryResponse.data;
      }
    }

    throw new NearbyPotholesError('request');
  } catch (error) {
    if (error instanceof NearbyPotholesError) {
      throw error;
    }

    throw new NearbyPotholesError('request');
  }
}

function invokeFindNearbyPotholes(location: Pick<NearbyPotholeCandidate, 'latitude' | 'longitude'>) {
  return supabase.functions.invoke(nearbyPotholesFunctionName, {
    body: {
      latitude: location.latitude,
      longitude: location.longitude,
    },
  });
}

function isEdgeFunctionAuthenticationFailure(error: unknown): boolean {
  if (!(error instanceof FunctionsHttpError) || !isRecord(error.context)) {
    return false;
  }

  return error.context.status === 401 || error.context.status === 403;
}

function isNearbyPotholesFunctionResponse(value: unknown): value is NearbyPotholesFunctionResponse {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['candidates']) ||
    !Array.isArray(value.candidates) ||
    value.candidates.length > maximumNearbyCandidateCount
  ) {
    return false;
  }

  return value.candidates.every(isNearbyPotholeCandidate);
}

function isNearbyPotholeCandidate(value: unknown): value is NearbyPotholeCandidate {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'publicId',
      'latitude',
      'longitude',
      'distanceMeters',
      'status',
      'formattedAddress',
      'reportCount',
      'latestSeverity',
      'createdAt',
    ])
  ) {
    return false;
  }

  return (
    typeof value.publicId === 'string' &&
    /^MTL-[0-9]{6}$/.test(value.publicId) &&
    isLatitude(value.latitude) &&
    isLongitude(value.longitude) &&
    isDistanceMeters(value.distanceMeters) &&
    isPublicPotholeStatus(value.status) &&
    (value.formattedAddress === null || typeof value.formattedAddress === 'string') &&
    isNonNegativeInteger(value.reportCount) &&
    (value.latestSeverity === null || isPublicPotholeSeverity(value.latestSeverity)) &&
    isIsoDate(value.createdAt)
  );
}

function isLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

function isLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}

function isDistanceMeters(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= maximumNearbyCandidateDistanceMeters
  );
}

function isPublicPotholeStatus(value: unknown): value is PublicPotholeStatus {
  return typeof value === 'string' && publicPotholeStatuses.includes(value as PublicPotholeStatus);
}

function isPublicPotholeSeverity(value: unknown): value is PublicPotholeSeverity {
  return typeof value === 'string' && publicPotholeSeverities.includes(value as PublicPotholeSeverity);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}
