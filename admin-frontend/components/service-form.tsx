"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Checkbox, Field, Input, MoneyInput, Select, Textarea } from "@/components/form";
import { PlusIcon, TrashIcon } from "@/components/icons";
import { Alert, Button, Card, CardHeader } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import {
  formatServicePrice,
  FREQUENCIES,
  FREQUENCY_LABELS,
  normaliseMoney,
  PRICING_TYPE_LABELS,
  SERVICE_ICONS,
} from "@/lib/order-format";
import { fetchRegions } from "@/services/adminService";
import { createService, fetchAdminCategories, updateService } from "@/services/marketplaceService";
import type { CatalogService, PricingType, Region, ServiceCategory, ServiceFrequency, ServicePayload } from "@/types";

interface AddonRow {
  id: number | null;
  name: string;
  price: string;
  is_active: boolean;
}

interface FormState {
  category_id: string;
  name: string;
  description: string;
  icon: string;
  image_url: string;
  pricing_type: PricingType;
  price: string;
  unit_label: string;
  max_quantity: string;
  duration_minutes: string;
  allowed_frequencies: ServiceFrequency[];
  restrict_states: boolean;
  available_states: string[];
  is_active: boolean;
  display_order: string;
  addons: AddonRow[];
}

function initialState(service: CatalogService | null): FormState {
  return {
    category_id: service ? String(service.category.id) : "",
    name: service?.name ?? "",
    description: service?.description ?? "",
    icon: service?.icon ?? "wrench",
    image_url: service?.image_url ?? "",
    pricing_type: service?.pricing_type ?? "FIXED",
    price: service?.price ?? "",
    unit_label: service?.unit_label ?? "",
    max_quantity: String(service?.max_quantity ?? 1),
    duration_minutes: String(service?.duration_minutes ?? 60),
    allowed_frequencies: service?.allowed_frequencies ?? ["ONE_TIME"],
    restrict_states: Boolean(service?.available_states),
    available_states: service?.available_states ?? [],
    is_active: service?.is_active ?? true,
    display_order: String(service?.display_order ?? 0),
    addons: (service?.addons ?? []).map((a) => ({ id: a.id, name: a.name, price: a.price, is_active: a.is_active })),
  };
}

/** Builds the API payload, or returns an error message for the first invalid field. */
function toPayload(form: FormState): ServicePayload | string {
  if (!form.category_id) return "Choose a category.";
  if (form.name.trim().length < 2) return "Name must be at least 2 characters.";
  const price = normaliseMoney(form.price);
  if (price === null) return "Enter a valid price, e.g. 40 or 40.00.";
  const maxQuantity = Number(form.max_quantity);
  if (!Number.isInteger(maxQuantity) || maxQuantity < 1 || maxQuantity > 20) return "Max quantity must be 1 to 20.";
  const duration = Number(form.duration_minutes);
  if (!Number.isInteger(duration) || duration < 15 || duration > 600) return "Duration must be 15 to 600 minutes.";
  if (form.allowed_frequencies.length === 0) return "Pick at least one frequency.";
  if (form.restrict_states && form.available_states.length === 0) return "Pick at least one state, or turn off the restriction.";
  if (form.pricing_type === "PER_UNIT" && !form.unit_label.trim()) return "Per-unit pricing needs a unit label, e.g. filter.";
  const imageUrl = form.image_url.trim();
  if (imageUrl && !/^(https?:\/\/|\/)/.test(imageUrl)) return "Image URL must start with https://, http:// or /.";

  const addons = [];
  for (const addon of form.addons) {
    if (addon.name.trim().length < 2) return "Each add-on needs a name of at least 2 characters.";
    const addonPrice = normaliseMoney(addon.price);
    if (addonPrice === null) return `Enter a valid price for the add-on "${addon.name}".`;
    addons.push({ id: addon.id, name: addon.name.trim(), price: addonPrice, is_active: addon.is_active });
  }

  return {
    category_id: Number(form.category_id),
    name: form.name.trim(),
    description: form.description.trim(),
    icon: form.icon,
    image_url: imageUrl || null,
    pricing_type: form.pricing_type,
    price,
    unit_label: form.unit_label.trim() || null,
    max_quantity: maxQuantity,
    duration_minutes: duration,
    allowed_frequencies: FREQUENCIES.filter((f) => form.allowed_frequencies.includes(f)),
    available_states: form.restrict_states ? form.available_states : null,
    is_active: form.is_active,
    display_order: Number(form.display_order) || 0,
    addons,
  };
}

