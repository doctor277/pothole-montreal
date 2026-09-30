"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { createClient } from "@/lib/supabase/client";
import { AdminApiError, adminApi } from "@/services/admin-api";

type AdminSessionContextValue = {
  queueVersion: number;
  invalidateQueue: () => void;
};

const AdminSessionContext = createContext<AdminSessionContextValue | null>(null);

type AccessState =
  | { kind: "checking" }
  | { kind: "authorized"; email: string | null }
  | { kind: "forbidden" }
  | { kind: "error" };

export function useAdminSession() {
  const context = useContext(AdminSessionContext);

  if (!context) {
    throw new Error("useAdminSession must be used inside AdminSessionProvider.");
  }

  return context;
}

/**
 * Authentication is checked in the server route/proxy. This client gate then
 * asks the protected admin-me Edge Function for the separate active-membership
 * decision before it mounts any queue or detail data component.
 */
export function AdminSessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AccessState>({ kind: "checking" });
  const [attempt, setAttempt] = useState(0);
  const [queueVersion, setQueueVersion] = useState(0);

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      setState({ kind: "checking" });

      try {
        const identity = await adminApi.me();
        if (active) {
          setState({ kind: "authorized", email: identity.email });
        }
      } catch (error) {
        if (!active) {
          return;
        }

        if (error instanceof AdminApiError && error.kind === "forbidden") {
          setState({ kind: "forbidden" });
          return;
        }

        if (error instanceof AdminApiError && error.kind === "unauthenticated") {
          await createClient().auth.signOut({ scope: "local" });
          router.replace("/login");
          router.refresh();
          return;
        }

        setState({ kind: "error" });
      }
    }

    void checkAccess();

    return () => {
      active = false;
    };
  }, [attempt, router]);

  const signOut = useCallback(async () => {
    try {
      await createClient().auth.signOut({ scope: "local" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }, [router]);

  const contextValue = useMemo<AdminSessionContextValue>(
    () => ({
      queueVersion,
      invalidateQueue: () => setQueueVersion((value) => value + 1),
    }),
    [queueVersion],
  );

  if (state.kind === "checking") {
    return <AccessPanel title="Checking access" message="Verifying your administrator access…" />;
  }

  if (state.kind === "forbidden") {
    return (
      <AccessPanel
        title="You do not have access to this admin dashboard."
        message="Your signed-in account is not an active Pothole MTL administrator."
        actionLabel="Sign out"
        onAction={signOut}
      />
    );
  }

  if (state.kind === "error") {
    return (
      <AccessPanel
        title="We could not verify access"
        message="The administrator service is temporarily unavailable. No pothole data has been shown."
        actionLabel="Try again"
        onAction={async () => setAttempt((value) => value + 1)}
        secondaryActionLabel="Sign out"
        onSecondaryAction={signOut}
      />
    );
  }

  return (
    <AdminSessionContext.Provider value={contextValue}>
      <AdminShell email={state.email} onSignOut={signOut}>
        {children}
      </AdminShell>
    </AdminSessionContext.Provider>
  );
}

function AccessPanel({
  title,
  message,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => Promise<void>;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => Promise<void>;
}) {
  const [isWorking, setIsWorking] = useState(false);

  async function run(action: (() => Promise<void>) | undefined) {
    if (!action) {
      return;
    }

    setIsWorking(true);
    try {
      await action();
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-7 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Pothole MTL Admin</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[#082f49]">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
        {(actionLabel || secondaryActionLabel) && (
          <div className="mt-6 flex flex-wrap gap-3">
            {actionLabel && onAction && (
              <button
                type="button"
                onClick={() => void run(onAction)}
                disabled={isWorking}
                className="rounded-md bg-[#0f766e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#115e59] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
              >
                {actionLabel}
              </button>
            )}
            {secondaryActionLabel && onSecondaryAction && (
              <button
                type="button"
                onClick={() => void run(onSecondaryAction)}
                disabled={isWorking}
                className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
              >
                {secondaryActionLabel}
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
