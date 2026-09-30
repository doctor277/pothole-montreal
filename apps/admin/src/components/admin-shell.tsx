"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

type AdminShellProps = {
  email: string | null;
  onSignOut: () => Promise<void>;
  children: React.ReactNode;
};

const navigation = [
  { href: "/queue?filter=all", label: "Dashboard" },
  { href: "/queue", label: "Review queue" },
  { href: "/queue?filter=verified", label: "Verified" },
  { href: "/queue?filter=rejected", label: "Rejected" },
] as const;

export function AdminShell({ email, onSignOut, children }: AdminShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    await onSignOut();
  }

  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)]">
      <aside className="border-b border-slate-200 bg-[#082f49] text-slate-100 lg:min-h-screen lg:border-r lg:border-b-0">
        <div className="flex h-full flex-col px-5 py-6 lg:px-6">
          <Link href="/queue" className="group rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">Operations</p>
            <p className="mt-2 text-xl font-semibold tracking-tight text-white">Pothole MTL Admin</p>
          </Link>

          <nav className="mt-8 flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible" aria-label="Admin navigation">
            {navigation.map((item) => {
              const itemFilter = item.href.split("?filter=")[1] ?? "review";
              const activeFilter = searchParams.get("filter") ?? "review";
              const active = pathname === "/queue" && activeFilter === itemFilter;

              return (
                <Link
                  key={`${item.href}-${item.label}`}
                  href={item.href}
                  className={`shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-teal-300 ${
                    active
                      ? "bg-white/12 text-white"
                      : "text-slate-300 hover:bg-white/8 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-7 border-t border-white/15 pt-5 lg:mt-auto">
            <p className="truncate text-xs text-slate-300">{email ?? "Authorized administrator"}</p>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="mt-3 inline-flex rounded-md border border-white/20 px-3 py-2 text-sm font-semibold text-white transition hover:border-teal-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-teal-300"
            >
              {isSigningOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </div>
      </aside>

      <main className="min-w-0">{children}</main>
    </div>
  );
}
