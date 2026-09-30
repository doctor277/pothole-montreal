"use client";

import { useRef, useState } from "react";

import { formatMontrealDateTime } from "@/lib/format";
import { AdminApiError, adminApi } from "@/services/admin-api";
import type {
  AdminAiAssessment,
  AdminAnalyzePotholeResult,
  AiAssessmentAvailability,
  AiShadowAutomationDecision,
  AiShadowAutomationReason,
} from "@/types/admin";

export function AiAssessmentCard({
  publicId,
  analysisEnabled,
  assessmentAvailability,
  assessment,
  assessmentCount,
  shadowAutomation,
  onAssessment,
}: {
  publicId: string;
  analysisEnabled: boolean;
  assessmentAvailability: AiAssessmentAvailability;
  assessment: AdminAiAssessment | null;
  assessmentCount: number | null;
  shadowAutomation: AiShadowAutomationDecision | null;
  onAssessment: (result: AdminAnalyzePotholeResult) => void;
}) {
  const requestInFlight = useRef(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  async function handleAnalyze() {
    if (requestInFlight.current) {
      return;
    }

    requestInFlight.current = true;
    setIsAnalyzing(true);
    setFeedback(null);

    try {
      const result = await adminApi.analyzePothole(publicId);
      onAssessment(result);
      setFeedback({
        kind: "success",
        message: "AI assessment saved. Human moderation remains required.",
      });
    } catch (error) {
      setFeedback({ kind: "error", message: aiErrorMessage(error) });
    } finally {
      requestInFlight.current = false;
      setIsAnalyzing(false);
    }
  }

  const previousAssessmentCount = Math.max((assessmentCount ?? 0) - (assessment ? 1 : 0), 0);

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-5 shadow-sm sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">AI shadow mode</p>
      <h2 className="mt-1 text-xl font-semibold text-[#082f49]">AI Assessment</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        AI provides a visual assessment only. Human moderation remains required.
      </p>

      {!analysisEnabled && (
        <p className="mt-4 rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700">
          AI analysis is currently disabled.
        </p>
      )}

      {assessmentAvailability === "unavailable" && (
        <p
          role="status"
          className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950"
        >
          The AI assessment summary is currently unavailable. Human moderation remains available.
        </p>
      )}

      {feedback && (
        <p
          role={feedback.kind === "error" ? "alert" : "status"}
          className={`mt-4 rounded-md border px-3 py-2.5 text-sm ${
            feedback.kind === "success"
              ? "border-sky-200 bg-sky-50 text-sky-950"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {feedback.message}
        </p>
      )}

      {assessment ? (
        <AssessmentResult
          assessment={assessment}
          previousAssessmentCount={previousAssessmentCount}
          shadowAutomation={shadowAutomation}
        />
      ) : (
        <p className="mt-5 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-4 text-sm text-slate-600">
          AI analysis has not been run.
        </p>
      )}

      <button
        type="button"
        onClick={() => void handleAnalyze()}
        disabled={isAnalyzing || !analysisEnabled}
        aria-busy={isAnalyzing}
        className="mt-5 rounded-md border border-sky-300 bg-white px-4 py-2.5 text-sm font-semibold text-sky-900 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
      >
        {isAnalyzing ? "Analyzing photos…" : "Analyze with AI"}
      </button>

      <p className="mt-4 text-xs leading-5 text-slate-500">
        Shadow policy only — no automatic moderation action was performed.
      </p>
    </section>
  );
}

function AssessmentResult({
  assessment,
  previousAssessmentCount,
  shadowAutomation,
}: {
  assessment: AdminAiAssessment;
  previousAssessmentCount: number;
  shadowAutomation: AiShadowAutomationDecision | null;
}) {
  return (
    <div className="mt-5 space-y-5">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Classification</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {classificationLabel(assessment.classification)}
            </p>
          </div>
          <div className="rounded-full bg-sky-100 px-3 py-1 text-sm font-semibold text-sky-950">
            {formatConfidence(assessment.confidence)} confidence
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-sm">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Photo quality</dt>
            <dd className="mt-1 font-semibold text-slate-800">{titleCase(assessment.photoQuality)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Suggested severity</dt>
            <dd className="mt-1 font-semibold text-slate-800">{titleCase(assessment.suggestedSeverity)}</dd>
          </div>
        </dl>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-900">Summary</h3>
        <p className="mt-1 text-sm leading-6 text-slate-700">{assessment.summary}</p>
      </div>

      <AssessmentList title="Visible evidence" items={assessment.visibleEvidence} emptyText="No specific visible evidence was returned." />
      <AssessmentList title="Cautions" items={assessment.cautions} emptyText="No cautions were returned." />

      {shadowAutomation && <ShadowAutomationDecision decision={shadowAutomation} />}

      <div className="border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">
        <p>
          Model: <span className="font-mono text-slate-700">{assessment.model}</span>
        </p>
        <p>Analyzed {formatMontrealDateTime(assessment.createdAt)}</p>
        {previousAssessmentCount > 0 && <p>Previous assessments: {previousAssessmentCount}</p>}
      </div>
    </div>
  );
}

function ShadowAutomationDecision({ decision }: { decision: AiShadowAutomationDecision }) {
  return (
    <section className="rounded-lg border border-violet-200 bg-violet-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-800">
        Shadow automation simulation
      </p>
      <div className="mt-3 rounded-md border border-violet-100 bg-white/70 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Technical policy result
        </p>
        <dl className="mt-2 space-y-2 text-sm">
          <div>
            <dt className="inline text-slate-600">Would qualify: </dt>
            <dd className="inline font-semibold text-slate-900">
              {decision.technicallyEligible ? "Yes" : "No"}
            </dd>
          </div>
          <div>
            <dt className="inline text-slate-600">Policy version: </dt>
            <dd className="inline font-mono text-xs text-slate-800">{decision.policyVersion}</dd>
          </div>
        </dl>
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Technical reasons
          </p>
          {decision.technicalReasons.length === 0 ? (
            <p className="mt-1 text-sm text-slate-700">All technical policy criteria passed.</p>
          ) : (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {decision.technicalReasons.map((reason) => (
                <li key={reason}>{shadowReasonLabel(reason)}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="inline text-slate-600">Automation enabled: </dt>
          <dd className="inline font-semibold text-slate-900">
            {decision.automationOperationallyEnabled ? "Yes" : "No"}
          </dd>
        </div>
        <div>
          <dt className="inline text-slate-600">Action performed: </dt>
          <dd className="inline font-semibold text-slate-900">None</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs leading-5 text-violet-950">
        Shadow policy only — no automatic moderation action was performed.
      </p>
    </section>
  );
}

function shadowReasonLabel(reason: AiShadowAutomationReason): string {
  switch (reason) {
    case "classification_not_likely_pothole":
      return "Classification is not likely pothole.";
    case "confidence_below_threshold":
      return "Confidence is below the policy threshold.";
    case "photo_quality_not_good":
      return "Photo quality does not meet the policy requirement.";
    case "suggested_severity_unknown":
      return "Suggested severity is unknown.";
    case "model_not_approved":
      return "The assessment model is not approved by this policy.";
    case "prompt_version_not_approved":
      return "The assessment prompt version is not approved by this policy.";
    case "schema_version_not_approved":
      return "The assessment schema version is not approved by this policy.";
    case "insufficient_photo_evidence":
      return "The assessment does not have enough photo evidence.";
  }
}

function AssessmentList({ title, items, emptyText }: { title: string; items: string[]; emptyText: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-1 text-sm leading-6 text-slate-500">{emptyText}</p>
      ) : (
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 text-slate-700">
          {items.map((item, index) => (
            <li key={`${index}-${item}`}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function aiErrorMessage(error: unknown): string {
  if (!(error instanceof AdminApiError)) {
    return "AI analysis could not be completed. Please try again.";
  }

  switch (error.kind) {
    case "ai_disabled":
      return "AI analysis is currently disabled.";
    case "no_usable_photos":
      return "No usable report photos are available for AI analysis.";
    case "ai_timeout":
      return "AI analysis timed out. No assessment was saved. Please try again.";
    case "ai_rate_limited":
      return "AI analysis is temporarily rate limited. Please try again later.";
    case "invalid_ai_response":
      return "AI returned an unusable assessment. No assessment was saved. Please try again.";
    case "ai_unavailable":
      return "AI analysis is temporarily unavailable. Please try again later.";
    case "pothole_not_found":
    case "not-found":
      return "This pothole is no longer available for analysis.";
    case "unauthenticated":
    case "forbidden":
      return "You are not authorized to run AI analysis.";
    default:
      return "AI analysis could not be completed. Please try again.";
  }
}

function classificationLabel(classification: AdminAiAssessment["classification"]): string {
  switch (classification) {
    case "likely_pothole":
      return "Likely pothole";
    case "uncertain":
      return "Uncertain";
    case "unlikely_pothole":
      return "Unlikely pothole";
  }
}

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
}
