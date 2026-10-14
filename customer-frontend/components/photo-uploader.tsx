"use client";

import { useId, useRef, useState } from "react";

import { AlertIcon, CheckCircleIcon } from "@/components/icons";
import { Button } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { cx } from "@/lib/format";
import {
  ALLOWED_PHOTO_EXTENSIONS,
  ALLOWED_PHOTO_TYPES,
  MAX_PHOTO_BYTES,
} from "@/lib/service-labels";
import { confirmPhoto } from "@/services/acUnitService";
import type { PhotoContentType, PhotoUploadResponse } from "@/types";

type UploadStatus = "uploading" | "confirming" | "done" | "error";

interface UploadItem {
  key: string;
  file: File;
  status: UploadStatus;
  progress: number;
  error: string | null;
}

export type RequestUpload = (file: {
  filename: string;
  content_type: PhotoContentType;
  size_bytes: number;
}) => Promise<PhotoUploadResponse>;

/** Client-side pre-check. The backend re-validates type, size and file contents. */
export function validate(file: File): string | null {
  const name = file.name.toLowerCase();
  const extensionOk = ALLOWED_PHOTO_EXTENSIONS.some((ext) => name.endsWith(ext));
  const typeOk = (ALLOWED_PHOTO_TYPES as readonly string[]).includes(file.type);
  if (!extensionOk || !typeOk) return "Only JPEG, PNG or WebP images can be uploaded.";
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_PHOTO_BYTES) return "Photos must be 10 MB or smaller.";
  return null;
}

/**
 * POST the file straight to S3 using the backend's presigned form. Every field
 * the backend returned is sent unchanged and the file goes last, as S3 requires.
 */
export function postToS3(
  upload: PhotoUploadResponse["upload"],
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [name, value] of Object.entries(upload.fields)) form.append(name, value);
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", upload.url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else if (xhr.status === 403) {
        reject(new Error("The upload link expired or was rejected. Please try again."));
      } else if (xhr.status === 400) {
        reject(new Error("The storage service rejected this file. Check its size and type."));
      } else {
        reject(new Error(`Upload failed (status ${xhr.status}). Please try again.`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error while uploading. Please try again."));
    xhr.send(form);
  });
}

/**
 * Pick photos, upload each one directly to private storage through a
 * short-lived link from the backend, then ask the backend to verify it.
 */
export function PhotoUploader({
  requestUpload,
  onUploaded,
  title = "Add photos",
  description,
}: {
  requestUpload: RequestUpload;
  onUploaded: () => void;
  title?: string;
  description?: string;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [rejected, setRejected] = useState<{ name: string; error: string }[]>([]);

  function patch(key: string, changes: Partial<UploadItem>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...changes } : item)));
  }

  async function run(item: UploadItem) {
    patch(item.key, { status: "uploading", progress: 0, error: null });
    try {
      // A fresh link every attempt, so a retry after expiry just works.
      const grant = await requestUpload({
        filename: item.file.name,
        content_type: item.file.type as PhotoContentType,
        size_bytes: item.file.size,
      });
      await postToS3(grant.upload, item.file, (progress) => patch(item.key, { progress }));
      patch(item.key, { status: "confirming", progress: 100 });
      await confirmPhoto(grant.photo_id);
      patch(item.key, { status: "done" });
      onUploaded();
    } catch (error) {
      patch(item.key, { status: "error", error: errorMessage(error) });
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const accepted: UploadItem[] = [];
    const problems: { name: string; error: string }[] = [];
    for (const file of Array.from(files)) {
      const error = validate(file);
      if (error) problems.push({ name: file.name, error });
      else
        accepted.push({
          key: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
          file,
          status: "uploading",
          progress: 0,
          error: null,
        });
    }
    setRejected(problems);
    setItems((current) => [...current.filter((i) => i.status !== "done"), ...accepted]);
    if (inputRef.current) inputRef.current.value = "";
    // One at a time keeps memory and bandwidth predictable on slow connections.
    for (const item of accepted) await run(item);
  }

  const busy = items.some((i) => i.status === "uploading" || i.status === "confirming");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-0.5 text-sm text-slate-500">
            {description ??
              "Optional. Photos help our team review your request, but they cannot show internal faults - a technician confirms the actual condition."}
          </p>
          <p className="mt-1 text-xs text-slate-400">JPEG, PNG or WebP, up to 10 MB each.</p>
        </div>
        <label htmlFor={inputId} className={cx(busy && "pointer-events-none opacity-60")}>
          <span className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold whitespace-nowrap text-slate-800 shadow-sm ring-1 ring-slate-300 ring-inset transition-colors hover:bg-slate-50 hover:ring-slate-400">
            Choose photos
          </span>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ALLOWED_PHOTO_TYPES.join(",")}
            multiple
            disabled={busy}
            className="sr-only"
            onChange={(event) => void onFiles(event.target.files)}
          />
        </label>
      </div>

      {rejected.length > 0 ? (
        <ul className="space-y-1.5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {rejected.map((r) => (
            <li key={r.name} className="flex gap-2">
              <AlertIcon className="mt-px h-4.5 w-4.5 text-rose-500" />
              <span>
                <strong className="font-semibold">{r.name}:</strong> {r.error}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.key}
              className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate font-medium text-slate-800">{item.file.name}</span>
                {item.status === "done" ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-700">
                    <CheckCircleIcon className="h-4 w-4" /> Uploaded
                  </span>
                ) : item.status === "error" ? (
                  <Button size="sm" variant="secondary" onClick={() => void run(item)}>
                    Retry
                  </Button>
                ) : (
                  <span className="shrink-0 text-xs text-slate-500">
                    {item.status === "confirming" ? "Verifying..." : `${item.progress}%`}
                  </span>
                )}
              </div>
              {item.status === "uploading" || item.status === "confirming" ? (
                <div
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={item.progress}
                  aria-label={`Uploading ${item.file.name}`}
                >
                  <div
                    className="h-full rounded-full bg-brand-500 transition-[width] duration-200"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              ) : null}
              {item.error ? <p className="mt-1.5 text-xs font-medium text-rose-600">{item.error}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
