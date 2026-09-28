"use client";

import { Select } from "@/components/form";
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
      <div className="rounded-md border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
        Showing plans and pricing for your service region:{" "}
        <strong>{current?.name ?? value ?? "your state"}</strong>. Update your address on
        the Profile page to change it.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-center">
      <label
        htmlFor="region-select"
        className="text-sm font-medium text-slate-700 sm:text-right"
      >
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
