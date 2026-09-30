import { PhotoViewer } from "@/components/photo-viewer";
import { formatAddress, formatCoordinates, formatMontrealDateTime } from "@/lib/format";
import type { AdminReport } from "@/types/admin";

export function ReportCard({ report, index }: { report: AdminReport; index: number }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Citizen report {index + 1}</p>
          <h3 className="mt-1 text-lg font-semibold text-[#082f49]">{severityLabel(report.severity)} severity</h3>
          <p className="mt-1 text-sm text-slate-600">Submitted {formatMontrealDateTime(report.createdAt)}</p>
        </div>
        <span className="inline-flex w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          {report.matchedExistingPothole ? "Attached to existing pothole" : "New pothole report"}
        </span>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.9fr)]">
        <div className="space-y-5">
          <section>
            <h4 className="text-sm font-semibold text-slate-800">Citizen note</h4>
            <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
              {report.note ?? "No note provided."}
            </p>
          </section>

          <section>
            <h4 className="text-sm font-semibold text-slate-800">Observed location</h4>
            <p className="mt-2 text-sm text-slate-700">{formatAddress(report.address)}</p>
            <p className="mt-1 font-mono text-xs text-slate-500">
              {formatCoordinates(report.latitude, report.longitude)}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {report.accuracyMeters === null
                ? "Location accuracy unavailable"
                : `Reported accuracy: ${Math.round(report.accuracyMeters)} m`}
            </p>
          </section>
        </div>

        <section>
          <h4 className="text-sm font-semibold text-slate-800">Submitted photos</h4>
          {report.photos.length === 0 ? (
            <p className="mt-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
              No photo metadata is available for this report.
            </p>
          ) : (
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {report.photos.map((photo, photoIndex) => (
                <PhotoViewer key={`${photo.createdAt}-${photoIndex}`} photo={photo} ordinal={photoIndex + 1} />
              ))}
            </div>
          )}
        </section>
      </div>
    </article>
  );
}

function severityLabel(severity: AdminReport["severity"]): string {
  switch (severity) {
    case "DANGEROUS":
      return "Dangerous";
    case "MEDIUM":
      return "Medium";
    case "SMALL":
      return "Small";
  }
}
