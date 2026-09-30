import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/src/lib/supabase';
import {
  ensureAnonymousSession,
  recoverAnonymousSessionAfterAuthFailure,
} from '@/src/services/anonymous-session';
import {
  publicPotholeSeverities,
  publicPotholeStatuses,
  type PublicPothole,
  type PublicPotholeBounds,
  type PublicPotholeSeverity,
  type PublicPotholeStatus,
  type PublicPotholesResult,
} from '@/src/types/public-pothole';

const publicPotholesFunctionName = 'list-public-potholes';

type PublicPotholesFailureKind = 'invalidBounds' | 'session' | 'request';

type PublicPotholeFunctionResponse = {
  potholes: PublicPothole[];
  resultLimitReached: boolean;
};

export class PublicPotholesError extends Error {
  constructor(readonly kind: PublicPotholesFailureKind) {
    super(kind);
    this.name = 'PublicPotholesError';
  }
}

// This service is the sole mobile boundary for public map data. It never reads
// tables directly, and the Edge Function response is validated before UI code
// receives it.
export async function listPublicPotholesInBounds(
  bounds: PublicPotholeBounds,
): Promise<PublicPotholesResult> {
  if (!hasValidBounds(bounds)) {
    throw new PublicPotholesError('invalidBounds');
  }

  try {
    await ensureAnonymousSession();
  } catch {
    throw new PublicPotholesError('session');
  }

  try {
    const firstResponse = await invokePublicPotholes(bounds);

    if (!firstResponse.error && isPublicPotholeFunctionResponse(firstResponse.data)) {
      return firstResponse.data;
    }

    if (
      isEdgeFunctionAuthenticationFailure(firstResponse.error) &&
      (await recoverAnonymousSessionAfterAuthFailure())
    ) {
      const retryResponse = await invokePublicPotholes(bounds);

      if (!retryResponse.error && isPublicPotholeFunctionResponse(retryResponse.data)) {
        return retryResponse.data;
      }
    }

    throw new PublicPotholesError('request');
  } catch (error) {
    if (error instanceof PublicPotholesError) {
      throw error;
    }

    throw new PublicPotholesError('request');
  }
}

function invokePublicPotholes(bounds: PublicPotholeBounds) {
  return supabase.functions.invoke(publicPotholesFunctionName, {
    body: {
      minLatitude: bounds.minLatitude,
      minLongitude: bounds.minLongitude,
      maxLatitude: bounds.maxLatitude,
      maxLongitude: bounds.maxLongitude,
    },
  });
}

function isEdgeFunctionAuthenticationFailure(error: unknown): boolean {
  if (!(error instanceof FunctionsHttpError) || !isRecord(error.context)) {
    return false;
  }

  return error.context.status === 401 || error.context.status === 403;
}

function hasValidBounds(bounds: PublicPotholeBounds): boolean {
  return (
    isLatitude(bounds.minLatitude) &&
    isLatitude(bounds.maxLatitude) &&
    isLongitude(bounds.minLongitude) &&
    isLongitude(bounds.maxLongitude) &&
    bounds.minLatitude < bounds.maxLatitude &&
    bounds.minLongitude !== bounds.maxLongitude
  );
}

function isPublicPotholeFunctionResponse(value: unknown): value is PublicPotholeFunctionResponse {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['potholes', 'resultLimitReached']) ||
    !Array.isArray(value.potholes) ||
    typeof value.resultLimitReached !== 'boolean'
  ) {
    return false;
  }

  return value.potholes.every(isPublicPothole);
}

function isPublicPothole(value: unknown): value is PublicPothole {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'publicId',
      'latitude',
      'longitude',
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
    isPublicPotholeStatus(value.status) &&
    (value.formattedAddress === null || typeof value.formattedAddress === 'string') &&
    typeof value.reportCount === 'number' &&
    Number.isInteger(value.reportCount) &&
    value.reportCount >= 0 &&
    (value.latestSeverity === null || isPublicPotholeSeverity(value.latestSeverity)) &&
    isIsoDate(value.createdAt)
  );
}

function isPublicPotholeStatus(value: unknown): value is PublicPotholeStatus {
  return typeof value === 'string' && publicPotholeStatuses.includes(value as PublicPotholeStatus);
}

function isPublicPotholeSeverity(value: unknown): value is PublicPotholeSeverity {
  return typeof value === 'string' && publicPotholeSeverities.includes(value as PublicPotholeSeverity);
}

function isLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

function isLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
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
