import { withSupabase } from 'npm:@supabase/server@1.4.1';

import { handleAdminListPotholes } from '../_shared/admin-list-potholes.ts';

export default {
  fetch: withSupabase({ auth: 'user' }, handleAdminListPotholes),
};
