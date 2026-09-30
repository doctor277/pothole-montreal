import {
  AdminAuthorizationError,
  requireActiveAdmin,
  toAdminAuthorizationResponse,
} from './admin-auth.ts';
import { loadQueueAiTriage } from './admin-queue-ai-triage.ts';

const DEFAULT_QUEUE_STATUSES = ['REPORTED', 'UNDER_REVIEW'] as const;
const DEFAULT_RESULT_LIMIT = 25;
const MAX_RESULT_LIMIT = 50;

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

type PotholeStatus = (typeof potholeStatuses)[number];
type ReportSeverity = (typeof reportSeverities)[number];

type ListInput = {
  statuses: PotholeStatus[] | null;
  limit: number;
  cursor: {
    createdAt: string;
    publicId: string;
  } | null;
};

type ListRpcRow = {
  public_id: string;
  status: PotholeStatus;
  formatted_address: string | null;
  latitude: number;
  longitude: number;
  report_count: number;
  latest_severity: ReportSeverity | null;
  created_at: string;
  latest_report_created_at: string | null;
  result_limit_reached: boolean;
};

class InvalidAdminListInputError extends Error {}

// Extracted without changing core input, pagination, or human queue semantics.
export async function handleAdminListPotholes(
  request: Request,
  context: Parameters<typeof requireActiveAdmin>[0],
): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }

  try {
    const admin = await requireActiveAdmin(context);
    const input = parseListInput(await readJsonBody(request));

    const { data, error } = await context.supabaseAdmin.rpc('admin_list_potholes', {
      p_statuses: input.statuses,
      p_limit: input.limit,
      p_cursor_created_at: input.cursor?.createdAt ?? null,
      p_cursor_public_id: input.cursor?.publicId ?? null,
    });

    const items = toListItems(data);
    if (error || !items) {
      console.error('admin-list-potholes failed');
      return Response.json({ error: 'potholes_unavailable' }, { status: 500 });
    }

    const lastItem = items.at(-1);
    const resultLimitReached = items[0]?.resultLimitReached ?? false;
    if (items.some((item) => item.resultLimitReached !== resultLimitReached)) {
      console.error('admin-list-potholes received an inconsistent pagination response');
      return Response.json({ error: 'potholes_unavailable' }, { status: 500 });
    }

    const triage = await loadQueueAiTriage(
      (name, args) => context.supabaseAdmin.rpc(name, args),
      items.map((item) => item.publicId),
      admin.userId,
    );

    return Response.json({
      potholes: items.map(({ resultLimitReached: _, ...item }) => ({
        ...item,
        aiTriageAvailability: triage ? 'available' : 'unavailable',
        aiTriage: triage?.get(item.publicId) ?? null,
      })),
      nextCursor:
        lastItem && resultLimitReached
          ? { createdAt: lastItem.createdAt, publicId: lastItem.publicId }
          : null,
    });
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return toAdminAuthorizationResponse(error);
    }
    if (error instanceof InvalidAdminListInputError) {
      return Response.json({ error: 'invalid_request' }, { status: 400 });
    }
    console.error('admin-list-potholes failed');
    return Response.json({ error: 'potholes_unavailable' }, { status: 500 });
  }
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new InvalidAdminListInputError('request body must be valid JSON');
  }
}

function parseListInput(value: unknown): ListInput {
  const body = asRecord(value);
  assertOnlyKeys(body, ['statuses', 'limit', 'cursor']);

  return {
    statuses: parseStatuses(body.statuses),
    limit: parseLimit(body.limit),
    cursor: parseCursor(body.cursor),
  };
}

function parseStatuses(value: unknown): PotholeStatus[] | null {
  if (value === undefined) {
    return [...DEFAULT_QUEUE_STATUSES];
  }

  // `null` deliberately means every workflow status. It is not an unbounded
  // direct-table query: the service-role RPC remains paginated and returns a
  // small administrative list DTO.
  if (value === null) {
    return null;
  }

  if (!Array.isArray(value) || value.length === 0 || value.length > potholeStatuses.length) {
    throw new InvalidAdminListInputError('statuses is invalid');
  }

  const statuses = value.map((status) => {
    if (!isPotholeStatus(status)) {
      throw new InvalidAdminListInputError('statuses is invalid');
    }

    return status;
  });

  if (new Set(statuses).size !== statuses.length) {
    throw new InvalidAdminListInputError('statuses must not contain duplicates');
  }

  return statuses;
}

function parseLimit(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_RESULT_LIMIT;
  }

  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > MAX_RESULT_LIMIT) {
    throw new InvalidAdminListInputError('limit is invalid');
  }

  return value;
}

function parseCursor(value: unknown): ListInput['cursor'] {
  if (value === undefined || value === null) {
    return null;
  }

  const cursor = asRecord(value);
  assertOnlyKeys(cursor, ['createdAt', 'publicId']);

  if (!isTimestamp(cursor.createdAt) || !isPublicId(cursor.publicId)) {
    throw new InvalidAdminListInputError('cursor is invalid');
  }

  return {
    createdAt: cursor.createdAt,
    publicId: cursor.publicId,
  };
}

function toListItems(value: unknown): Array<{
  publicId: string;
  status: PotholeStatus;
  formattedAddress: string | null;
  latitude: number;
  longitude: number;
  reportCount: number;
  latestSeverity: ReportSeverity | null;
  createdAt: string;
  latestReportCreatedAt: string | null;
  resultLimitReached: boolean;
}> | null {
  if (!Array.isArray(value) || value.length > MAX_RESULT_LIMIT) {
    return null;
  }

  const rows = value.map(toListRow);

  if (rows.some((row) => row === null)) {
    return null;
  }

  return (rows as ListRpcRow[]).map((row) => ({
    publicId: row.public_id,
    status: row.status,
    formattedAddress: row.formatted_address,
    latitude: row.latitude,
    longitude: row.longitude,
    reportCount: row.report_count,
    latestSeverity: row.latest_severity,
    createdAt: row.created_at,
    latestReportCreatedAt: row.latest_report_created_at,
    resultLimitReached: row.result_limit_reached,
  }));
}

function toListRow(value: unknown): ListRpcRow | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !isPublicId(value.public_id) ||
    !isPotholeStatus(value.status) ||
    !isNullableString(value.formatted_address) ||
    !isLatitude(value.latitude) ||
    !isLongitude(value.longitude) ||
    !isNonNegativeInteger(value.report_count) ||
    !isNullableReportSeverity(value.latest_severity) ||
    !isTimestamp(value.created_at) ||
    !isNullableTimestamp(value.latest_report_created_at) ||
    typeof value.result_limit_reached !== 'boolean'
  ) {
    return null;
  }

  return {
    public_id: value.public_id,
    status: value.status,
    formatted_address: value.formatted_address,
    latitude: value.latitude,
    longitude: value.longitude,
    report_count: value.report_count,
    latest_severity: value.latest_severity,
    created_at: value.created_at,
    latest_report_created_at: value.latest_report_created_at,
    result_limit_reached: value.result_limit_reached,
  };
}

function isPotholeStatus(value: unknown): value is PotholeStatus {
  return typeof value === 'string' && potholeStatuses.includes(value as PotholeStatus);
}

function isNullableReportSeverity(value: unknown): value is ReportSeverity | null {
  return value === null || (typeof value === 'string' && reportSeverities.includes(value as ReportSeverity));
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

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || isTimestamp(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new InvalidAdminListInputError('request body must be an object');
  }

  return value;
}

function assertOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw new InvalidAdminListInputError('request body contains an unknown field');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
