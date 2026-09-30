import { notFound } from "next/navigation";

import { PotholeDetailView } from "@/components/pothole-detail-view";

export default async function PotholeDetailPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;

  if (!/^MTL-[0-9]{6}$/.test(publicId)) {
    notFound();
  }

  return <PotholeDetailView publicId={publicId} />;
}
