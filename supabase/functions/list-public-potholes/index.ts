import { withSupabase } from 'npm:@supabase/server@1.4.1';

const DEFAULT_RESULT_LIMIT = 200;
const MAX_RESULT_LIMIT = 250;

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

type ListPublicPotholesInput = {
  minLatitude: number;
  minLongitude: number;
  maxLatitude: number;
  maxLongitude: number;
  limit: number;
};

type PublicPotholeRpcRow = {
  public_id: string;
  latitude: number;
  longitude: number;
  status: PublicPotholeStatus;
  formatted_address: string | null;
  report_count: number;
  latest_severity: PublicPotholeSeverity | null;
  created_at: string;
  result_limit_reached: boolean;
};

type PublicPotholeDto = {
  publicId: string;
  latitude: number;
  longitude: number;
  status: PublicPotholeStatus;
  formattedAddress: string | null;
  reportCount: number;
  latestSeverity: PublicPotholeSeverity | null;
  createdAt: string;
};

class InvalidPublicPotholesInputError extends Error {}

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

      const input = parseListPublicPotholesInput(await readJsonBody(request));
      const { data, error } = await context.supabaseAdmin.rpc('list_public_potholes_in_bbox', {
        p_min_latitude: input.minLatitude,
        p_min_longitude: input.minLongitude,
        p_max_latitude: input.maxLatitude,
        p_max_longitude: input.maxLongitude,
        p_limit: input.limit,
      });

      const response = toListPublicPotholesResponse(data);

      if (error || !response) {
        console.error('list-public-potholes failed', error ?? 'unexpected RPC response');
        return Response.json({ error: 'potholes_unavailable' }, { status: 500 });
      }

      return Response.json(response);
    } catch (error) {
      if (error instanceof InvalidPublicPotholesInputError) {
        return Response.json({ error: 'invalid_request' }, { status: 400 });
      }

      console.error('list-public-potholes failed', error);
      return Response.json({ error: 'potholes_unavailable' }, { status: 500 });
    }
  }),
};

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new InvalidPublicPotholesInputError('request body must be valid JSON');
  }
}

function parseListPublicPotholesInput(value: unknown): ListPublicPotholesInput {
  const body = asRecord(value);
  assertOnlyKeys(body, ['minLatitude', 'minLongitude', 'maxLatitude', 'maxLongitude', 'limit']);

  const minLatitude = parseLatitude(body.minLatitude, 'minLatitude');
  const minLongitude = parseLongitude(body.minLongitude, 'minLongitude');
  const maxLatitude = parseLatitude(body.maxLatitude, 'maxLatitude');
  const maxLongitude = parseLongitude(body.maxLongitude, 'maxLongitude');

  if (minLatitude >= maxLatitude) {
    throw new InvalidPublicPotholesInputError('minLatitude must be less than maxLatitude');
  }

  // A west longitude greater than the east longitude deliberately represents a
  // viewport that crosses the antimeridian. The database RPC splits that case
  // into two PostGIS boxes. A zero-width pair, including 180 to -180, is not a
  // usable viewport and must fail at this public boundary.
  const longitudeSpan =
    minLongitude < maxLongitude
      ? maxLongitude - minLongitude
      : 180 - minLongitude + (maxLongitude + 180);

  if (longitudeSpan <= 0) {
    throw new InvalidPublicPotholesInputError('longitude bounds must span a visible area');
  }

  return {
    minLatitude,
    minLongitude,
    maxLatitude,
    maxLongitude,
    limit: parseRequestedLimit(body.limit),
  };
}

function parseLatitude(value: unknown, fieldName: string): number {
  const latitude = parseFiniteNumber(value, fieldName);

  if (latitude < -90 || latitude > 90) {
    throw new InvalidPublicPotholesInputError(`${fieldName} is out of range`);
  }

  return latitude;
}

function parseLongitude(value: unknown, fieldName: string): number {
  const longitude = parseFiniteNumber(value, fieldName);

  if (longitude < -180 || longitude > 180) {
    throw new InvalidPublicPotholesInputError(`${fieldName} is out of range`);
  }

  return longitude;
}

function parseRequestedLimit(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_RESULT_LIMIT;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new InvalidPublicPotholesInputError('limit must be a positive integer');
  }

  return Math.min(value, MAX_RESULT_LIMIT);
}

function parseFiniteNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidPublicPotholesInputError(`${fieldName} must be finite`);
  }

  return value;
}

function toListPublicPotholesResponse(
  value: unknown,
): { potholes: PublicPotholeDto[]; resultLimitReached: boolean } | null {
  if (!Array.isArray(value) || value.length > MAX_RESULT_LIMIT) {
    return null;
  }

  if (value.length === 0) {
    return { potholes: [], resultLimitReached: false };
  }

  const rows = value.map(toPublicPotholeRpcRow);

  if (rows.some((row) => row === null)) {
    return null;
  }

  const publicRows = rows as PublicPotholeRpcRow[];
  const resultLimitReached = publicRows[0].result_limit_reached;

  if (publicRows.some((row) => row.result_limit_reached !== resultLimitReached)) {
    return null;
  }

  return {
    potholes: publicRows.map((row) => ({
      publicId: row.public_id,
      latitude: row.latitude,
      longitude: row.longitude,
      status: row.status,
      formattedAddress: row.formatted_address,
      reportCount: row.report_count,
      latestSeverity: row.latest_severity,
      createdAt: row.created_at,
    })),
    resultLimitReached,
  };
}

function toPublicPotholeRpcRow(value: unknown): PublicPotholeRpcRow | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !isPublicId(value.public_id) ||
    !isLatitude(value.latitude) ||
    !isLongitude(value.longitude) ||
    !isPublicPotholeStatus(value.status) ||
    !isNullableString(value.formatted_address) ||
    !isNonNegativeInteger(value.report_count) ||
    !isNullablePublicPotholeSeverity(value.latest_severity) ||
    !isTimestamp(value.created_at) ||
    typeof value.result_limit_reached !== 'boolean'
  ) {
    return null;
  }

  return {
    public_id: value.public_id,
    latitude: value.latitude,
    longitude: value.longitude,
    status: value.status,
    formatted_address: value.formatted_address,
    report_count: value.report_count,
    latest_severity: value.latest_severity,
    created_at: value.created_at,
    result_limit_reached: value.result_limit_reached,
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
    throw new InvalidPublicPotholesInputError('request body must be an object');
  }

  return value;
}

function assertOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]) {
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw new InvalidPublicPotholesInputError('request body contains an unknown field');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
