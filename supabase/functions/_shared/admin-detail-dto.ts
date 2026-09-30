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

export type PotholeStatus = (typeof potholeStatuses)[number];
export type ReportSeverity = (typeof reportSeverities)[number];

export type AddressSnapshot = {
  formatted_address: string | null;
  street_number: string | null;
  street: string | null;
  city: string | null;
  district: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
};

export type RawPhoto = {
  storage_path: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  created_at: string;
};

export type RawReport = AddressSnapshot & {
  id: string;
  severity: ReportSeverity;
  note: string | null;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  matched_existing_pothole: boolean;
  created_at: string;
  photos: RawPhoto[];
};

export type RawStatusEvent = {
  from_status: PotholeStatus;
  to_status: PotholeStatus;
  reason: string | null;
  created_at: string;
};

export type RawPothole = AddressSnapshot & {
  public_id: string;
  status: PotholeStatus;
  latitude: number;
  longitude: number;
  report_count: number;
  created_at: string;
  updated_at: string;
  repaired_at: string | null;
};

export type RawAdminDetail = {
  pothole: RawPothole;
  reports: RawReport[];
  status_events: RawStatusEvent[];
};

export type AdminAddressDto = {
  formattedAddress: string | null;
  streetNumber: string | null;
  street: string | null;
  city: string | null;
  district: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
};

export type AdminPhotoDto = {
  mimeType: string | null;
  fileSizeBytes: number | null;
  createdAt: string;
  available: boolean;
  signedUrl: string | null;
  expiresInSeconds: number | null;
};

export type AdminDetailDto = {
  pothole: {
    publicId: string;
    status: PotholeStatus;
    latitude: number;
    longitude: number;
    reportCount: number;
    address: AdminAddressDto;
    createdAt: string;
    updatedAt: string;
    repairedAt: string | null;
  };
  reports: Array<{
    id: string;
    severity: ReportSeverity;
    note: string | null;
    latitude: number;
    longitude: number;
    accuracyMeters: number | null;
    matchedExistingPothole: boolean;
    address: AdminAddressDto;
    createdAt: string;
    photos: AdminPhotoDto[];
  }>;
  statusEvents: Array<{
    fromStatus: PotholeStatus;
    toStatus: PotholeStatus;
    reason: string | null;
    createdAt: string;
  }>;
};

/**
 * Validates the deliberately narrow JSON returned by the service-role RPC.
 * Unknown properties are discarded rather than being forwarded to a browser.
 */
export function parseAdminDetail(value: unknown): RawAdminDetail | null {
  if (!isRecord(value)) {
    return null;
  }

  const pothole = toRawPothole(value.pothole);
  const reports = toRawReports(value.reports);
  const statusEvents = toRawStatusEvents(value.status_events);

  if (!pothole || !reports || !statusEvents) {
    return null;
  }

  return { pothole, reports, status_events: statusEvents };
}

/**
 * Creates the browser DTO from validated raw RPC data. The only raw private
 * value passed onward is a Storage path supplied to the server-only signer;
 * its resulting signed URL is the sole photo location exposed to an admin.
 */
export async function toAdminDetailDto(
  detail: RawAdminDetail,
  signPhoto: (photo: RawPhoto) => Promise<AdminPhotoDto>,
): Promise<AdminDetailDto> {
  return {
    pothole: {
      publicId: detail.pothole.public_id,
      status: detail.pothole.status,
      latitude: detail.pothole.latitude,
      longitude: detail.pothole.longitude,
      reportCount: detail.pothole.report_count,
      address: toAddressSnapshot(detail.pothole),
      createdAt: detail.pothole.created_at,
      updatedAt: detail.pothole.updated_at,
      repairedAt: detail.pothole.repaired_at,
    },
    reports: await Promise.all(
      detail.reports.map(async (report) => ({
        id: report.id,
        severity: report.severity,
        note: report.note,
        latitude: report.latitude,
        longitude: report.longitude,
        accuracyMeters: report.accuracy_meters,
        matchedExistingPothole: report.matched_existing_pothole,
        address: toAddressSnapshot(report),
        createdAt: report.created_at,
        photos: await Promise.all(report.photos.map((photo) => signPhoto(photo))),
      })),
    ),
    statusEvents: detail.status_events.map((event) => ({
      fromStatus: event.from_status,
      toStatus: event.to_status,
      reason: event.reason,
      createdAt: event.created_at,
    })),
  };
}

