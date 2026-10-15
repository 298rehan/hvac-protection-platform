"use client";

import { Field, Select } from "@/components/form";
import { cx } from "@/lib/format";
import { FREQUENCY_LABELS, formatPrice } from "@/lib/marketplace-format";
import type { CatalogService, Frequency, SelectionItem } from "@/types/marketplace";

/**
 * Quantity, frequency and add-on controls for one selected service. Only the
 * options the catalog allows for that service are shown.
 */
export function ItemOptions({
  service,
  item,
  onChange,
  idPrefix,
  compact = false,
}: {
  service: CatalogService;
  item: SelectionItem;
  onChange: (item: SelectionItem) => void;
  idPrefix: string;
  compact?: boolean;
}) {
  const activeAddons = service.addons.filter((addon) => addon.is_active);
  const showQuantity = service.max_quantity > 1;
  const showFrequency = service.allowed_frequencies.length > 1;

  if (!showQuantity && !showFrequency && activeAddons.length === 0) return null;

  function setQuantity(next: number) {
    onChange({ ...item, quantity: Math.min(Math.max(1, next), service.max_quantity) });
  }

  function toggleAddon(addonId: number) {
    const addon_ids = item.addon_ids.includes(addonId)
      ? item.addon_ids.filter((id) => id !== addonId)
      : [...item.addon_ids, addonId];
    onChange({ ...item, addon_ids });
  }

  return (
    <div className={cx("grid gap-4", compact ? "sm:grid-cols-2" : "")}>
      {showQuantity ? (
        <div>
          <span id={`${idPrefix}-qty-label`} className="block text-sm font-medium text-slate-700">
            Quantity{service.unit_label ? ` (${service.unit_label}s)` : ""}
          </span>
          <div className="mt-1.5 inline-flex items-center rounded-lg ring-1 ring-slate-300" role="group" aria-labelledby={`${idPrefix}-qty-label`}>
            <button
              type="button"
              className="h-9 w-9 rounded-l-lg text-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              onClick={() => setQuantity(item.quantity - 1)}
              disabled={item.quantity <= 1}
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="w-10 text-center text-sm font-semibold tabular-nums" aria-live="polite">
              {item.quantity}
            </span>
            <button
              type="button"
              className="h-9 w-9 rounded-r-lg text-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              onClick={() => setQuantity(item.quantity + 1)}
              disabled={item.quantity >= service.max_quantity}
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">Up to {service.max_quantity} per order.</p>
        </div>
      ) : null}

      {showFrequency ? (
        <Field label="How often" htmlFor={`${idPrefix}-freq`}>
          <Select
            id={`${idPrefix}-freq`}
            value={item.frequency}
            onChange={(event) => onChange({ ...item, frequency: event.target.value as Frequency })}
          >
            {service.allowed_frequencies.map((frequency) => (
              <option key={frequency} value={frequency}>
                {FREQUENCY_LABELS[frequency]}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {activeAddons.length > 0 ? (
        <fieldset className={compact ? "sm:col-span-2" : ""}>
          <legend className="text-sm font-medium text-slate-700">Optional extras</legend>
          <div className="mt-1.5 space-y-2">
            {activeAddons.map((addon) => (
              <label key={addon.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 ring-1 ring-slate-200 hover:bg-slate-50">
                <span className="flex items-center gap-2.5 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-brand-600"
                    checked={item.addon_ids.includes(addon.id)}
                    onChange={() => toggleAddon(addon.id)}
                  />
                  {addon.name}
                </span>
                <span className="text-sm font-medium text-slate-900 tabular-nums">+{formatPrice(addon.price)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
