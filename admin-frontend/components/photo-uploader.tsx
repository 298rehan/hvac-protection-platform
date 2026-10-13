"use client";

import { useRef, useState, type ChangeEvent } from "react";

import { CameraIcon, UploadIcon } from "@/components/icons";
import { Button } from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api";
import { cx } from "@/lib/format";
import { formatBytes, PHOTO_CATEGORY_LABELS } from "@/lib/service-format";
import { confirmPhoto, requestPhotoUpload } from "@/services/serviceRequestService";
import type { PhotoCategory, PhotoUploadTicket } from "@/types";

const ALLOWED_TYPES: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};
const MAX_BYTES = 10 * 1024 * 1024;

type ItemState = "uploading" | "verifying" | "done" | "error";

interface Item {
  key: string;
  name: string;
  size: number;
  progress: number;
  state: ItemState;
  error?: string;
}

/** Client-side pre-check only; the backend re-validates and sniffs the bytes. */
function precheck(file: File): string | null {
  const extensions = ALLOWED_TYPES[file.type];
  const name = file.name.toLowerCase();
  if (!extensions || !extensions.some((ext) => name.endsWith(ext))) {
    return "Only JPEG, PNG or WebP images can be uploaded.";
  }
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_BYTES) return `Photos must be ${formatBytes(MAX_BYTES)} or smaller.`;
  return null;
}

class S3UploadError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/**
 * Multipart POST to the presigned S3 URL. Policy fields must precede the file,
 * which S3 requires to be the last form field.
 */
function postToS3(ticket: PhotoUploadTicket, file: File, onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const form = new FormData();
    Object.entries(ticket.upload.fields).forEach(([key, value]) => form.append(key, value));
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", ticket.upload.url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new S3UploadError("The storage service rejected the upload.", xhr.status));
    };
    xhr.onerror = () =>
      reject(new S3UploadError("The upload could not reach photo storage. Check your connection.", 0));
    xhr.send(form);
  });
}

/**
 * Upload flow: ask the API for a short-lived presigned POST, send the file
 * straight to S3, then ask the API to verify and accept it. AWS credentials
 * never reach the browser.
 */
export function PhotoUploader({
  requestId,
  categories,
  onUploaded,
}: {
  requestId: number;
  categories: PhotoCategory[];
  onUploaded: () => void;
}) {
  const [category, setCategory] = useState<PhotoCategory>(categories[0]);
  const [items, setItems] = useState<Item[]>([]);
  const input = useRef<HTMLInputElement>(null);

  // The parent may change which categories are allowed after a status change.
  const activeCategory = categories.includes(category) ? category : categories[0];

  function patch(key: string, update: Partial<Item>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...update } : item)));
  }

  async function uploadOne(file: File, target: PhotoCategory, key: string) {
    try {
      const body = { category: target, filename: file.name, content_type: file.type, size_bytes: file.size };
      let ticket = await requestPhotoUpload(requestId, body);
      try {
        await postToS3(ticket, file, (progress) => patch(key, { progress }));
      } catch (err) {
        // 403 usually means the presigned policy expired - retry once with a fresh one.
        if (err instanceof S3UploadError && err.status === 403) {
          ticket = await requestPhotoUpload(requestId, body);
          patch(key, { progress: 0 });
          await postToS3(ticket, file, (progress) => patch(key, { progress }));
        } else {
          throw err;
        }
      }
      patch(key, { state: "verifying", progress: 100 });
      await confirmPhoto(ticket.photo_id);
      patch(key, { state: "done" });
      onUploaded();
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 503
          ? "Photo storage is unavailable right now. Please try again later."
          : errorMessage(err);
      patch(key, { state: "error", error: message });
    }
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const target = activeCategory;
    const added: Item[] = files.map((file, index) => {
      const problem = precheck(file);
      return {
        key: `${Date.now()}-${index}-${file.name}`,
        name: file.name,
        size: file.size,
        progress: 0,
        state: problem ? "error" : "uploading",
        error: problem ?? undefined,
      };
    });
    setItems((current) => [...added, ...current].slice(0, 20));
    files.forEach((file, index) => {
      if (added[index].state === "uploading") void uploadOne(file, target, added[index].key);
    });
  }

  if (categories.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {categories.length > 1 ? (
          <div role="radiogroup" aria-label="Photo type" className="inline-flex gap-1 rounded-lg bg-slate-200/60 p-1">
            {categories.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={activeCategory === option}
                onClick={() => setCategory(option)}
                className={cx(
                  "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  activeCategory === option
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900",
                )}
              >
                {PHOTO_CATEGORY_LABELS[option]}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm font-medium text-slate-700">{PHOTO_CATEGORY_LABELS[activeCategory]}</p>
        )}
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          onChange={handleFiles}
          aria-label={`Choose ${PHOTO_CATEGORY_LABELS[activeCategory].toLowerCase()} photos`}
        />
        <Button type="button" variant="secondary" onClick={() => input.current?.click()} className="sm:ml-auto">
          <CameraIcon className="h-4 w-4" />
          Add photos
        </Button>
      </div>
      <p className="text-xs text-slate-500">JPEG, PNG or WebP, up to 10 MB each.</p>

      {items.length > 0 ? (
        <ul className="space-y-2" aria-live="polite">
          {items.map((item) => (
            <li key={item.key} className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <UploadIcon className="h-4 w-4 text-slate-400" />
                  <span className="truncate text-slate-800">{item.name}</span>
                  <span className="shrink-0 text-xs text-slate-400">{formatBytes(item.size)}</span>
                </span>
                <span
                  className={cx(
                    "shrink-0 text-xs font-medium",
                    item.state === "done" && "text-emerald-600",
                    item.state === "error" && "text-rose-600",
                    (item.state === "uploading" || item.state === "verifying") && "text-slate-500",
                  )}
                >
                  {item.state === "uploading"
                    ? `${item.progress}%`
                    : item.state === "verifying"
                      ? "Verifying…"
                      : item.state === "done"
                        ? "Uploaded"
                        : "Failed"}
                </span>
              </div>
              {item.state === "uploading" || item.state === "verifying" ? (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-[width] duration-200"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              ) : null}
              {item.error ? <p className="mt-1.5 text-xs text-rose-600">{item.error}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
