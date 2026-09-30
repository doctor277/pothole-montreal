export const REPORT_PHOTO_BUCKET = 'report-photos';
export const REPORT_PHOTO_MIME_TYPE = 'image/jpeg';
export const MAX_REPORT_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_REPORT_NOTE_LENGTH = 500;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const addressKeys = [
  'formatted_address',
  'street_number',
  'street',
  'city',
  'district',
  'region',
  'postal_code',
  'country',
] as const;

export type SubmissionSeverity = 'SMALL' | 'MEDIUM' | 'DANGEROUS';

export type SubmissionPotholeStatus =
  | 'REPORTED'
  | 'UNDER_REVIEW'
  | 'VERIFIED'
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'REPAIRED'
  | 'REJECTED'
  | 'DUPLICATE';

export type NormalizedAddress = {
  formattedAddress: string | null;
  streetNumber: string | null;
  street: string | null;
  city: string | null;
  district: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
};

export type FinalSubmissionInput = {
  submissionId: string;
  storagePath: string;
  existingPotholePublicId: string | null;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  address: NormalizedAddress;
  severity: SubmissionSeverity;
  note: string | null;
};

export type SubmissionResult = {
  potholeId: string;
  reportId: string;
  publicId: string;
  status: SubmissionPotholeStatus;
  matchedExisting: boolean;
  reportCount: number;
};

export type FinalizationRpcRow = {
  outcome: 'FINALIZED';
  pothole_id: string;
  report_id: string;
  public_id: string;
  status: SubmissionPotholeStatus;
  matched_existing: boolean;
  report_count: number;
};

export class InvalidSubmissionInputError extends Error {}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new InvalidSubmissionInputError('request body must be valid JSON');
  }
}

export function parsePrepareUploadInput(value: unknown): { submissionId: string | null } {
  const body = asRecord(value);
  assertOnlyKeys(body, ['submission_id']);

  const submissionId = body.submission_id;

  if (submissionId === undefined || submissionId === null) {
    return { submissionId: null };
  }

  if (!isUuid(submissionId)) {
    throw new InvalidSubmissionInputError('submission_id must be a UUID');
  }

  return { submissionId };
}

export function parseFinalSubmissionInput(value: unknown): FinalSubmissionInput {
  const body = asRecord(value);
  assertOnlyKeys(body, [
    'submission_id',
    'storage_path',
    'latitude',
    'longitude',
    'accuracy',
    'address',
    'severity',
    'note',
    'existing_pothole_public_id',
  ]);

  if (!isUuid(body.submission_id)) {
    throw new InvalidSubmissionInputError('submission_id must be a UUID');
  }

  if (typeof body.storage_path !== 'string' || body.storage_path.length === 0) {
    throw new InvalidSubmissionInputError('storage_path is required');
  }

  const latitude = parseFiniteNumber(body.latitude, 'latitude');
  const longitude = parseFiniteNumber(body.longitude, 'longitude');

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new InvalidSubmissionInputError('coordinates are out of range');
  }

  const accuracy = parseNullableFiniteNumber(body.accuracy, 'accuracy');

  if (accuracy !== null && (accuracy < 0 || accuracy >= 100000)) {
    throw new InvalidSubmissionInputError('accuracy is out of range');
  }

  if (!isSubmissionSeverity(body.severity)) {
    throw new InvalidSubmissionInputError('severity is invalid');
  }

  const address = parseAddress(body.address);
  const note = parseNullableString(body.note, MAX_REPORT_NOTE_LENGTH, 'note');
  const existingPotholePublicId = parseNullablePotholePublicId(body.existing_pothole_public_id);

  return {
    submissionId: body.submission_id,
    storagePath: body.storage_path,
    existingPotholePublicId,
    latitude,
    longitude,
    accuracy,
    address,
    severity: body.severity,
    note,
  };
}

export function buildReportPhotoPath(userId: string, submissionId: string): string {
  return `submissions/${userId}/${submissionId}.jpg`;
}

export function isJpegSignature(bytes: ArrayBuffer): boolean {
  const header = new Uint8Array(bytes.slice(0, 3));

  return header.length === 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
}

export function isFinalizationRpcRow(value: unknown): value is FinalizationRpcRow {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.outcome === 'FINALIZED' &&
    isUuid(value.pothole_id) &&
    isUuid(value.report_id) &&
    typeof value.public_id === 'string' &&
    /^MTL-[0-9]{6}$/.test(value.public_id) &&
    isSubmissionPotholeStatus(value.status) &&
    typeof value.matched_existing === 'boolean' &&
    isNonNegativeInteger(value.report_count)
  );
}

export function toSubmissionResult(value: FinalizationRpcRow): SubmissionResult {
  return {
    potholeId: value.pothole_id,
    reportId: value.report_id,
    publicId: value.public_id,
    status: value.status,
    matchedExisting: value.matched_existing,
    reportCount: value.report_count,
  };
}

function parseNullablePotholePublicId(value: unknown): string | null {
  // Omission remains equivalent to the established new-pothole path so an
  // already-installed mobile client remains compatible with the updated Edge
  // Function during a staged rollout.
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string' || !/^MTL-[0-9]{6}$/.test(value)) {
    throw new InvalidSubmissionInputError('existing_pothole_public_id is invalid');
  }

  return value;
}

function parseAddress(value: unknown): NormalizedAddress {
  const address = asRecord(value);
  assertOnlyKeys(address, addressKeys);

  return {
    formattedAddress: parseNullableString(address.formatted_address, 500, 'formatted_address'),
    streetNumber: parseNullableString(address.street_number, 32, 'street_number'),
    street: parseNullableString(address.street, 255, 'street'),
    city: parseNullableString(address.city, 160, 'city'),
    district: parseNullableString(address.district, 160, 'district'),
    region: parseNullableString(address.region, 160, 'region'),
    postalCode: parseNullableString(address.postal_code, 32, 'postal_code'),
    country: parseNullableString(address.country, 160, 'country'),
  };
}

function parseNullableString(value: unknown, maxLength: number, fieldName: string): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new InvalidSubmissionInputError(`${fieldName} must be a string or null`);
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    return null;
  }

  if (normalizedValue.length > maxLength) {
    throw new InvalidSubmissionInputError(`${fieldName} is too long`);
  }

  return normalizedValue;
}

function parseFiniteNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidSubmissionInputError(`${fieldName} must be finite`);
  }

  return value;
}

function parseNullableFiniteNumber(value: unknown, fieldName: string): number | null {
  if (value === null) {
    return null;
  }

  return parseFiniteNumber(value, fieldName);
}

function isSubmissionSeverity(value: unknown): value is SubmissionSeverity {
  return value === 'SMALL' || value === 'MEDIUM' || value === 'DANGEROUS';
}

export function isSubmissionPotholeStatus(value: unknown): value is SubmissionPotholeStatus {
  return (
    value === 'REPORTED' ||
    value === 'UNDER_REVIEW' ||
    value === 'VERIFIED' ||
    value === 'ASSIGNED' ||
    value === 'ACCEPTED' ||
    value === 'IN_PROGRESS' ||
    value === 'REPAIRED' ||
    value === 'REJECTED' ||
    value === 'DUPLICATE'
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InvalidSubmissionInputError('request body must be an object');
  }

  return value as Record<string, unknown>;
}

function assertOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]) {
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw new InvalidSubmissionInputError('request body contains an unknown field');
  }
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
