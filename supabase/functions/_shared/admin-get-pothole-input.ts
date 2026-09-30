import { isPublicId } from './admin-detail-dto.ts';

export class InvalidAdminDetailInputError extends Error {}

/**
 * Parses the deliberately narrow request body accepted by admin-get-pothole.
 * Keeping it testable ensures the handler cannot lose its public-ID validator
 * during a future helper extraction.
 */
export function parseAdminGetPotholeInput(value: unknown): string {
  const body = asRecord(value);
  assertOnlyKeys(body, ['publicId']);

  if (!isPublicId(body.publicId)) {
    throw new InvalidAdminDetailInputError('publicId is invalid');
  }

  return body.publicId;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new InvalidAdminDetailInputError('request body must be an object');
  }

  return value;
}

function assertOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw new InvalidAdminDetailInputError('request body contains an unknown field');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
