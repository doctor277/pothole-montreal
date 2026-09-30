/**
 * Fail-closed server-side feature flag. Only the exact value `true` enables
 * paid AI analysis; missing, empty, differently-cased, or malformed values
 * remain disabled.
 */
export function isAiAnalysisEnabled(value: string | undefined): boolean {
  return value === 'true';
}
