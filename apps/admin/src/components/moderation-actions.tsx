"use client";

import { useState } from "react";

import { AdminApiError } from "@/services/admin-api";
import type { AdminTransitionTarget, PotholeStatus } from "@/types/admin";

type ActionMode = "review" | "verify" | "reject" | null;

const rejectionPresets = [
  "Not a pothole",
  "Duplicate/incorrect submission",
  "Location cannot be verified",
  "Photo does not show road damage",
] as const;

export function ModerationActions({
  publicId,
  status,
  onTransition,
}: {
  publicId: string;
  status: PotholeStatus;
  onTransition: (targetStatus: AdminTransitionTarget, reason?: string | null) => Promise<void>;
}) {
  const [mode, setMode] = useState<ActionMode>(null);
  const [isConfirmingReject, setIsConfirmingReject] = useState(false);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  async function submit(targetStatus: AdminTransitionTarget, submittedReason?: string | null) {
    setFeedback(null);
    setIsSubmitting(true);

    try {
      await onTransition(targetStatus, submittedReason);
      setFeedback({ kind: "success", message: "Status updated and audit history refreshed." });
      setMode(null);
      setIsConfirmingReject(false);
      setReason("");
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof AdminApiError && error.kind === "conflict"
            ? "This pothole changed status elsewhere. The latest details have been refreshed."
            : "The status was not changed. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const normalizedReason = reason.trim();
  const rejectionReasonValid = normalizedReason.length > 0 && normalizedReason.length <= 500;
  const activeMode =
    (mode === "review" && status === "REPORTED") ||
    ((mode === "verify" || mode === "reject") && status === "UNDER_REVIEW")
      ? mode
      : null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Human decision</p>
      <h2 className="mt-1 text-xl font-semibold text-[#082f49]">Moderation actions</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Available actions are limited to the initial human moderation workflow for {publicId}.
      </p>

      {feedback && (
        <p
          role={feedback.kind === "error" ? "alert" : "status"}
          className={`mt-4 rounded-md border px-3 py-2.5 text-sm ${
            feedback.kind === "success"
              ? "border-teal-200 bg-teal-50 text-teal-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {feedback.message}
        </p>
      )}

      {status === "REPORTED" && activeMode === null && (
        <button
          type="button"
          onClick={() => setMode("review")}
          className="mt-5 rounded-md bg-[#0f766e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#115e59] focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
        >
          Start review
        </button>
      )}

      {status === "UNDER_REVIEW" && activeMode === null && (
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setMode("verify")}
            className="rounded-md bg-[#0f766e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#115e59] focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
          >
            Verify pothole
          </button>
          <button
            type="button"
            onClick={() => setMode("reject")}
            className="rounded-md border border-rose-300 px-4 py-2.5 text-sm font-semibold text-rose-800 hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
          >
            Reject pothole
          </button>
        </div>
      )}

      {activeMode === "review" && (
        <ConfirmationCard
          title="Start review?"
          description={`This will mark ${publicId} as under review and record an audit event.`}
          confirmLabel="Start review"
          isSubmitting={isSubmitting}
          onCancel={() => setMode(null)}
          onConfirm={() => void submit("UNDER_REVIEW")}
        />
      )}

      {activeMode === "verify" && (
        <ConfirmationCard
          title="Verify pothole?"
          description={`This confirms that ${publicId} represents valid road damage and records an audit event.`}
          confirmLabel="Verify pothole"
          isSubmitting={isSubmitting}
          onCancel={() => setMode(null)}
          onConfirm={() => void submit("VERIFIED")}
        />
      )}

      {activeMode === "reject" && !isConfirmingReject && (
        <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-4">
          <h3 className="font-semibold text-rose-950">Reject this canonical pothole</h3>
          <p className="mt-1 text-sm leading-6 text-rose-900">
            This marks the canonical record as invalid. Citizen evidence is retained. A reason is required.
          </p>
          <div className="mt-4 flex flex-wrap gap-2" aria-label="Rejection reason presets">
            {rejectionPresets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setReason(preset)}
                disabled={isSubmitting}
                className="rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
              >
                {preset}
              </button>
            ))}
          </div>
          <label className="mt-4 block text-sm font-semibold text-rose-950">
            Rejection reason
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              rows={4}
              disabled={isSubmitting}
              placeholder="Explain why this canonical pothole should be rejected."
              className="mt-1.5 block w-full resize-y rounded-md border border-rose-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 disabled:bg-slate-100"
            />
          </label>
          <p className="mt-1 text-right text-xs text-rose-800">{reason.length}/500</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setIsConfirmingReject(true)}
              disabled={!rejectionReasonValid || isSubmitting}
              className="rounded-md bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-rose-600 focus:ring-offset-2"
            >
              Continue to confirmation
            </button>
            <button
              type="button"
              onClick={() => setMode(null)}
              disabled={isSubmitting}
              className="rounded-md border border-rose-300 px-4 py-2.5 text-sm font-semibold text-rose-900 hover:bg-white disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {activeMode === "reject" && isConfirmingReject && (
        <ConfirmationCard
          title="Reject pothole?"
          description={`This will mark ${publicId} as rejected and save the following reason in the audit history: “${normalizedReason}”`}
          confirmLabel="Reject pothole"
          tone="danger"
          isSubmitting={isSubmitting}
          onCancel={() => setIsConfirmingReject(false)}
          onConfirm={() => void submit("REJECTED", normalizedReason)}
        />
      )}

      {status !== "REPORTED" && status !== "UNDER_REVIEW" && activeMode === null && (
        <p className="mt-5 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
          No Milestone 9 moderation action is available for this status.
        </p>
      )}
    </section>
  );
}

function ConfirmationCard({
  title,
  description,
  confirmLabel,
  tone = "primary",
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "primary" | "danger";
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const buttonClass =
    tone === "danger"
      ? "bg-rose-700 hover:bg-rose-800 focus:ring-rose-600"
      : "bg-[#0f766e] hover:bg-[#115e59] focus:ring-teal-600";

  return (
    <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <h3 className="font-semibold text-amber-950">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-amber-900">{description}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onConfirm}
          disabled={isSubmitting}
          className={`rounded-md px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-offset-2 ${buttonClass}`}
        >
          {isSubmitting ? "Updating…" : confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="rounded-md border border-amber-300 px-4 py-2.5 text-sm font-semibold text-amber-950 hover:bg-white disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
