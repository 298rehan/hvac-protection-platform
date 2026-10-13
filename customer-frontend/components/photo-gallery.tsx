"use client";

import { useState } from "react";

import { Button } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { PHOTO_CATEGORY_LABELS } from "@/lib/service-labels";
import { deletePhoto } from "@/services/acUnitService";
import type { Photo, PhotoCategory } from "@/types";

const CATEGORY_ORDER: PhotoCategory[] = ["INITIAL", "CUSTOMER", "INSPECTION", "BEFORE", "AFTER"];

/**
 * Photos grouped by category. Images load through the short-lived URLs the
 * backend generated; when one has expired, `onRefresh` refetches the parent
 * record to get fresh links.
 */
export function PhotoGallery({
  photos,
  onRefresh,
  deletableCategories = [],
  emptyText = "No photos yet.",
}: {
  photos: Photo[];
  onRefresh: () => void;
  /** Categories the viewer may remove (the backend still decides). */
  deletableCategories?: PhotoCategory[];
  emptyText?: string;
}) {
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  if (photos.length === 0) return <p className="text-sm text-slate-500">{emptyText}</p>;

  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    items: photos.filter((p) => p.category === category),
  })).filter((g) => g.items.length > 0);

  async function remove(photo: Photo) {
    if (!window.confirm(`Remove ${photo.original_filename}?`)) return;
    setDeleting(photo.id);
    setError(null);
    try {
      await deletePhoto(photo.id);
      onRefresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-5">
      {expired ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          Photo links expire after a few minutes for privacy.
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setExpired(false);
              onRefresh();
            }}
          >
            Refresh photos
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}

      {groups.map((group) => (
        <div key={group.category}>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {PHOTO_CATEGORY_LABELS[group.category]} ({group.items.length})
          </p>
          <ul className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {group.items.map((photo) => (
              <li
                key={photo.id}
                className="group overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
              >
                {photo.url ? (
                  <a href={photo.url} target="_blank" rel="noopener noreferrer" className="block">
                    {/* Presigned, expiring URLs cannot go through next/image optimisation. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={photo.original_filename}
                      loading="lazy"
                      className="aspect-square w-full object-cover"
                      onError={() => setExpired(true)}
                    />
                  </a>
                ) : (
                  <div className="flex aspect-square items-center justify-center px-2 text-center text-xs text-slate-500">
                    Preview unavailable
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                  <span className="min-w-0 truncate text-xs text-slate-500" title={photo.original_filename}>
                    {formatDateTime(photo.created_at)}
                  </span>
                  {deletableCategories.includes(photo.category) ? (
                    <button
                      type="button"
                      disabled={deleting === photo.id}
                      onClick={() => void remove(photo)}
                      className="shrink-0 text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
