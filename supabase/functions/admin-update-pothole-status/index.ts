import { withSupabase } from 'npm:@supabase/server@1.4.1';

import {
  AdminAuthorizationError,
  requireActiveAdmin,
  toAdminAuthorizationResponse,
} from '../_shared/admin-auth.ts';
import {
  InvalidAdminTransitionInputError,
  parseAdminTransitionInput,
  toAdminTransitionResponse,
  toTransitionResult,
} from '../_shared/admin-moderation-contract.ts';

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    if (request.method !== 'POST') {
      return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    }

    try {
      const admin = await requireActiveAdmin(context);
      const input = parseAdminTransitionInput(await readJsonBody(request));
      const { data, error } = await context.supabaseAdmin.rpc(
        'admin_transition_pothole_status',
        {
          p_public_id: input.publicId,
          p_actor_user_id: admin.userId,
          p_target_status: input.targetStatus,
          p_reason: input.reason,
        },
      );

      const result = toTransitionResult(data);

      if (error || !result) {
        console.error('admin-update-pothole-status failed');
        return Response.json({ error: 'status_update_failed' }, { status: 500 });
      }

      return toAdminTransitionResponse(result);
    } catch (error) {
      if (error instanceof AdminAuthorizationError) {
        return toAdminAuthorizationResponse(error);
      }

      if (error instanceof InvalidAdminTransitionInputError) {
        return Response.json({ error: 'invalid_request' }, { status: 400 });
      }

      console.error('admin-update-pothole-status failed');
      return Response.json({ error: 'status_update_failed' }, { status: 500 });
    }
  }),
};

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new InvalidAdminTransitionInputError('request body must be valid JSON');
  }
}
