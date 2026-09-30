import { withSupabase } from 'npm:@supabase/server@1.4.1';

const DEFAULT_RADIUS_METERS = 25;
const MAX_RADIUS_METERS = 50;
const CANDIDATE_LIMIT = 5;
const DISTANCE_EPSILON_METERS = 0.001;

const potholeStatuses = [
  'REPORTED',
  'UNDER_REVIEW',
  'VERIFIED',
  'ASSIGNED',
  'ACCEPTED',
  'IN_PROGRESS',
  'REPAIRED',
  'REJECTED',
  'DUPLICATE',
] as const;

const reportSeverities = ['SMALL', 'MEDIUM', 'DANGEROUS'] as const;

type PublicPotholeStatus = (typeof potholeStatuses)[number];
type PublicPotholeSeverity = (typeof reportSeverities)[number];

type NearbyPotholesInput = {
  latitude: number;
  longitude: number;
  radiusMeters: number;
};

type NearbyPotholeCandidate = {
  publicId: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  status: PublicPotholeStatus;
  formattedAddress: string | null;
  reportCount: number;
  latestSeverity: PublicPotholeSeverity | null;
  createdAt: string;
};

class InvalidNearbyPotholesInputError extends Error {}

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    if (request.method !== 'POST') {
      return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    }

    try {
      const { data: userData, error: userError } = await context.supabase.auth.getUser();

      if (userError || !userData.user) {
        return Response.json({ error: 'unauthorized' }, { status: 401 });
      }

      const input = parseNearbyPotholesInput(await readJsonBody(request));
      const { data, error } = await context.supabaseAdmin.rpc('find_nearby_public_potholes', {
        p_latitude: input.latitude,
        p_longitude: input.longitude,
        p_radius_meters: input.radiusMeters,
        p_limit: CANDIDATE_LIMIT,
      });
      const response = toNearbyPotholesResponse(data, input.radiusMeters);

      if (error || !response) {
        console.error('find-nearby-potholes failed', error ?? 'unexpected RPC response');
        return Response.json({ error: 'nearby_potholes_unavailable' }, { status: 500 });
      }

      return Response.json(response);
    } catch (error) {
      if (error instanceof InvalidNearbyPotholesInputError) {
        return Response.json({ error: 'invalid_request' }, { status: 400 });
      }

      console.error('find-nearby-potholes failed', error);
      return Response.json({ error: 'nearby_potholes_unavailable' }, { status: 500 });
    }
  }),
};

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new InvalidNearbyPotholesInputError('request body must be valid JSON');
  }
}

function parseNearbyPotholesInput(value: unknown): NearbyPotholesInput {
  const body = asRecord(value);
  assertOnlyKeys(body, ['latitude', 'longitude', 'radiusMeters']);

  const latitude = parseLatitude(body.latitude);
  const longitude = parseLongitude(body.longitude);
  const radiusMeters = parseRadiusMeters(body.radiusMeters);

  return { latitude, longitude, radiusMeters };
}

function parseLatitude(value: unknown): number {
  const latitude = parseFiniteNumber(value, 'latitude');

  if (latitude < -90 || latitude > 90) {
    throw new InvalidNearbyPotholesInputError('latitude is out of range');
  }

  return latitude;
}

function parseLongitude(value: unknown): number {
  const longitude = parseFiniteNumber(value, 'longitude');

  if (longitude < -180 || longitude > 180) {
    throw new InvalidNearbyPotholesInputError('longitude is out of range');
  }

  return longitude;
}

function parseRadiusMeters(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_RADIUS_METERS;
  }

  const radiusMeters = parseFiniteNumber(value, 'radiusMeters');

  if (radiusMeters <= 0 || radiusMeters > MAX_RADIUS_METERS) {
    throw new InvalidNearbyPotholesInputError('radiusMeters is out of range');
  }

  return radiusMeters;
}

function parseFiniteNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidNearbyPotholesInputError(`${fieldName} must be finite`);
  }

  return value;
}

function toNearbyPotholesResponse(
  value: unknown,
  radiusMeters: number,
): { candidates: NearbyPotholeCandidate[] } | null {
  if (!Array.isArray(value) || value.length > CANDIDATE_LIMIT) {
    return null;
  }

  const candidates = value.map((row) => toNearbyPotholeCandidate(row, radiusMeters));

  if (candidates.some((candidate) => candidate === null)) {
    return null;
  }

  return { candidates: candidates as NearbyPotholeCandidate[] };
}

function toNearbyPotholeCandidate(
  value: unknown,
  radiusMeters: number,
): NearbyPotholeCandidate | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !isPublicId(value.public_id) ||
    !isLatitude(value.latitude) ||
    !isLongitude(value.longitude) ||
    !isDistanceMeters(value.distance_meters, radiusMeters) ||
    !isPublicPotholeStatus(value.status) ||
    !isNullableString(value.formatted_address) ||
    !isNonNegativeInteger(value.report_count) ||
    !isNullablePublicPotholeSeverity(value.latest_severity) ||
    !isTimestamp(value.created_at)
  ) {
    return null;
  }

  return {
    publicId: value.public_id,
    latitude: value.latitude,
    longitude: value.longitude,
    distanceMeters: value.distance_meters,
    status: value.status,
    formattedAddress: value.formatted_address,
    reportCount: value.report_count,
    latestSeverity: value.latest_severity,
    createdAt: value.created_at,
  };
}

function isPublicId(value: unknown): value is string {
  return typeof value === 'string' && /^MTL-[0-9]{6}$/.test(value);
}

function isLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

function isLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}

function isDistanceMeters(value: unknown, radiusMeters: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= radiusMeters + DISTANCE_EPSILON_METERS
  );
}

function isPublicPotholeStatus(value: unknown): value is PublicPotholeStatus {
  return typeof value === 'string' && potholeStatuses.includes(value as PublicPotholeStatus);
}

function isNullablePublicPotholeSeverity(value: unknown): value is PublicPotholeSeverity | null {
  return value === null || (typeof value === 'string' && reportSeverities.includes(value as PublicPotholeSeverity));
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new InvalidNearbyPotholesInputError('request body must be an object');
  }

  return value;
}

function assertOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw new InvalidNearbyPotholesInputError('request body contains an unknown field');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
