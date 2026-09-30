import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabasePublicConfiguration } from "./config";

/**
 * Always creates a fresh server client for a render. Token refresh writes are
 * primarily handled by src/proxy.ts; the try/catch is required because Server
 * Components cannot always write response cookies themselves.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabasePublicConfiguration();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // The request proxy owns refresh-cookie persistence for Server
          // Component renders, so this expected limitation is safe.
        }
      },
    },
  });
}
