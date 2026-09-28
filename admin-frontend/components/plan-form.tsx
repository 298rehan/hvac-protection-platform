"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Field, Input, Select, Textarea } from "@/components/form";
import { Alert, Button, Card } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { createPlan, fetchRegions, updatePlan } from "@/services/adminService";
import type { Plan, PlanPayload, PlanRegionInput, Region } from "@/types";

interface FormState {
  name: string;
  description: string;
  features: string[];
  base_monthly_price: string;
  base_annual_price: string;
  is_active: boolean;
  display_order: string;
  regions: PlanRegionInput[];
}

function initialState(plan?: Plan): FormState {
  if (!plan) {
    return {
      name: "",
      description: "",
      features: [""],
      base_monthly_price: "",
      base_annual_price: "",
      is_active: true,
      display_order: "0",
      regions: [],
    };
  }
  return {
    name: plan.name,
    description: plan.description,
    features: plan.features.length > 0 ? plan.features : [""],
    base_monthly_price: plan.base_monthly_price,
    base_annual_price: plan.base_annual_price ?? "",
    is_active: plan.is_active,
    display_order: String(plan.display_order),
    regions: plan.regions.map((region) => ({
      state_code: region.state_code,
      monthly_price: region.monthly_price,
      annual_price: region.annual_price ?? "",
      is_available: region.is_available,
    })),
  };
}

/**
 * Create / edit form for a plan and its regional pricing.
 *
 * The `regions` list is sent as a whole: the backend replaces the plan's pricing
 * rows with exactly what is submitted here.
 */
