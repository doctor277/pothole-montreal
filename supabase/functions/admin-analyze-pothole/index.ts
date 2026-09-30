import { withSupabase } from 'npm:@supabase/server@1.4.1';

import { handleAdminAnalyzePothole } from '../_shared/admin-analyze-pothole.ts';

export default {
  fetch: withSupabase({ auth: 'user' }, (request, context) =>
    handleAdminAnalyzePothole(request, context, {
      getAiAnalysisEnabled: () => Deno.env.get('AI_ANALYSIS_ENABLED'),
      getOpenAiApiKey: () => Deno.env.get('OPENAI_API_KEY'),
      getAiAutomationEnabled: () => Deno.env.get('AI_AUTOMATION_ENABLED'),
    }),
  ),
};
