import { QueueView } from "@/components/queue-view";
import type { AdminQueueFilter } from "@/types/admin";

const allowedFilters = new Set<AdminQueueFilter>([
  "review",
  "all",
  "reported",
  "under-review",
  "verified",
  "rejected",
]);

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string | string[] }>;
}) {
  const query = await searchParams;
  const requestedFilter = Array.isArray(query.filter) ? query.filter[0] : query.filter;
  const filter = allowedFilters.has(requestedFilter as AdminQueueFilter)
    ? (requestedFilter as AdminQueueFilter)
    : "review";

  return <QueueView filter={filter} />;
}
