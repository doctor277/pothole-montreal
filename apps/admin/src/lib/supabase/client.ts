"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicConfiguration } from "./config";

let browserClient: SupabaseClient | undefined;

/**
 * A single browser client persists the signed-in administrator session in the
 * SSR cookie storage. It deliberately has only the public URL/key; it cannot
 * directly access privileged tables, RPCs, or private Storage objects.
 */
export function createClient(): SupabaseClient {
  if (browserClient) {
    return browserClient;
  }

  const { url, publishableKey } = getSupabasePublicConfiguration();
  browserClient = createBrowserClient(url, publishableKey);
  return browserClient;
}
