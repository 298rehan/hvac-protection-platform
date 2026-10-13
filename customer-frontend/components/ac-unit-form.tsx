"use client";

import { useEffect, useState, type FormEvent } from "react";

import { Field, FormSection, Input, Select, Textarea } from "@/components/form";
import { Alert, Button } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { AC_TYPE_LABELS, CONDITION_LABELS } from "@/lib/service-labels";
import { fetchRegions } from "@/services/planService";
import type { AcType, AcUnitPayload, ReportedCondition, Region } from "@/types";

const AC_TYPES = Object.keys(AC_TYPE_LABELS) as AcType[];
const CONDITIONS = Object.keys(CONDITION_LABELS) as ReportedCondition[];

type FormState = Record<keyof AcUnitPayload, string>;

function toForm(initial: Partial<AcUnitPayload>): FormState {
  return {
    brand: initial.brand ?? "",
    model_number: initial.model_number ?? "",
    serial_number: initial.serial_number ?? "",
    ac_type: initial.ac_type ?? "CENTRAL_SPLIT",
    address: initial.address ?? "",
    city: initial.city ?? "",
    state: initial.state ?? "",
    zip_code: initial.zip_code ?? "",
    installation_date: initial.installation_date ?? "",
    reported_condition: initial.reported_condition ?? "UNKNOWN",
    notes: initial.notes ?? "",
  };
}

function toPayload(form: FormState): AcUnitPayload {
  const optional = (value: string) => (value.trim() ? value.trim() : null);
  return {
    brand: form.brand.trim(),
    model_number: form.model_number.trim(),
    serial_number: optional(form.serial_number),
    ac_type: form.ac_type as AcType,
    address: form.address.trim(),
    city: form.city.trim(),
    state: form.state,
    zip_code: form.zip_code.trim(),
    installation_date: optional(form.installation_date),
    reported_condition: form.reported_condition as ReportedCondition,
    notes: optional(form.notes),
  };
}

/** Shared register / edit form for an AC unit. */
export function AcUnitForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: Partial<AcUnitPayload>;
  submitLabel: string;
  onSubmit: (payload: AcUnitPayload) => Promise<void>;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(initial));
  const [regions, setRegions] = useState<Region[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    fetchRegions()
      .then(setRegions)
      .catch(() => setRegions([]));
  }, []);

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSubmit(toPayload(form));
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error ? <Alert>{error}</Alert> : null}

      <FormSection
        id="unit-equipment"
        title="Equipment"
        description="You can usually find the brand, model and serial number on a label on the outdoor unit."
      >
        <Field label="Brand" htmlFor="brand">
          <Input id="brand" required maxLength={80} value={form.brand} onChange={(e) => set("brand", e.target.value)} />
        </Field>
        <Field label="Model number" htmlFor="model_number">
          <Input
            id="model_number"
            required
            maxLength={80}
            value={form.model_number}
            onChange={(e) => set("model_number", e.target.value)}
          />
        </Field>
        <Field label="Serial number" htmlFor="serial_number" hint="Optional">
          <Input
            id="serial_number"
            maxLength={80}
            value={form.serial_number}
            onChange={(e) => set("serial_number", e.target.value)}
          />
        </Field>
        <Field label="System type" htmlFor="ac_type">
          <Select id="ac_type" value={form.ac_type} onChange={(e) => set("ac_type", e.target.value)}>
            {AC_TYPES.map((type) => (
              <option key={type} value={type}>
                {AC_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Installation date" htmlFor="installation_date" hint="Optional - leave blank if unknown">
          <Input
            id="installation_date"
            type="date"
            max={today}
            value={form.installation_date}
            onChange={(e) => set("installation_date", e.target.value)}
          />
        </Field>
        <Field
          label="Current condition"
          htmlFor="reported_condition"
          hint="Your own description - a technician confirms the actual condition."
        >
          <Select
            id="reported_condition"
            value={form.reported_condition}
            onChange={(e) => set("reported_condition", e.target.value)}
          >
            {CONDITIONS.map((condition) => (
              <option key={condition} value={condition}>
                {CONDITION_LABELS[condition]}
              </option>
            ))}
          </Select>
        </Field>
      </FormSection>

      <FormSection
        id="unit-location"
        title="Installation address"
        description="Where the unit is installed. Defaults to your service address."
      >
        <Field label="Street address" htmlFor="address" className="sm:col-span-2">
          <Input id="address" required maxLength={255} value={form.address} onChange={(e) => set("address", e.target.value)} />
        </Field>
        <Field label="City" htmlFor="city">
          <Input id="city" required maxLength={120} value={form.city} onChange={(e) => set("city", e.target.value)} />
        </Field>
        <Field label="State" htmlFor="state">
          <Select id="state" required value={form.state} onChange={(e) => set("state", e.target.value)}>
            <option value="" disabled>
              Select a state
            </option>
            {regions.length === 0 && form.state ? <option value={form.state}>{form.state}</option> : null}
            {regions.map((region) => (
              <option key={region.code} value={region.code}>
                {region.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="ZIP code" htmlFor="zip_code">
          <Input
            id="zip_code"
            required
            minLength={3}
            maxLength={10}
            value={form.zip_code}
            onChange={(e) => set("zip_code", e.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection id="unit-notes" title="Notes" description="Anything our technicians should know.">
        <Field label="Notes" htmlFor="notes" hint="Optional" className="sm:col-span-2">
          <Textarea id="notes" maxLength={2000} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </FormSection>

      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-6">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
