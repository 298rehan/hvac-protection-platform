"use client";

import { useMemo, useState } from "react";

import { ItemOptions } from "@/components/marketplace/item-options";
import { QuoteSummary } from "@/components/marketplace/quote-summary";
import { ServiceIcon } from "@/components/marketplace/service-icon";
import { RequireAuth } from "@/components/require-auth";
import { Alert, Button, ButtonLink, Card, EmptyState, PageHeader, PageLoader } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { servicePriceLabel } from "@/lib/marketplace-format";
import { useFetch } from "@/lib/use-fetch";
import { clearCart, fetchCart, fetchServices, saveCart } from "@/services/marketplaceService";
import type { CustomPlan, SelectionItem } from "@/types/marketplace";

function Cart() {
  const loaded = useFetch("cart", fetchCart);
  const services = useFetch("cart-services", () => fetchServices());
  const [cart, setCart] = useState<CustomPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = cart ?? loaded.data;
  const byId = useMemo(() => new Map((services.data ?? []).map((s) => [s.id, s])), [services.data]);

  async function update(items: SelectionItem[]) {
    setSaving(true);
    setError(null);
    try {
      setCart(await saveCart(items));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function empty() {
    if (!window.confirm("Remove everything from your cart?")) return;
    setSaving(true);
    try {
      await clearCart();
      setCart(current ? { ...current, items: [], quote: null } : null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loaded.loading) return <PageLoader label="Loading your cart" />;
  if (loaded.error) return <Alert>{loaded.error}</Alert>;
  if (!current || current.items.length === 0) {
    return (
      <EmptyState
        title="Your cart is empty"
        description="Browse our HVAC services and add the ones you need."
        action={<ButtonLink href="/services">Browse services</ButtonLink>}
      />
    );
  }

  const blocked = (current.quote?.problems.length ?? 0) > 0;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        {current.items.map((item, index) => {
          const service = byId.get(item.service_id);
          return (
            <Card key={item.service_id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {service ? <ServiceIcon name={service.icon} /> : null}
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">{service?.name ?? "Unavailable service"}</h2>
                    <p className="text-sm text-slate-500">{service ? servicePriceLabel(service) : "This service is no longer offered - please remove it."}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() => update(current.items.filter((_, i) => i !== index))}
                  aria-label={`Remove ${service?.name ?? "service"} from cart`}
                >
                  Remove
                </Button>
              </div>
              {service ? (
                <div className="mt-4">
                  <ItemOptions
                    service={service}
                    item={item}
                    compact
                    idPrefix={`cart-${item.service_id}`}
                    onChange={(next) => update(current.items.map((it, i) => (i === index ? next : it)))}
                  />
                </div>
              ) : null}
            </Card>
          );
        })}
        <Button variant="ghost" size="sm" onClick={empty} disabled={saving}>Empty cart</Button>
      </div>

      <Card className="h-fit p-5 lg:sticky lg:top-24">
        <h2 className="text-base font-semibold text-slate-900">Order summary</h2>
        <div className="mt-4">
          <QuoteSummary quote={current.quote} loading={saving} />
        </div>
        <ButtonLink
          href="/checkout/services?source=cart"
          className="mt-5 w-full"
          aria-disabled={blocked || saving}
          onClick={(event) => { if (blocked || saving) event.preventDefault(); }}
        >
          Proceed to checkout
        </ButtonLink>
        <p className="mt-3 text-xs text-slate-500">Pay on service - nothing is charged online.</p>
      </Card>
    </div>
  );
}

export default function CartPage() {
  return (
    <RequireAuth>
      <section className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
        <PageHeader title="Your cart" description="Prices are calculated by our server from the current service catalog." />
        <Cart />
      </section>
    </RequireAuth>
  );
}
