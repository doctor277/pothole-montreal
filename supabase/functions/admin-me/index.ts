import { withSupabase } from 'npm:@supabase/server@1.4.1';

import {
  AdminAuthorizationError,
  requireActiveAdmin,
  toAdminAuthorizationResponse,
} from '../_shared/admin-auth.ts';

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    if (request.method !== 'POST') {
      return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    }

    try {
      const admin = await requireActiveAdmin(context);

      return Response.json({
        authorized: true,
        ...(admin.email ? { email: admin.email } : {}),
      });
    } catch (error) {
      if (error instanceof AdminAuthorizationError) {
        return toAdminAuthorizationResponse(error);
      }

      console.error('admin-me failed');
      return Response.json({ error: 'admin_unavailable' }, { status: 500 });
    }
  }),
};
