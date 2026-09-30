"use client";

import Link from "next/link";

import { Select } from "@/components/form";
import { MapPinIcon } from "@/components/icons";
import type { Region } from "@/types";

/**
 * Region picker for the plan catalogue.
 *
 * When a customer is signed in the control is locked to their account state,
 * because that is the state the backend prices and validates against.
 */
export function RegionSelect({
  value,
  regions,
  locked,
  onChange,
}: {
  value: string | null;
  regions: Region[];
  locked: boolean;
  onChange: (code: string) => void;
}) {
  const current = regions.find((region) => region.code === value);

  if (locked) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-3 rounded-xl border border-brand-100 bg-brand-50/70 px-4 py-3.5 text-sm text-brand-900 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2.5">
          <MapPinIcon className="mt-px h-5 w-5 text-brand-500" />
          <span>
            Showing pricing for your service region:{" "}
            <strong className="font-semibold">{current?.name ?? value ?? "your state"}</strong>
          </span>
        </p>
        <Link
          href="/dashboard/profile"
          className="shrink-0 pl-7 text-sm font-semibold text-brand-700 hover:text-brand-800 sm:pl-0"
        >
          Change address
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-2 sm:flex-row sm:items-center sm:justify-center sm:gap-3">
      <label
        htmlFor="region-select"
        className="flex items-center gap-2 text-sm font-medium text-slate-700"
      >
        <MapPinIcon className="h-4.5 w-4.5 text-brand-600" />
        Service region
      </label>
      <Select
        id="region-select"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="sm:w-64"
      >
        {regions.length === 0 ? <option value="">No regions available</option> : null}
        {regions.map((region) => (
          <option key={region.code} value={region.code}>
            {region.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
