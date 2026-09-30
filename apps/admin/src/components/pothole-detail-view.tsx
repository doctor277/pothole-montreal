"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { AiAssessmentCard } from "@/components/ai-assessment-card";
import { ModerationActions } from "@/components/moderation-actions";
import { ReportCard } from "@/components/report-card";
import { StatusBadge } from "@/components/status-badge";
import { StatusHistory } from "@/components/status-history";
import { useAdminSession } from "@/components/admin-session-provider";
import { formatAddress, formatCoordinates, formatMontrealDateTime } from "@/lib/format";
import { AdminApiError, adminApi } from "@/services/admin-api";
import type { AdminAnalyzePotholeResult, AdminPotholeDetail, AdminTransitionTarget } from "@/types/admin";

type DetailState =
  | { kind: "loading" }
  | { kind: "ready"; detail: AdminPotholeDetail }
  | { kind: "not-found" }
  | { kind: "error" };

export function PotholeDetailView({ publicId }: { publicId: string }) {
  const { invalidateQueue } = useAdminSession();
  const [state, setState] = useState<DetailState>({ kind: "loading" });
  const requestNumber = useRef(0);

  const loadDetail = useCallback(
    async () => {
      const requestId = ++requestNumber.current;

      try {
        const detail = await adminApi.getPothole(publicId);
        if (requestId === requestNumber.current) {
          setState({ kind: "ready", detail });
        }
      } catch (error) {
        if (requestId !== requestNumber.current) {
          return;
        }

        setState(
          error instanceof AdminApiError && error.kind === "not-found"
            ? { kind: "not-found" }
            : { kind: "error" },
        );
      }
    },
    [publicId],
  );

  useEffect(() => {
    // Start the network request after the initial render commits. This keeps
    // the effect from synchronously scheduling a render while still loading
    // the protected detail as soon as the membership gate mounts it.
    const timer = window.setTimeout(() => {
      void loadDetail();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadDetail]);

  async function handleTransition(targetStatus: AdminTransitionTarget, reason?: string | null) {
    try {
      await adminApi.updatePotholeStatus({ publicId, targetStatus, reason });
      invalidateQueue();
      await loadDetail();
    } catch (error) {
      if (error instanceof AdminApiError && error.kind === "conflict") {
        invalidateQueue();
        await loadDetail();
      }

      throw error;
    }
  }

  function handleAiAssessment(result: AdminAnalyzePotholeResult) {
    setState((currentState) =>
      currentState.kind === "ready" && currentState.detail.pothole.publicId === publicId
        ? {
            kind: "ready",
            detail: {
              ...currentState.detail,
              aiAssessment: result.assessment,
              aiAssessmentCount: result.assessmentCount,
              shadowAutomation: result.shadowAutomation,
            },
          }
        : currentState,
    );
  }

  if (state.kind === "loading") {
    return <DetailLoading />;
  }

  if (state.kind === "not-found") {
    return <DetailMessage title="Pothole not found" message="This canonical pothole is unavailable or no longer exists." />;
  }

  if (state.kind === "error") {
    return (
      <DetailMessage
        title="Detail unavailable"
        message="We could not load this moderation record. No citizen evidence is shown."
        onRetry={() => {
          setState({ kind: "loading" });
          void loadDetail();
        }}
      />
    );
  }

  const { pothole, reports, statusEvents } = state.detail;

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-7 sm:px-8 lg:px-10 lg:py-10">
      <Link
        href="/queue"
        className="inline-flex text-sm font-semibold text-teal-800 underline decoration-teal-300 underline-offset-4 hover:text-teal-950 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
      >
        ← Back to moderation queue
      </Link>

      <div className="mt-5 flex flex-col gap-5 border-b border-slate-200 pb-7 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Canonical road defect</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-3xl font-semibold tracking-tight text-[#082f49]">{pothole.publicId}</h1>
            <StatusBadge status={pothole.status} />
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{formatAddress(pothole.address)}</p>
        </div>
        <div className="rounded-lg border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-950">
          <p className="font-semibold">{pothole.reportCount} citizen report{pothole.reportCount === 1 ? "" : "s"}</p>
          <p className="mt-1 text-xs text-teal-800">Created {formatMontrealDateTime(pothole.createdAt)}</p>
        </div>
      </div>

      <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1.55fr)_minmax(21rem,0.85fr)]">
        <div className="space-y-7">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Location</p>
            <h2 className="mt-1 text-xl font-semibold text-[#082f49]">Canonical location</h2>
            <p className="mt-3 text-sm text-slate-700">{formatAddress(pothole.address)}</p>
            <div className="mt-4 rounded-lg bg-slate-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Coordinates</p>
              <p className="mt-1 font-mono text-sm font-semibold text-slate-800">
                {formatCoordinates(pothole.latitude, pothole.longitude)}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                This first admin release uses a coordinate panel rather than a third-party web map, so no paid map key or provider account is required.
              </p>
            </div>
          </section>

          <section>
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Evidence</p>
                <h2 className="mt-1 text-xl font-semibold text-[#082f49]">Citizen reports</h2>
              </div>
              <span className="text-sm font-medium text-slate-500">{reports.length} shown</span>
            </div>
            <div className="mt-4 space-y-4">
              {reports.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-sm text-slate-600">
                  No linked report details are available.
                </p>
              ) : (
                reports.map((report, index) => <ReportCard key={report.id} report={report} index={index} />)
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-7">
          <ModerationActions publicId={pothole.publicId} status={pothole.status} onTransition={handleTransition} />
          <AiAssessmentCard
            publicId={pothole.publicId}
            analysisEnabled={state.detail.aiAnalysisEnabled}
            assessmentAvailability={state.detail.aiAssessmentAvailability}
            assessment={state.detail.aiAssessment}
            assessmentCount={state.detail.aiAssessmentCount}
            shadowAutomation={state.detail.shadowAutomation}
            onAssessment={handleAiAssessment}
          />
          <StatusHistory pothole={pothole} events={statusEvents} />
        </aside>
      </div>
    </div>
  );
}

function DetailLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-7 sm:px-8 lg:px-10 lg:py-10">
      <div className="h-5 w-48 animate-pulse rounded bg-slate-200" />
      <div className="mt-5 h-10 w-64 animate-pulse rounded bg-slate-200" />
      <div className="mt-8 grid gap-7 xl:grid-cols-[minmax(0,1.55fr)_minmax(21rem,0.85fr)]">
        <div className="h-96 animate-pulse rounded-xl bg-slate-200" />
        <div className="h-64 animate-pulse rounded-xl bg-slate-200" />
      </div>
    </div>
  );
}

function DetailMessage({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl items-center px-5 py-7 sm:px-8">
      <section className="w-full rounded-xl border border-slate-200 bg-white p-7 shadow-sm">
        <h1 className="text-2xl font-semibold text-[#082f49]">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md bg-[#0f766e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#115e59] focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
            >
              Try again
            </button>
          )}
          <Link
            href="/queue"
            className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
          >
            Back to queue
          </Link>
        </div>
      </section>
    </div>
  );
}