function toRawPothole(value: unknown): RawPothole | null {
  if (!isRecord(value) || !isAddressSnapshot(value)) {
    return null;
  }

  if (
    !isPublicId(value.public_id) ||
    !isPotholeStatus(value.status) ||
    !isLatitude(value.latitude) ||
    !isLongitude(value.longitude) ||
    !isNonNegativeInteger(value.report_count) ||
    !isTimestamp(value.created_at) ||
    !isTimestamp(value.updated_at) ||
    !isNullableTimestamp(value.repaired_at)
  ) {
    return null;
  }

  return {
    ...toAddressSnapshotRecord(value),
    public_id: value.public_id,
    status: value.status,
    latitude: value.latitude,
    longitude: value.longitude,
    report_count: value.report_count,
    created_at: value.created_at,
    updated_at: value.updated_at,
    repaired_at: value.repaired_at,
  };
}

function toRawReports(value: unknown): RawReport[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const reports = value.map(toRawReport);
  return reports.some((report) => report === null) ? null : (reports as RawReport[]);
}

function toRawReport(value: unknown): RawReport | null {
  if (!isRecord(value) || !isAddressSnapshot(value)) {
    return null;
  }

  const photos = toRawPhotos(value.photos);

  if (
    !isUuid(value.id) ||
    !isReportSeverity(value.severity) ||
    !isNullableString(value.note) ||
    !isLatitude(value.latitude) ||
    !isLongitude(value.longitude) ||
    !isNullableNonNegativeFiniteNumber(value.accuracy_meters) ||
    typeof value.matched_existing_pothole !== 'boolean' ||
    !isTimestamp(value.created_at) ||
    !photos
  ) {
    return null;
  }

  return {
    ...toAddressSnapshotRecord(value),
    id: value.id,
    severity: value.severity,
    note: value.note,
    latitude: value.latitude,
    longitude: value.longitude,
    accuracy_meters: value.accuracy_meters,
    matched_existing_pothole: value.matched_existing_pothole,
    created_at: value.created_at,
    photos,
  };
}

function toRawPhotos(value: unknown): RawPhoto[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const photos = value.map(toRawPhoto);
  return photos.some((photo) => photo === null) ? null : (photos as RawPhoto[]);
}

function toRawPhoto(value: unknown): RawPhoto | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !isSafeStoragePath(value.storage_path) ||
    !isNullableString(value.mime_type) ||
    !isNullableNonNegativeInteger(value.file_size_bytes) ||
    !isTimestamp(value.created_at)
  ) {
    return null;
  }

  return {
    storage_path: value.storage_path,
    mime_type: value.mime_type,
    file_size_bytes: value.file_size_bytes,
    created_at: value.created_at,
  };
}

function toRawStatusEvents(value: unknown): RawStatusEvent[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const events = value.map(toRawStatusEvent);
  return events.some((event) => event === null) ? null : (events as RawStatusEvent[]);
}

function toRawStatusEvent(value: unknown): RawStatusEvent | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !isPotholeStatus(value.from_status) ||
    !isPotholeStatus(value.to_status) ||
    !isNullableString(value.reason) ||
    !isTimestamp(value.created_at)
  ) {
    return null;
  }

  return {
    from_status: value.from_status,
    to_status: value.to_status,
    reason: value.reason,
    created_at: value.created_at,
  };
}

function isAddressSnapshot(value: Record<string, unknown>): value is AddressSnapshot & Record<string, unknown> {
  return [
    value.formatted_address,
    value.street_number,
    value.street,
    value.city,
    value.district,
    value.region,
    value.postal_code,
    value.country,
  ].every(isNullableString);
}

function toAddressSnapshotRecord(value: Record<string, unknown>): AddressSnapshot {
  return {
    formatted_address: value.formatted_address as string | null,
    street_number: value.street_number as string | null,
    street: value.street as string | null,
    city: value.city as string | null,
    district: value.district as string | null,
    region: value.region as string | null,
    postal_code: value.postal_code as string | null,
    country: value.country as string | null,
  };
}

function toAddressSnapshot(value: AddressSnapshot): AdminAddressDto {
  return {
    formattedAddress: value.formatted_address,
    streetNumber: value.street_number,
    street: value.street,
    city: value.city,
    district: value.district,
    region: value.region,
    postalCode: value.postal_code,
    country: value.country,
  };
}

function isPotholeStatus(value: unknown): value is PotholeStatus {
  return typeof value === 'string' && potholeStatuses.includes(value as PotholeStatus);
}

function isReportSeverity(value: unknown): value is ReportSeverity {
  return typeof value === 'string' && reportSeverities.includes(value as ReportSeverity);
}

export function isPublicId(value: unknown): value is string {
  return typeof value === 'string' && /^MTL-[0-9]{6}$/.test(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
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

function isNullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value);
}

function isNullableNonNegativeFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
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

function isSafeStoragePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.startsWith('/') &&
    !value.split('/').includes('..')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
