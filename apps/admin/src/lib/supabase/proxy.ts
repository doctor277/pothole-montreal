import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublicConfiguration } from "./config";

const protectedPaths = ["/queue", "/potholes"];

/**
 * Refreshes Supabase SSR cookies on navigation. It performs only an
 * authentication check: active-admin membership is deliberately checked by
 * the protected Edge Functions, not on every Next.js request.
 */
export async function updateSession(request: NextRequest) {
  const { url, publishableKey } = getSupabasePublicConfiguration();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // getClaims validates/refetches the session. Do not use getSession() as a
  // server-side authorization decision.
  const { data, error } = await supabase.auth.getClaims();
  const isAuthenticated = !error && Boolean(data?.claims);
  const pathname = request.nextUrl.pathname;
  const isProtectedPath = protectedPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (isProtectedPath && !isAuthenticated) {
    return redirectWithSessionCookies(new URL("/login", request.url), response);
  }

  if (pathname === "/login" && isAuthenticated) {
    return redirectWithSessionCookies(new URL("/queue", request.url), response);
  }

  return response;
}

function redirectWithSessionCookies(url: URL, source: NextResponse) {
  const redirect = NextResponse.redirect(url);
  source.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
