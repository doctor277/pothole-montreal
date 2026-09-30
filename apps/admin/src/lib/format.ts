import type { AdminAddress } from "@/types/admin";

const montrealDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  dateStyle: "medium",
  timeStyle: "short",
});

const montrealDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  dateStyle: "medium",
});

export function formatMontrealDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : montrealDateTimeFormatter.format(date);
}

export function formatMontrealDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : montrealDateFormatter.format(date);
}

export function formatCoordinates(latitude: number, longitude: number): string {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

export function formatAddress(address: AdminAddress): string {
  if (address.formattedAddress) {
    return address.formattedAddress;
  }

  const streetLine = [address.streetNumber, address.street].filter(Boolean).join(" ");
  const fallback = [streetLine, address.district, address.city, address.region, address.postalCode]
    .filter(Boolean)
    .join(", ");

  return fallback || "Address unavailable";
}

export function formatFileSize(bytes: number | null): string {
  if (bytes === null) {
    return "Size unavailable";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
