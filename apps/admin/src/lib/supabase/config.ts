export class SupabaseConfigurationError extends Error {
  constructor() {
    super("The admin Supabase public configuration is missing.");
    this.name = "SupabaseConfigurationError";
  }
}

export type SupabasePublicConfiguration = {
  url: string;
  publishableKey: string;
};

/**
 * These are intentionally the only Supabase environment values that the web
 * application can read. Both values are designed to be public build-time
 * configuration; privileged credentials belong only in hosted Edge Functions.
 */
export function getSupabasePublicConfiguration(): SupabasePublicConfiguration {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    throw new SupabaseConfigurationError();
  }

  return { url, publishableKey };
}
