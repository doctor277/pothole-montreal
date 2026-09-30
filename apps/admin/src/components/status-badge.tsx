import type { PotholeStatus } from "@/types/admin";

const presentation: Record<PotholeStatus, { label: string; className: string }> = {
  REPORTED: {
    label: "Reported",
    className: "border-sky-200 bg-sky-50 text-sky-800",
  },
  UNDER_REVIEW: {
    label: "Under review",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  VERIFIED: {
    label: "Verified",
    className: "border-teal-200 bg-teal-50 text-teal-800",
  },
  ASSIGNED: {
    label: "Assigned",
    className: "border-indigo-200 bg-indigo-50 text-indigo-800",
  },
  ACCEPTED: {
    label: "Accepted",
    className: "border-cyan-200 bg-cyan-50 text-cyan-800",
  },
  IN_PROGRESS: {
    label: "In progress",
    className: "border-violet-200 bg-violet-50 text-violet-800",
  },
  REPAIRED: {
    label: "Repaired",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  REJECTED: {
    label: "Rejected",
    className: "border-rose-200 bg-rose-50 text-rose-800",
  },
  DUPLICATE: {
    label: "Duplicate",
    className: "border-slate-200 bg-slate-100 text-slate-700",
  },
};

export function statusLabel(status: PotholeStatus): string {
  return presentation[status].label;
}

export function StatusBadge({ status }: { status: PotholeStatus }) {
  const item = presentation[status];

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide ${item.className}`}
    >
      {item.label}
    </span>
  );
}
