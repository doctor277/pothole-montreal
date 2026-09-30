import Link from "next/link";

import { formatCoordinates, formatMontrealDateTime } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { aiTriageLabel } from "@/lib/ai-triage";
import type { AdminQueueItem } from "@/types/admin";

export function PotholeTable({ potholes }: { potholes: AdminQueueItem[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-left">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-5 py-3 font-semibold">Pothole</th>
            <th scope="col" className="px-5 py-3 font-semibold">Status</th>
            <th scope="col" className="px-5 py-3 font-semibold">Shadow AI triage</th>
            <th scope="col" className="px-5 py-3 font-semibold">Address</th>
            <th scope="col" className="px-5 py-3 font-semibold">Latest severity</th>
            <th scope="col" className="px-5 py-3 font-semibold">Reports</th>
            <th scope="col" className="px-5 py-3 font-semibold">Created</th>
            <th scope="col" className="px-5 py-3 font-semibold"><span className="sr-only">Review</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-sm">
          {potholes.map((pothole) => (
            <tr key={pothole.publicId} className="transition-colors hover:bg-slate-50">
              <td className="whitespace-nowrap px-5 py-4 font-mono text-sm font-semibold text-[#082f49]">
                {pothole.publicId}
              </td>
              <td className="whitespace-nowrap px-5 py-4"><StatusBadge status={pothole.status} /></td>
              <td className="min-w-56 px-5 py-4">
                <p className="font-medium text-violet-800" title="Shadow AI triage — not a moderation decision.">
                  {aiTriageLabel(pothole)}
                </p>
                <p className="mt-1 text-xs text-slate-500">Shadow only — not a moderation decision.</p>
                {pothole.aiTriage && (
                  <details className="mt-2 text-xs text-slate-600">
                    <summary className="cursor-pointer">Review hint: {pothole.aiTriage.priorityBand}</summary>
                    <p className="mt-1 font-mono">{pothole.aiTriage.triageVersion}</p>
                    <ul className="mt-1 list-disc pl-4">
                      {pothole.aiTriage.reasons.map((reason) => <li key={reason}>{reason.replaceAll("_", " ")}</li>)}
                    </ul>
                  </details>
                )}
              </td>
              <td className="min-w-64 px-5 py-4">
                <p className="font-medium text-slate-800">{pothole.formattedAddress ?? "Address unavailable"}</p>
                <p className="mt-1 font-mono text-xs text-slate-500">
                  {formatCoordinates(pothole.latitude, pothole.longitude)}
                </p>
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-slate-700">
                {pothole.latestSeverity ? severityLabel(pothole.latestSeverity) : "Not available"}
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-slate-700">{pothole.reportCount}</td>
              <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                {formatMontrealDateTime(pothole.createdAt)}
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-right">
                <Link
                  href={`/potholes/${pothole.publicId}`}
                  className="inline-flex rounded-md border border-teal-700 px-3 py-2 text-sm font-semibold text-teal-800 transition hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
                >
                  Review
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function severityLabel(severity: AdminQueueItem["latestSeverity"]): string {
  switch (severity) {
    case "DANGEROUS":
      return "Dangerous";
    case "MEDIUM":
      return "Medium";
    case "SMALL":
      return "Small";
    default:
      return "Not available";
  }
}
