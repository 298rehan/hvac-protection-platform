"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Checkbox, Field, Input, MoneyInput, Select, Textarea } from "@/components/form";
import { MapPinIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { Alert, Button, Card, CardHeader } from "@/components/ui";
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

      <Card>
        <CardHeader
          title="Plan details"
          description="Name, description and default pricing for the plan."
        />
        <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">
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
            <MoneyInput
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
            <MoneyInput
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

          <div className="sm:pt-7">
            <Checkbox
              label="Active"
              description="Offered to customers on the plans page."
              checked={form.is_active}
              onChange={(e) => set("is_active", e.target.checked)}
            />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Plan features"
          description="Shown as bullet points on the plan card and detail page."
          action={
            <Button type="button" variant="secondary" size="sm" onClick={addFeature}>
              <PlusIcon className="h-3.5 w-3.5" />
              Add feature
            </Button>
          }
        />

        <div className="space-y-2.5 px-5 py-5">
          {form.features.map((feature, index) => (
            <div key={index} className="flex items-center gap-2">
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-500 tabular-nums"
              >
                {index + 1}
              </span>
              <Input
                value={feature}
                onChange={(e) => setFeature(index, e.target.value)}
                placeholder="Annual inspection"
                aria-label={`Feature ${index + 1}`}
              />
              <button
                type="button"
                onClick={() => removeFeature(index)}
                aria-label={`Remove feature ${index + 1}`}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
              >
                <TrashIcon className="h-4.5 w-4.5" />
              </button>
            </div>
          ))}
          {form.features.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              No features added yet.
            </p>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Regional availability and pricing"
          description="A plan is only sold in the states listed here. Remove every state to take the plan off sale entirely."
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addRegion}
              disabled={!availableToAdd}
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add state
            </Button>
          }
        />

        <div className="px-5 py-5">
          {form.regions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-400 ring-1 ring-slate-200">
                <MapPinIcon className="h-5 w-5" />
              </div>
              <p className="text-sm text-slate-500">
                No states assigned. This plan will not appear anywhere on the customer site.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {form.regions.map((region, index) => (
                <div
                  key={index}
                  className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50/50 p-4 sm:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))_auto_auto] sm:items-end"
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
                    <MoneyInput
                      id={`region_monthly_${index}`}
                      required
                      inputMode="decimal"
                      value={region.monthly_price}
                      onChange={(e) => setRegion(index, { monthly_price: e.target.value })}
                      placeholder="59.99"
                    />
                  </Field>

                  <Field label="Annual price" htmlFor={`region_annual_${index}`}>
                    <MoneyInput
                      id={`region_annual_${index}`}
                      inputMode="decimal"
                      value={region.annual_price ?? ""}
                      onChange={(e) => setRegion(index, { annual_price: e.target.value })}
                      placeholder="629.99"
                    />
                  </Field>

                  <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
                    <input
                      type="checkbox"
                      checked={region.is_available}
                      onChange={(e) => setRegion(index, { is_available: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 accent-brand-600"
                    />
                    <span className="text-sm text-slate-700">Available</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => removeRegion(index)}
                    aria-label={`Remove state ${index + 1}`}
                    className="flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600 sm:w-10 sm:px-0"
                  >
                    <TrashIcon className="h-4.5 w-4.5" />
                    <span className="sm:hidden">Remove</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col-reverse gap-3 border-t border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:mx-0 sm:flex-row sm:justify-end sm:rounded-xl sm:border sm:shadow-lg sm:shadow-slate-900/5">
        <Button
          type="button"
          variant="secondary"
          size="lg"
          onClick={() => router.push(plan ? `/plans/${plan.id}` : "/plans")}
        >
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={saving}>
          {saving ? "Saving..." : plan ? "Save changes" : "Create plan"}
        </Button>
      </div>
    </form>
  );
}
