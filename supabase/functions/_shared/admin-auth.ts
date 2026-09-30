import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.4';

type SupabaseFunctionContext = {
  supabase: SupabaseClient;
  supabaseAdmin: SupabaseClient;
};

export type ActiveAdmin = {
  userId: string;
  email: string | null;
};

export class AdminAuthorizationError extends Error {
  readonly status: 401 | 403 | 500;
  readonly code: 'unauthorized' | 'forbidden' | 'admin_authorization_failed';

  constructor(status: 401 | 403 | 500, code: AdminAuthorizationError['code']) {
    super(code);
    this.name = 'AdminAuthorizationError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Validates the caller's JWT with the request-scoped client, then checks the
 * private active-admin allowlist with the service-role client. The browser
 * never receives direct access to `admin_users`.
 */
export async function requireActiveAdmin(
  context: SupabaseFunctionContext,
): Promise<ActiveAdmin> {
  const { data: userData, error: userError } = await context.supabase.auth.getUser();
  const user = userData.user;

  if (userError || !user) {
    throw new AdminAuthorizationError(401, 'unauthorized');
  }

  // The dashboard supports only email/password administrators. Anonymous
  // sessions must never become an administrative path, even if an allowlist
  // row were added accidentally.
  if (user.is_anonymous || !user.email) {
    throw new AdminAuthorizationError(403, 'forbidden');
  }

  const { data: membership, error: membershipError } = await context.supabaseAdmin
    .from('admin_users')
    .select('is_active')
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError) {
    // Do not expose database details or authorization material to the caller.
    console.error('admin membership lookup failed');
    throw new AdminAuthorizationError(500, 'admin_authorization_failed');
  }

  if (!membership || membership.is_active !== true) {
    throw new AdminAuthorizationError(403, 'forbidden');
  }

  return {
    userId: user.id,
    email: user.email,
  };
}

export function toAdminAuthorizationResponse(error: AdminAuthorizationError): Response {
  return Response.json({ error: error.code }, { status: error.status });
}
