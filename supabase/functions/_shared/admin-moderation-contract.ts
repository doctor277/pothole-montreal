const MAX_REASON_LENGTH = 500;

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

const transitionTargets = ['UNDER_REVIEW', 'VERIFIED', 'REJECTED'] as const;

export type PotholeStatus = (typeof potholeStatuses)[number];
export type TransitionTarget = (typeof transitionTargets)[number];

export type AdminTransitionInput = {
  publicId: string;
  targetStatus: TransitionTarget;
  reason: string | null;
};

export type TransitionRpcRow = {
  outcome:
    | 'UPDATED'
    | 'NOT_FOUND'
    | 'INVALID_TRANSITION'
    | 'INVALID_INPUT'
    | 'ACTOR_NOT_AUTHORIZED';
  public_id: string | null;
  from_status: PotholeStatus | null;
  to_status: PotholeStatus | null;
  updated_at: string | null;
};

export class InvalidAdminTransitionInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAdminTransitionInputError';
  }
}

/**
 * Validates only the browser request contract. The authoritative status graph,
 * active-admin recheck, row lock, update, and audit write remain in the
 * service-role-only database RPC.
 */
export function parseAdminTransitionInput(value: unknown): AdminTransitionInput {
  const body = asRecord(value);
  assertOnlyKeys(body, ['publicId', 'targetStatus', 'reason']);

  if (!isPublicId(body.publicId) || !isTransitionTarget(body.targetStatus)) {
    throw new InvalidAdminTransitionInputError('transition fields are invalid');
  }

  const reason = parseReason(body.reason);

  if (body.targetStatus === 'REJECTED' && !reason) {
    throw new InvalidAdminTransitionInputError('rejection reason is required');
  }

  if (body.targetStatus !== 'REJECTED' && reason !== null) {
    throw new InvalidAdminTransitionInputError('reason is only supported for rejection');
  }

  return {
    publicId: body.publicId,
    targetStatus: body.targetStatus,
    reason,
  };
}

export function toTransitionResult(value: unknown): TransitionRpcRow | null {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) {
    return null;
  }

  const row = value[0];

  if (
    !isTransitionOutcome(row.outcome) ||
    !isNullablePublicId(row.public_id) ||
    !isNullablePotholeStatus(row.from_status) ||
    !isNullablePotholeStatus(row.to_status) ||
    !isNullableTimestamp(row.updated_at)
  ) {
    return null;
  }

  return {
    outcome: row.outcome,
    public_id: row.public_id,
    from_status: row.from_status,
    to_status: row.to_status,
    updated_at: row.updated_at,
  };
}

/**
 * Maps a validated RPC domain result to a safe browser response. A concurrent
 * transition is intentionally a conflict rather than an overwrite.
 */
export function toAdminTransitionResponse(result: TransitionRpcRow): Response {
  if (result.outcome === 'NOT_FOUND') {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  if (result.outcome === 'INVALID_INPUT') {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }

  if (result.outcome === 'ACTOR_NOT_AUTHORIZED') {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  if (result.outcome === 'INVALID_TRANSITION') {
    return Response.json({ error: 'status_conflict' }, { status: 409 });
  }

  if (!isUpdatedTransition(result)) {
    return Response.json({ error: 'status_update_failed' }, { status: 500 });
  }

  return Response.json({
    pothole: {
      publicId: result.public_id,
      fromStatus: result.from_status,
      status: result.to_status,
      updatedAt: result.updated_at,
    },
  });
}

function parseReason(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new InvalidAdminTransitionInputError('reason is invalid');
  }

  const reason = value.trim();

  if (reason.length === 0 || reason.length > MAX_REASON_LENGTH) {
    throw new InvalidAdminTransitionInputError('reason is invalid');
  }

  return reason;
}

function isUpdatedTransition(
  result: TransitionRpcRow,
): result is TransitionRpcRow & {
  outcome: 'UPDATED';
  public_id: string;
  from_status: PotholeStatus;
  to_status: PotholeStatus;
  updated_at: string;
} {
  return (
    result.outcome === 'UPDATED' &&
    result.public_id !== null &&
    result.from_status !== null &&
    result.to_status !== null &&
    result.updated_at !== null
  );
}

function isTransitionOutcome(value: unknown): value is TransitionRpcRow['outcome'] {
  return (
    value === 'UPDATED' ||
    value === 'NOT_FOUND' ||
    value === 'INVALID_TRANSITION' ||
    value === 'INVALID_INPUT' ||
    value === 'ACTOR_NOT_AUTHORIZED'
  );
}

function isTransitionTarget(value: unknown): value is TransitionTarget {
  return typeof value === 'string' && transitionTargets.includes(value as TransitionTarget);
}

function isPotholeStatus(value: unknown): value is PotholeStatus {
  return typeof value === 'string' && potholeStatuses.includes(value as PotholeStatus);
}

function isNullablePotholeStatus(value: unknown): value is PotholeStatus | null {
  return value === null || isPotholeStatus(value);
}

function isPublicId(value: unknown): value is string {
  return typeof value === 'string' && /^MTL-[0-9]{6}$/.test(value);
}

function isNullablePublicId(value: unknown): value is string | null {
  return value === null || isPublicId(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || isTimestamp(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new InvalidAdminTransitionInputError('request body must be an object');
  }

  return value;
}

function assertOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw new InvalidAdminTransitionInputError('request body contains an unknown field');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
