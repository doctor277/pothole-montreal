import type { ReportAddress, ReportLocation } from '@/src/types/report';

export type FormattedReportAddress = {
  primary: string;
  secondary: string | null;
};

export function hasValidReportLocation(location: ReportLocation | null): location is ReportLocation {
  return Boolean(
    location &&
      Number.isFinite(location.latitude) &&
      Number.isFinite(location.longitude) &&
      location.latitude >= -90 &&
      location.latitude <= 90 &&
      location.longitude >= -180 &&
      location.longitude <= 180,
  );
}

export function formatReportCoordinates(
  location: Pick<ReportLocation, 'latitude' | 'longitude'>,
): string {
  return `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
}

export function formatReportAddress(address: ReportAddress | null): FormattedReportAddress | null {
  if (!address) {
    return null;
  }

  const street = toNonEmpty(address.street);
  const streetLine = street
    ? [toNonEmpty(address.streetNumber), street].filter((part): part is string => Boolean(part)).join(' ')
    : null;
  const locality = toNonEmpty(address.district) ?? toNonEmpty(address.city);
  const regionAndPostalCode = [toNonEmpty(address.region), toNonEmpty(address.postalCode)]
    .filter((part): part is string => Boolean(part))
    .join(' ');
  const localityLine = [locality, regionAndPostalCode]
    .filter((part): part is string => Boolean(part))
    .join(', ');

  if (streetLine) {
    return {
      primary: streetLine,
      secondary: localityLine || null,
    };
  }

  if (localityLine) {
    return {
      primary: localityLine,
      secondary: null,
    };
  }

  return null;
}

function toNonEmpty(value: string | null): string | null {
  const trimmedValue = value?.trim();

  return trimmedValue || null;
}
