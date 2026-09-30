import type { AdminQueueItem } from "../types/admin";

export const aiTriageFilters = [
  { id: "all", label: "All AI triage" },
  { id: "high-confidence", label: "High-confidence likely" },
  { id: "review", label: "Likely pothole — needs review" },
  { id: "uncertain", label: "Uncertain" },
  { id: "poor-evidence", label: "Poor evidence" },
  { id: "likely-not", label: "Likely not pothole" },
  { id: "missing-stale", label: "No / stale / unavailable assessment" },
] as const;

export type AiTriageFilter = (typeof aiTriageFilters)[number]["id"];

export function matchesAiTriageFilter(item: AdminQueueItem, filter: AiTriageFilter): boolean {
  if (filter === "all") return true;
  const category = item.aiTriageAvailability === "available" ? item.aiTriage?.category : undefined;
  if (filter === "missing-stale") {
    return !category || category === "no_assessment" || category === "stale_assessment";
  }
  const categories = {
    "high-confidence": "high_confidence_likely_pothole",
    review: "likely_pothole_review",
    uncertain: "uncertain",
    "poor-evidence": "poor_evidence",
    "likely-not": "likely_not_pothole",
  } as const;
  return category === categories[filter];
}

export function aiTriageLabel(item: Pick<AdminQueueItem, "aiTriage" | "aiTriageAvailability">): string {
  if (item.aiTriageAvailability !== "available" || !item.aiTriage) return "AI triage unavailable";
  const labels = {
    no_assessment: "No AI assessment",
    stale_assessment: "Assessment stale",
    high_confidence_likely_pothole: "High-confidence likely pothole",
    likely_pothole_review: "Likely pothole — needs review",
    uncertain: "Uncertain",
    poor_evidence: "Poor evidence",
    likely_not_pothole: "Likely not pothole",
  } as const;
  return labels[item.aiTriage.category];
}
