"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { PotholeTable } from "@/components/pothole-table";
import { useAdminSession } from "@/components/admin-session-provider";
import { AdminApiError, adminApi } from "@/services/admin-api";
import { aiTriageFilters, matchesAiTriageFilter, type AiTriageFilter } from "@/lib/ai-triage";
import type { AdminQueueCursor, AdminQueueFilter, AdminQueueItem, PotholeStatus } from "@/types/admin";

type QueueState = {
  potholes: AdminQueueItem[];
  nextCursor: AdminQueueCursor | null;
  error: "unavailable" | "forbidden" | null;
};

const filters: Array<{
  id: AdminQueueFilter;
  label: string;
  statuses: PotholeStatus[] | null;
}> = [
  { id: "review", label: "Review queue", statuses: ["REPORTED", "UNDER_REVIEW"] },
  { id: "all", label: "All", statuses: null },
  { id: "reported", label: "Reported", statuses: ["REPORTED"] },
  { id: "under-review", label: "Under review", statuses: ["UNDER_REVIEW"] },
  { id: "verified", label: "Verified", statuses: ["VERIFIED"] },
  { id: "rejected", label: "Rejected", statuses: ["REJECTED"] },
];

export function QueueView({ filter }: { filter: AdminQueueFilter }) {
  const { queueVersion } = useAdminSession();
  const selectedFilter = filters.find((item) => item.id === filter) ?? filters[0];
  const [state, setState] = useState<QueueState>({ potholes: [], nextCursor: null, error: null });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [triageFilter, setTriageFilter] = useState<AiTriageFilter>("all");
  const visiblePotholes = state.potholes.filter((item) => matchesAiTriageFilter(item, triageFilter));
  const requestNumber = useRef(0);

  useEffect(() => {
    let mounted = true;
    const requestId = ++requestNumber.current;

    async function loadFirstPage() {
      setIsLoading(true);
      setState({ potholes: [], nextCursor: null, error: null });

      try {
        const response = await adminApi.listPotholes({ statuses: selectedFilter.statuses });
        if (mounted && requestId === requestNumber.current) {
          setState({ potholes: response.potholes, nextCursor: response.nextCursor, error: null });
        }
      } catch (error) {
        if (mounted && requestId === requestNumber.current) {
          setState({
            potholes: [],
            nextCursor: null,
            error: error instanceof AdminApiError && error.kind === "forbidden" ? "forbidden" : "unavailable",
          });
        }
      } finally {
        if (mounted && requestId === requestNumber.current) {
          setIsLoading(false);
        }
      }
    }

    void loadFirstPage();

    return () => {
      mounted = false;
    };
  }, [queueVersion, retryKey, selectedFilter.id, selectedFilter.statuses]);

  async function loadMore() {
    if (!state.nextCursor || isLoadingMore) {
      return;
    }

    const requestId = ++requestNumber.current;
    setIsLoadingMore(true);

    try {
      const response = await adminApi.listPotholes({
        statuses: selectedFilter.statuses,
        cursor: state.nextCursor,
      });

      if (requestId === requestNumber.current) {
        setState((current) => {
          const knownIds = new Set(current.potholes.map((item) => item.publicId));
          return {
            potholes: [
              ...current.potholes,
              ...response.potholes.filter((item) => !knownIds.has(item.publicId)),
            ],
            nextCursor: response.nextCursor,
            error: null,
          };
        });
      }
    } catch (error) {
      if (requestId === requestNumber.current) {
        setState((current) => ({
          ...current,
          error: error instanceof AdminApiError && error.kind === "forbidden" ? "forbidden" : "unavailable",
        }));
      }
    } finally {
      if (requestId === requestNumber.current) {
        setIsLoadingMore(false);
      }
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-7 sm:px-8 lg:px-10 lg:py-10">
      <div className="flex flex-col gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Human moderation</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#082f49]">Moderation queue</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Review canonical road defects and their citizen evidence. Status changes are recorded in an immutable moderation history.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2" aria-label="Queue filters">
        {filters.map((item) => (
          <Link
            key={item.id}
            href={filterHref(item.id)}
            className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 ${
              selectedFilter.id === item.id
                ? "border-[#0f766e] bg-[#0f766e] text-white"
                : "border-slate-300 bg-white text-slate-700 hover:border-teal-500 hover:bg-teal-50"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-violet-100 bg-violet-50/60 p-4">
        <label htmlFor="ai-triage-filter" className="text-sm font-medium text-violet-900">
          Shadow AI triage — loaded potholes only
        </label>
        <select
          id="ai-triage-filter"
          value={triageFilter}
          onChange={(event) => setTriageFilter(event.target.value as AiTriageFilter)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-600"
        >
          {aiTriageFilters.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <p className="w-full text-xs leading-5 text-slate-600">
          Read-only hints from existing assessments. Not moderation decisions. No AI runs on queue load.
          {" "}{visiblePotholes.length} of {state.potholes.length} loaded potholes shown; load more to search subsequent pages.
        </p>
      </div>

      <section className="mt-6" aria-live="polite">
        {isLoading ? (
          <LoadingState />
        ) : state.error === "forbidden" ? (
          <ErrorState
            title="Access changed"
            message="Your administrator access is no longer active. Sign out and contact a platform administrator if this is unexpected."
          />
        ) : state.error === "unavailable" && state.potholes.length === 0 ? (
          <ErrorState
            title="Queue unavailable"
            message="We could not load the moderation queue. No details were shown."
            onRetry={() => setRetryKey((value) => value + 1)}
          />
        ) : state.potholes.length === 0 ? (
          <EmptyState filter={selectedFilter.label} />
        ) : (
          <>
            {state.error === "unavailable" && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <span>Some queue data may be out of date. Try loading again.</span>
                <button
                  type="button"
                  onClick={() => setRetryKey((value) => value + 1)}
                  className="font-semibold underline decoration-amber-500 underline-offset-2"
                >
                  Retry
                </button>
              </div>
            )}
            {visiblePotholes.length ? (
              <PotholeTable potholes={visiblePotholes} />
            ) : (
              <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
                No loaded potholes match this shadow triage filter. Choose another filter or load more potholes.
              </p>
            )}
            {state.nextCursor && (
              <div className="mt-5 flex justify-center">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={isLoadingMore}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
                >
                  {isLoadingMore ? "Loading more…" : "Load more potholes"}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function filterHref(filter: AdminQueueFilter): string {
  return filter === "review" ? "/queue" : `/queue?filter=${filter}`;
}

function LoadingState() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
      <div className="mt-5 space-y-3">
        <div className="h-14 animate-pulse rounded bg-slate-100" />
        <div className="h-14 animate-pulse rounded bg-slate-100" />
        <div className="h-14 animate-pulse rounded bg-slate-100" />
      </div>
    </div>
  );
}

function EmptyState({ filter }: { filter: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-sm">
      <h2 className="text-lg font-semibold text-[#082f49]">No potholes in {filter.toLowerCase()}</h2>
      <p className="mt-2 text-sm text-slate-600">There are no canonical potholes matching this moderation filter.</p>
    </div>
  );
}

function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-xl border border-rose-200 bg-white p-7 shadow-sm">
      <h2 className="text-lg font-semibold text-[#082f49]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded-md bg-[#0f766e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#115e59] focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
        >
          Try again
        </button>
      )}
    </div>
  );
}