export function PlanForm({ plan }: { plan?: Plan }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => initialState(plan));
  const [regions, setRegions] = useState<Region[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchRegions().then(setRegions).catch(() => setRegions([]));
  }, []);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  /* ------------------------------ features ------------------------------ */

  function setFeature(index: number, value: string) {
    setForm((current) => {
      const features = [...current.features];
      features[index] = value;
      return { ...current, features };
    });
  }

  function addFeature() {
    setForm((current) => ({ ...current, features: [...current.features, ""] }));
  }

  function removeFeature(index: number) {
    setForm((current) => ({
      ...current,
      features: current.features.filter((_, i) => i !== index),
    }));
  }

  /* ------------------------------- regions ------------------------------ */

  function addRegion() {
    const used = new Set(form.regions.map((region) => region.state_code));
    const next = regions.find((region) => !used.has(region.code));
    if (!next) return;
    setForm((current) => ({
      ...current,
      regions: [
        ...current.regions,
        {
          state_code: next.code,
          monthly_price: current.base_monthly_price || "",
          annual_price: current.base_annual_price || "",
          is_available: true,
        },
      ],
    }));
  }

  function setRegion(index: number, patch: Partial<PlanRegionInput>) {
    setForm((current) => {
      const list = [...current.regions];
      list[index] = { ...list[index], ...patch };
      return { ...current, regions: list };
    });
  }

  function removeRegion(index: number) {
    setForm((current) => ({
      ...current,
      regions: current.regions.filter((_, i) => i !== index),
    }));
  }

  /* -------------------------------- submit ------------------------------ */

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const features = form.features.map((f) => f.trim()).filter(Boolean);
    const codes = form.regions.map((region) => region.state_code);
    if (new Set(codes).size !== codes.length) {
      setError("Each state may only be listed once. Remove the duplicate row.");
      return;
    }

    const payload: PlanPayload = {
      name: form.name.trim(),
      description: form.description.trim(),
      features,
      base_monthly_price: form.base_monthly_price,
      base_annual_price: form.base_annual_price.trim() || null,
      is_active: form.is_active,
      display_order: Number(form.display_order) || 0,
      regions: form.regions.map((region) => ({
        state_code: region.state_code,
        monthly_price: region.monthly_price,
        annual_price: String(region.annual_price ?? "").trim() || null,
        is_available: region.is_available,
      })),
    };

    setSaving(true);
    try {
      const saved = plan
        ? await updatePlan(plan.id, payload)
        : await createPlan(payload);
      router.push(`/plans/${saved.id}`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  const availableToAdd = regions.length > form.regions.length;

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {error ? <Alert>{error}</Alert> : null}

      <Card className="p-6">
        <h2 className="text-base font-semibold text-slate-900">Plan details</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field label="Plan name" htmlFor="name" className="sm:col-span-2">
            <Input
              id="name"
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="HVAC Elite Protection"
            />
          </Field>

          <Field label="Description" htmlFor="description" className="sm:col-span-2">
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Premium HVAC maintenance and protection coverage."
            />
          </Field>

          <Field
            label="Base monthly price"
            htmlFor="base_monthly_price"
            hint="Used where a state has no price of its own."
          >
            <Input
              id="base_monthly_price"
              required
              inputMode="decimal"
              value={form.base_monthly_price}
              onChange={(e) => set("base_monthly_price", e.target.value)}
              placeholder="59.99"
            />
          </Field>

          <Field
            label="Base annual price"
            htmlFor="base_annual_price"
            hint="Leave blank if annual billing is not offered."
          >
            <Input
              id="base_annual_price"
              inputMode="decimal"
              value={form.base_annual_price}
              onChange={(e) => set("base_annual_price", e.target.value)}
              placeholder="629.99"
            />
          </Field>

          <Field
            label="Display order"
            htmlFor="display_order"
            hint="Lower numbers appear first on the customer site."
          >
            <Input
              id="display_order"
              inputMode="numeric"
              value={form.display_order}
              onChange={(e) => set("display_order", e.target.value)}
            />
          </Field>

          <div className="flex items-end">
            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-300 px-3 py-2.5">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => set("is_active", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm text-slate-700">
                Active (offered to customers)
              </span>
            </label>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Plan features</h2>
            <p className="mt-1 text-sm text-slate-600">
              Shown as bullet points on the plan card and detail page.
            </p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={addFeature}>
            Add feature
          </Button>
        </div>

        <div className="mt-5 space-y-3">
          {form.features.map((feature, index) => (
            <div key={index} className="flex gap-2">
              <Input
                value={feature}
                onChange={(e) => setFeature(index, e.target.value)}
                placeholder="Annual inspection"
                aria-label={`Feature ${index + 1}`}
              />
              <Button
                type="button"
                variant="subtle"
                size="sm"
                onClick={() => removeFeature(index)}
                aria-label={`Remove feature ${index + 1}`}
              >
                Remove
              </Button>
            </div>
          ))}
          {form.features.length === 0 ? (
            <p className="text-sm text-slate-500">No features added yet.</p>
          ) : null}
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Regional availability and pricing
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              A plan is only sold in the states listed here. Remove every state to take
              the plan off sale entirely.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={addRegion}
            disabled={!availableToAdd}
          >
            Add state
          </Button>
        </div>

        {form.regions.length === 0 ? (
          <p className="mt-5 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            No states assigned. This plan will not appear anywhere on the customer site.
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            {form.regions.map((region, index) => (
              <div
                key={index}
                className="grid gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))_auto_auto] sm:items-end"
              >
                <Field label="State" htmlFor={`region_state_${index}`}>
                  <Select
                    id={`region_state_${index}`}
                    value={region.state_code}
                    onChange={(e) => setRegion(index, { state_code: e.target.value })}
                  >
                    {regions.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Monthly price" htmlFor={`region_monthly_${index}`}>
                  <Input
                    id={`region_monthly_${index}`}
                    required
                    inputMode="decimal"
                    value={region.monthly_price}
                    onChange={(e) => setRegion(index, { monthly_price: e.target.value })}
                    placeholder="59.99"
                  />
                </Field>

                <Field label="Annual price" htmlFor={`region_annual_${index}`}>
                  <Input
                    id={`region_annual_${index}`}
                    inputMode="decimal"
                    value={region.annual_price ?? ""}
                    onChange={(e) => setRegion(index, { annual_price: e.target.value })}
                    placeholder="629.99"
                  />
                </Field>

                <label className="flex items-center gap-2 pb-2.5">
                  <input
                    type="checkbox"
                    checked={region.is_available}
                    onChange={(e) => setRegion(index, { is_available: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-sm text-slate-700">Available</span>
                </label>

                <Button
                  type="button"
                  variant="subtle"
                  size="sm"
                  className="mb-1.5"
                  onClick={() => removeRegion(index)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="flex gap-3">
        <Button type="submit" size="lg" disabled={saving}>
          {saving ? "Saving..." : plan ? "Save changes" : "Create plan"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          onClick={() => router.push(plan ? `/plans/${plan.id}` : "/plans")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