export function ServiceForm({ service }: { service: CatalogService | null }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => initialState(service));
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminCategories()
      .then(setCategories)
      .catch((err) => setError(errorMessage(err)));
    fetchRegions()
      .then(setRegions)
      .catch(() => setRegions([]));
  }, []);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  function updateAddon(index: number, patch: Partial<AddonRow>) {
    set("addons", form.addons.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const payload = toPayload(form);
    if (typeof payload === "string") {
      setError(payload);
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (service) {
        const saved = await updateService(service.id, payload);
        setForm(initialState(saved));
        setNotice(`Saved. Customers now see ${formatServicePrice(saved)}.`);
      } else {
        const saved = await createService(payload);
        router.replace(`/catalog/services/${saved.id}`);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}

      <Card>
        <CardHeader title="Details" />
        <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">
          <Field label="Name" htmlFor="svc-name" className="sm:col-span-2">
            <Input id="svc-name" value={form.name} maxLength={120} onChange={(e) => set("name", e.target.value)} required />
          </Field>
          <Field label="Category" htmlFor="svc-category">
            <Select id="svc-category" value={form.category_id} onChange={(e) => set("category_id", e.target.value)} required>
              <option value="">Choose a category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.is_active ? "" : " (hidden)"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Icon" htmlFor="svc-icon">
            <Select id="svc-icon" value={form.icon} onChange={(e) => set("icon", e.target.value)}>
              {SERVICE_ICONS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Description" htmlFor="svc-desc" className="sm:col-span-2">
            <Textarea id="svc-desc" rows={4} value={form.description} maxLength={2000} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <Field label="Image URL (optional)" htmlFor="svc-image" hint="Leave empty to show the icon." className="sm:col-span-2">
            <Input id="svc-image" value={form.image_url} maxLength={500} placeholder="https://..." onChange={(e) => set("image_url", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Pricing and booking" description="The backend uses these values for every quote and order." />
        <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">
          <Field label="Pricing type" htmlFor="svc-pricing" className="sm:col-span-2">
            <Select id="svc-pricing" value={form.pricing_type} onChange={(e) => set("pricing_type", e.target.value as PricingType)}>
              {(Object.keys(PRICING_TYPE_LABELS) as PricingType[]).map((type) => (
                <option key={type} value={type}>
                  {PRICING_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={form.pricing_type === "STARTING_AT" ? "Starting price" : form.pricing_type === "PER_UNIT" ? "Price per unit" : "Price"}
            htmlFor="svc-price"
            hint={form.pricing_type === "STARTING_AT" ? "Shown as an estimate. The final price is recorded on the order after inspection." : undefined}
          >
            <MoneyInput id="svc-price" inputMode="decimal" value={form.price} onChange={(e) => set("price", e.target.value)} required />
          </Field>
          <Field label="Unit label" htmlFor="svc-unit" hint="For per-unit pricing, e.g. filter.">
            <Input id="svc-unit" value={form.unit_label} maxLength={40} onChange={(e) => set("unit_label", e.target.value)} />
          </Field>
          <Field label="Max quantity per order" htmlFor="svc-max">
            <Input id="svc-max" type="number" min={1} max={20} value={form.max_quantity} onChange={(e) => set("max_quantity", e.target.value)} />
          </Field>
          <Field label="Estimated duration (minutes)" htmlFor="svc-duration">
            <Input id="svc-duration" type="number" min={15} max={600} step={15} value={form.duration_minutes} onChange={(e) => set("duration_minutes", e.target.value)} />
          </Field>
          <Field label="Display order" htmlFor="svc-order">
            <Input id="svc-order" type="number" value={form.display_order} onChange={(e) => set("display_order", e.target.value)} />
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-medium text-slate-700">Frequencies customers can choose</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              {FREQUENCIES.map((frequency) => (
                <Checkbox
                  key={frequency}
                  label={FREQUENCY_LABELS[frequency]}
                  checked={form.allowed_frequencies.includes(frequency)}
                  onChange={() => set("allowed_frequencies", toggle(form.allowed_frequencies, frequency))}
                />
              ))}
            </div>
          </fieldset>
        </div>
      </Card>

      <Card>
        <CardHeader title="Where it is offered" />
        <div className="space-y-4 px-5 py-5">
          <Checkbox
            label="Only in specific states"
            description="Off = offered everywhere the business operates."
            checked={form.restrict_states}
            onChange={(e) => set("restrict_states", e.target.checked)}
          />
          {form.restrict_states ? (
            <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-slate-200 p-3 sm:grid-cols-4">
              {regions.map((region) => (
                <label key={region.code} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 accent-brand-600"
                    checked={form.available_states.includes(region.code)}
                    onChange={() => set("available_states", toggle(form.available_states, region.code).sort())}
                  />
                  {region.code} <span className="truncate text-slate-400">{region.name}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Optional add-ons"
          description="Extras customers can tick, each with its own price. Removing an add-on deactivates it so past orders keep it."
          action={
            <Button type="button" size="sm" variant="secondary" onClick={() => set("addons", [...form.addons, { id: null, name: "", price: "", is_active: true }])}>
              <PlusIcon className="h-3.5 w-3.5" />
              Add-on
            </Button>
          }
        />
        {form.addons.length === 0 ? (
          <p className="px-5 py-5 text-sm text-slate-500">No add-ons.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {form.addons.map((addon, index) => (
              <li key={addon.id ?? `new-${index}`} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_9rem_auto_auto] sm:items-end">
                <Field label="Add-on name" htmlFor={`addon-name-${index}`}>
                  <Input id={`addon-name-${index}`} value={addon.name} maxLength={120} onChange={(e) => updateAddon(index, { name: e.target.value })} />
                </Field>
                <Field label="Price" htmlFor={`addon-price-${index}`}>
                  <MoneyInput id={`addon-price-${index}`} inputMode="decimal" value={addon.price} onChange={(e) => updateAddon(index, { price: e.target.value })} />
                </Field>
                <label className="flex h-10 items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 accent-brand-600"
                    checked={addon.is_active}
                    onChange={(e) => updateAddon(index, { is_active: e.target.checked })}
                  />
                  Active
                </label>
                <Button
                  type="button"
                  variant="danger-outline"
                  size="md"
                  aria-label={`Remove add-on ${addon.name || index + 1}`}
                  onClick={() => set("addons", form.addons.filter((_, i) => i !== index))}
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <Checkbox
            label="Active (customers can book it)"
            description="Inactive services disappear from the catalog and can't be checked out."
            checked={form.is_active}
            onChange={(e) => set("is_active", e.target.checked)}
            className="sm:max-w-md"
          />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => router.push("/catalog")}>
              Back to services
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : service ? "Save changes" : "Create service"}
            </Button>
          </div>
        </div>
      </Card>
    </form>
  );
}
