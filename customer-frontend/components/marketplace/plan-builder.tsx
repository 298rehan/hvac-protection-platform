"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Field, Input, Select } from "@/components/form";
import { ItemOptions } from "@/components/marketplace/item-options";
import { QuoteSummary } from "@/components/marketplace/quote-summary";
import { ServiceCard } from "@/components/marketplace/service-card";
import { ServiceIcon } from "@/components/marketplace/service-icon";
import { Alert, Button, Card, EmptyState, Skeleton } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { servicePriceLabel } from "@/lib/marketplace-format";
import { useFetch } from "@/lib/use-fetch";
import { useQuote } from "@/lib/use-quote";
import { defaultItem } from "@/lib/use-service-actions";
import { fetchMyAcUnits } from "@/services/acUnitService";
import { createPlan, fetchServices, saveCart, updatePlan } from "@/services/marketplaceService";
import type { CustomPlan, SelectionItem } from "@/types/marketplace";

export function PlanBuilder({
  plan,
  initialItems,
}: {
  plan?: CustomPlan;
  initialItems: SelectionItem[];
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [name, setName] = useState(plan?.name ?? "My Custom HVAC Plan");
  const [acUnitId, setAcUnitId] = useState<number | null>(plan?.ac_unit_id ?? null);
  const [items, setItems] = useState<SelectionItem[]>(initialItems);
  const [dirty, setDirty] = useState(!plan && initialItems.length > 0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");

  const services = useFetch("builder-services", () => fetchServices());
  const units = useFetch("builder-units", fetchMyAcUnits);
  const unit = (units.data ?? []).find((u) => u.id === acUnitId) ?? null;
  const state = unit?.state ?? user?.state ?? undefined;
  const { quote, loading, error } = useQuote(items, { state });

  const byId = useMemo(() => new Map((services.data ?? []).map((s) => [s.id, s])), [services.data]);
  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of services.data ?? []) seen.set(s.category.slug, s.category.name);
    return [...seen.entries()];
  }, [services.data]);
  const visible = (services.data ?? []).filter(
    (s) =>
      (!category || s.category.slug === category) &&
      (!search.trim() || `${s.name} ${s.description}`.toLowerCase().includes(search.trim().toLowerCase())),
  );
  const chosen = new Set(items.map((item) => item.service_id));
  const blocked = items.length === 0 || (quote?.problems.length ?? 0) > 0 || loading;

  function change(next: SelectionItem[]) {
    setItems(next);
    setDirty(true);
    setMessage(null);
  }

  async function save(): Promise<CustomPlan | null> {
    setSaving(true);
    setMessage(null);
    try {
      const payload = { name: name.trim() || "My Custom HVAC Plan", ac_unit_id: acUnitId, items };
      const saved = plan ? await updatePlan(plan.id, payload) : await createPlan(payload);
      setDirty(false);
      setMessage({ tone: "success", text: "Your plan was saved. You can come back and edit it any time." });
      if (!plan) router.replace(`/dashboard/custom-plan/${saved.id}`);
      return saved;
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function checkout() {
    const saved = dirty || !plan ? await save() : plan;
    if (saved) router.push(`/checkout/services?plan=${saved.id}`);
  }

  async function moveToCart() {
    setSaving(true);
    try {
      await saveCart(items);
      router.push("/cart");
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
      <div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <label htmlFor="builder-search" className="sr-only">Search services</label>
            <Input id="builder-search" type="search" placeholder="Search services…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="sm:w-60">
            <label htmlFor="builder-category" className="sr-only">Category</label>
            <Select id="builder-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {categories.map(([slug, label]) => (
                <option key={slug} value={slug}>{label}</option>
              ))}
            </Select>
          </div>
        </div>

        {services.error ? <div className="mt-4"><Alert>{services.error}</Alert></div> : null}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {services.loading
            ? [0, 1, 2, 3].map((n) => <Skeleton key={n} className="h-56 rounded-xl" />)
            : visible.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  inPlan={chosen.has(service.id)}
                  onAddToPlan={() => change([...items, defaultItem(service)])}
                />
              ))}
        </div>
        {!services.loading && visible.length === 0 ? (
          <div className="mt-5"><EmptyState title="No matching services" description="Try another search or category." /></div>
        ) : null}
      </div>

      <div>
        <Card className="p-5 lg:sticky lg:top-24">
          <h2 className="text-lg font-semibold text-slate-900">My Custom HVAC Plan</h2>
          <p className="mt-1 text-sm text-slate-500">Mix one-time and regular services. Save it as a draft and come back later.</p>

          <div className="mt-4 grid gap-4">
            <Field label="Plan name" htmlFor="plan-name">
              <Input id="plan-name" maxLength={120} value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
            </Field>
            <Field label="HVAC system (optional)" htmlFor="plan-unit" hint="Its address is used for availability and checkout.">
              <Select
                id="plan-unit"
                value={acUnitId ?? ""}
                onChange={(e) => { setAcUnitId(e.target.value ? Number(e.target.value) : null); setDirty(true); }}
              >
                <option value="">No specific unit</option>
                {(units.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>{u.brand} {u.model_number} – {u.city}, {u.state}</option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <h3 className="text-sm font-semibold text-slate-900">Selected services ({items.length})</h3>
            {items.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Nothing selected yet. Use “Add to plan” on any service.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {items.map((item, index) => {
                  const service = byId.get(item.service_id);
                  return (
                    <li key={item.service_id} className="rounded-lg p-3 ring-1 ring-slate-200">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          {service ? <ServiceIcon name={service.icon} className="h-9 w-9" /> : null}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">{service?.name ?? "Unavailable service"}</p>
                            <p className="text-xs text-slate-500">{service ? servicePriceLabel(service) : "This service is no longer offered."}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="text-xs font-semibold text-rose-600 hover:underline"
                          onClick={() => change(items.filter((_, i) => i !== index))}
                          aria-label={`Remove ${service?.name ?? "service"} from plan`}
                        >
                          Remove
                        </button>
                      </div>
                      {service ? (
                        <div className="mt-3">
                          <ItemOptions
                            service={service}
                            item={item}
                            compact
                            idPrefix={`plan-${item.service_id}`}
                            onChange={(next) => change(items.map((it, i) => (i === index ? next : it)))}
                          />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {items.length > 0 ? (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <QuoteSummary quote={quote} loading={loading} error={error} />
            </div>
          ) : null}

          {message ? <div className="mt-4"><Alert tone={message.tone}>{message.text}</Alert></div> : null}
          {dirty ? <p className="mt-3 text-xs text-amber-700">You have unsaved changes.</p> : null}

          <div className="mt-5 grid gap-2">
            <Button onClick={checkout} disabled={blocked || saving}>Checkout this plan</Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save draft"}</Button>
              <Button variant="secondary" onClick={moveToCart} disabled={items.length === 0 || saving}>Move to cart</Button>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Pay on service - nothing is charged online. <Link href="/dashboard/plans" className="font-semibold text-brand-700 hover:underline">Saved plans</Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
