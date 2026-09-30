"use client";

import { useState } from "react";

import { formatFileSize, formatMontrealDateTime } from "@/lib/format";
import type { AdminPhoto } from "@/types/admin";

export function PhotoViewer({ photo, ordinal }: { photo: AdminPhoto; ordinal: number }) {
  const [failedToLoad, setFailedToLoad] = useState(false);
  const isAvailable = photo.available && Boolean(photo.signedUrl) && !failedToLoad;

  if (!isAvailable) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
        <p className="text-sm font-semibold text-slate-700">Photo unavailable</p>
        <p className="mt-1 text-xs text-slate-500">The report can still be reviewed using its other evidence.</p>
      </div>
    );
  }

  return (
    <figure className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      {/* Signed URLs are ephemeral and project-specific, so Next Image remote patterns cannot be safely fixed at build time. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.signedUrl ?? undefined}
        alt={`Submitted road-damage photo ${ordinal}`}
        onError={() => setFailedToLoad(true)}
        referrerPolicy="no-referrer"
        className="aspect-[4/3] w-full bg-slate-100 object-cover"
      />
      <figcaption className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
        <span>{photo.mimeType ?? "Image"} · {formatFileSize(photo.fileSizeBytes)}</span>
        <span>{formatMontrealDateTime(photo.createdAt)}</span>
      </figcaption>
    </figure>
  );
}
