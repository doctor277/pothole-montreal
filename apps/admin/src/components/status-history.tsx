import { statusLabel } from "@/components/status-badge";
import { formatMontrealDateTime } from "@/lib/format";
import type { AdminPothole, AdminStatusEvent } from "@/types/admin";

export function StatusHistory({
  pothole,
  events,
}: {
  pothole: AdminPothole;
  events: AdminStatusEvent[];
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Audit trail</p>
        <h2 className="mt-1 text-xl font-semibold text-[#082f49]">Status history</h2>
      </div>

      <ol className="mt-5 space-y-5 border-l-2 border-slate-200 pl-5">
        <li className="relative">
          <span className="absolute -left-[1.9rem] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-slate-400" />
          <p className="font-semibold text-slate-800">Initial record created</p>
          <p className="mt-1 text-sm text-slate-600">{formatMontrealDateTime(pothole.createdAt)}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">No historical moderation event was fabricated for records created before this audit trail.</p>
        </li>
        {events.map((event, index) => (
          <li key={`${event.createdAt}-${index}`} className="relative">
            <span className="absolute -left-[1.9rem] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-teal-600" />
            <p className="font-semibold text-slate-800">
              {statusLabel(event.fromStatus)} → {statusLabel(event.toStatus)}
            </p>
            <p className="mt-1 text-sm text-slate-600">{formatMontrealDateTime(event.createdAt)} · by Admin</p>
            {event.reason && (
              <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">{event.reason}</p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
