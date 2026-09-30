import { redirect } from "next/navigation";

import { AdminSessionProvider } from "@/components/admin-session-provider";
import { createClient } from "@/lib/supabase/server";

/**
 * Route-level authentication is separate from membership authorization. The
 * latter stays in the protected Edge Functions so the browser never receives
 * direct access to the private membership table.
 */
export default async function AuthenticatedAdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/login");
  }

  return <AdminSessionProvider>{children}</AdminSessionProvider>;
}
