"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useRef, useState } from "react";

import { Field, Input, Select, Textarea } from "@/components/form";
import { CheckCircleIcon } from "@/components/icons";
import { QuoteSummary } from "@/components/marketplace/quote-summary";
import { RequireAuth } from "@/components/require-auth";
import { Alert, BackLink, Button, ButtonLink, Card, EmptyState, PageLoader } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cx } from "@/lib/format";
import {
  WINDOW_LABELS,
  WINDOW_SHORT,
  formatPlainDate,
  formatPrice,
  newIdempotencyKey,
} from "@/lib/marketplace-format";
import { useFetch } from "@/lib/use-fetch";
import { useQuote } from "@/lib/use-quote";
import { fetchMyAcUnits } from "@/services/acUnitService";
import { fetchAvailability, fetchCart, fetchPlanById, placeOrder } from "@/services/marketplaceService";
import { fetchRegions } from "@/services/planService";
import type { Frequency, OrderDetail, SelectionItem, VisitWindow } from "@/types/marketplace";

type Source = { kind: "cart" } | { kind: "plan"; id: number } | { kind: "service"; item: SelectionItem };

const STEPS = ["Review", "Address", "Visit time", "Confirm"] as const;
const FREQUENCIES: Frequency[] = ["ONE_TIME", "MONTHLY", "QUARTERLY", "YEARLY"];

function readSource(params: URLSearchParams): Source | null {
  if (params.get("source") === "cart") return { kind: "cart" };
  const plan = Number(params.get("plan"));
  if (plan > 0) return { kind: "plan", id: plan };
  const service = Number(params.get("service"));
  if (service > 0) {
    const freq = params.get("freq") as Frequency | null;
    return {
      kind: "service",
      item: {
        service_id: service,
        quantity: Math.max(1, Number(params.get("qty")) || 1),
        frequency: freq && FREQUENCIES.includes(freq) ? freq : "ONE_TIME",
        addon_ids: (params.get("addons") ?? "").split(",").map(Number).filter((n) => n > 0),
      },
    };
  }
  return null;
}

function Checkout() {
  const params = useSearchParams();
  const source = useMemo(() => readSource(new URLSearchParams(params.toString())), [params]);
  const sourceKey = source ? JSON.stringify(source) : null;

  const loaded = useFetch(sourceKey, async () => {
    if (!source) return null;
    if (source.kind === "cart") {
      const cart = await fetchCart();
      return { items: cart.items, planId: null, acUnitId: null, label: "your cart" };
    }
    if (source.kind === "plan") {
      const plan = await fetchPlanById(source.id);
      return { items: plan.items, planId: plan.id, acUnitId: plan.ac_unit_id, label: plan.name };
    }
    return { items: [source.item], planId: null, acUnitId: null, label: "this service" };
  });

  if (!source) {
    return <EmptyState title="Nothing to check out" description="Choose services first." action={<ButtonLink href="/services">Browse services</ButtonLink>} />;
  }
  if (loaded.loading) return <PageLoader label="Preparing checkout" />;
  if (loaded.error) return <Alert>{loaded.error}</Alert>;
  if (!loaded.data || loaded.data.items.length === 0) {
    return <EmptyState title="Nothing to check out" description="Your selection is empty." action={<ButtonLink href="/services">Browse services</ButtonLink>} />;
  }
  return (
    <CheckoutFlow
      key={sourceKey}
      items={loaded.data.items}
      planId={loaded.data.planId}
      initialUnitId={loaded.data.acUnitId}
      fromCart={source.kind === "cart"}
      label={loaded.data.label}
    />
  );
}

function CheckoutFlow({
  items,
  planId,
  initialUnitId,
  fromCart,
  label,
}: {
  items: SelectionItem[];
  planId: number | null;
  initialUnitId: number | null;
  fromCart: boolean;
  label: string;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [codeInput, setCodeInput] = useState("");
  const [discountCode, setDiscountCode] = useState("");
  const [unitId, setUnitId] = useState<number | null>(initialUnitId);
  const [useUnit, setUseUnit] = useState(true);
  const [address, setAddress] = useState({
    address: user?.address ?? "",
    city: user?.city ?? "",
    state: user?.state ?? "",
    zip_code: user?.zip_code ?? "",
  });
  const [slot, setSlot] = useState<{ date: string; window: VisitWindow } | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  // One key per checkout attempt: a retry or double click returns the same order.
  const idempotencyKey = useRef(newIdempotencyKey());
  const inFlight = useRef(false);

  const units = useFetch("checkout-units", fetchMyAcUnits);
  const regions = useFetch("regions", fetchRegions);
  const unitList = units.data ?? [];
  const unit = useUnit ? unitList.find((u) => u.id === unitId) ?? null : null;
  const where = unit
    ? { state: unit.state, zip_code: unit.zip_code, label: `${unit.address}, ${unit.city}, ${unit.state} ${unit.zip_code}` }
    : { state: address.state, zip_code: address.zip_code.trim(), label: `${address.address}, ${address.city}, ${address.state} ${address.zip_code}` };
  const addressReady = unit
    ? true
    : Boolean(address.address.trim() && address.city.trim() && address.state && address.zip_code.trim().length >= 3);

  const { quote, loading: quoteLoading, error: quoteError } = useQuote(items, {
    discountCode,
    state: addressReady ? where.state : user?.state ?? undefined,
  });
  const slots = useFetch(step >= 2 && addressReady ? `slots|${where.state}|${where.zip_code}` : null, () =>
    fetchAvailability(where.state, where.zip_code, 14),
  );
  const slotDays = useMemo(() => {
    const days = new Map<string, { window: VisitWindow; available: boolean }[]>();
    for (const s of slots.data ?? []) days.set(s.date, [...(days.get(s.date) ?? []), { window: s.window, available: s.available }]);
    return [...days.entries()];
  }, [slots.data]);
  const anyAvailable = (slots.data ?? []).some((s) => s.available);
  const quoteBlocked = !quote || quoteLoading || quote.problems.length > 0;

  async function submit() {
    if (inFlight.current || !slot) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const placed = await placeOrder({
        idempotency_key: idempotencyKey.current,
        items,
        custom_plan_id: planId,
        from_cart: fromCart,
        ac_unit_id: unit?.id ?? null,
        ...(unit ? {} : { address: address.address.trim(), city: address.city.trim(), state: address.state, zip_code: address.zip_code.trim() }),
        requested_date: slot.date,
        requested_window: slot.window,
        discount_code: discountCode || null,
        payment_method: "PAY_ON_SERVICE",
        notes: notes.trim() || null,
      });
      setOrder(placed);
      if (fromCart && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("hvac-cart-updated", { detail: 0 }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  if (order) {
    return (
      <Card className="mx-auto max-w-xl p-8 text-center" role="status">
        <CheckCircleIcon className="mx-auto h-12 w-12 text-emerald-500" />
        <h2 className="mt-4 text-2xl font-bold text-slate-900">Order #{order.id} received</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Our team will confirm your order and book a technician for{" "}
          <strong>{formatPlainDate(order.requested_date)}, {WINDOW_SHORT[order.requested_window].toLowerCase()}</strong>.
          You pay on the day of service - nothing has been charged.
        </p>
        <p className="mt-4 text-lg font-semibold text-slate-900">
          {order.total_is_estimate ? "Estimated total" : "Total"}: {formatPrice(order.total, order.currency)}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <ButtonLink href={`/dashboard/orders/${order.id}`}>Track this order</ButtonLink>
          <ButtonLink href="/services" variant="secondary">Keep browsing</ButtonLink>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div>
        <ol className="mb-6 flex flex-wrap gap-2" aria-label="Checkout steps">
          {STEPS.map((name, index) => (
            <li
              key={name}
              aria-current={index === step ? "step" : undefined}
              className={cx(
                "rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset",
                index === step ? "bg-brand-600 text-white ring-brand-600" : index < step ? "bg-brand-50 text-brand-700 ring-brand-200" : "bg-white text-slate-500 ring-slate-200",
              )}
            >
              {index + 1}. {name}
            </li>
          ))}
        </ol>

        {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}

        {step === 0 ? (
          <Card className="p-5">
            <h2 className="text-lg font-semibold text-slate-900">Review {label}</h2>
            <div className="mt-4">
              <QuoteSummary quote={quote} loading={quoteLoading} error={quoteError} />
            </div>
            <div className="mt-5 flex items-end gap-2">
              <Field label="Discount code" htmlFor="discount" className="flex-1">
                <Input id="discount" value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder="Optional" maxLength={40} />
              </Field>
              <Button variant="secondary" onClick={() => setDiscountCode(codeInput.trim())}>Apply</Button>
            </div>
            {quote?.problems.length ? (
              <p className="mt-3 text-sm text-rose-600">
                Fix the issues above before continuing{discountCode ? " (or remove the discount code)" : ""}.{" "}
                {discountCode ? <button type="button" className="font-semibold underline" onClick={() => { setDiscountCode(""); setCodeInput(""); }}>Remove code</button> : null}
              </p>
            ) : null}
            <div className="mt-6 flex justify-end">
              <Button onClick={() => setStep(1)} disabled={quoteBlocked}>Continue</Button>
            </div>
          </Card>
        ) : null}

        {step === 1 ? (
          <Card className="p-5">
            <h2 className="text-lg font-semibold text-slate-900">Where should we come?</h2>
            {unitList.length > 0 ? (
              <fieldset className="mt-4 space-y-2">
                <legend className="text-sm font-medium text-slate-700">Choose one of your HVAC units</legend>
                {unitList.map((u) => (
                  <label key={u.id} className="flex items-start gap-3 rounded-lg p-3 ring-1 ring-slate-200 hover:bg-slate-50">
                    <input type="radio" name="where" className="mt-1" checked={useUnit && unitId === u.id} onChange={() => { setUseUnit(true); setUnitId(u.id); setSlot(null); }} />
                    <span className="text-sm">
                      <span className="font-semibold text-slate-900">{u.brand} {u.model_number}</span>
                      <span className="block text-slate-500">{u.address}, {u.city}, {u.state} {u.zip_code}</span>
                    </span>
                  </label>
                ))}
                <label className="flex items-center gap-3 rounded-lg p-3 ring-1 ring-slate-200 hover:bg-slate-50">
                  <input type="radio" name="where" checked={!useUnit || unitId === null} onChange={() => { setUseUnit(false); setSlot(null); }} />
                  <span className="text-sm font-semibold text-slate-900">Use a different address</span>
                </label>
              </fieldset>
            ) : null}

            {!unit ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Street address" htmlFor="addr" className="sm:col-span-2">
                  <Input id="addr" value={address.address} maxLength={255} onChange={(e) => { setAddress({ ...address, address: e.target.value }); setSlot(null); }} />
                </Field>
                <Field label="City" htmlFor="city">
                  <Input id="city" value={address.city} maxLength={120} onChange={(e) => { setAddress({ ...address, city: e.target.value }); setSlot(null); }} />
                </Field>
                <Field label="State" htmlFor="state">
                  <Select id="state" value={address.state} onChange={(e) => { setAddress({ ...address, state: e.target.value }); setSlot(null); }}>
                    <option value="">Choose a state</option>
                    {(regions.data ?? []).map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
                  </Select>
                </Field>
                <Field label="ZIP code" htmlFor="zip">
                  <Input id="zip" value={address.zip_code} maxLength={10} inputMode="numeric" onChange={(e) => { setAddress({ ...address, zip_code: e.target.value }); setSlot(null); }} />
                </Field>
              </div>
            ) : null}

            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
              <Button onClick={() => setStep(2)} disabled={!addressReady}>Continue</Button>
            </div>
          </Card>
        ) : null}

        {step === 2 ? (
          <Card className="p-5">
            <h2 className="text-lg font-semibold text-slate-900">Choose a visit time</h2>
            <p className="mt-1 text-sm text-slate-500">
              Times are local to {where.state}. This is your requested window - we confirm the exact time when a technician is booked.
            </p>
            {slots.loading ? <div className="mt-4"><PageLoader label="Checking availability" /></div> : null}
            {slots.error ? <div className="mt-4"><Alert>{slots.error}</Alert></div> : null}
            {slots.data && !anyAvailable ? (
              <div className="mt-4">
                <Alert tone="info">
                  We don&apos;t have a technician available at this address in the next two weeks - usually because no
                  technician serves this area yet. Please try another address or contact us.
                </Alert>
              </div>
            ) : null}
            {anyAvailable ? (
              <div className="mt-4 space-y-3">
                {slotDays.map(([day, windows]) => (
                  <div key={day} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <p className="w-44 shrink-0 text-sm font-medium text-slate-700">{formatPlainDate(day)}</p>
                    <div className="flex flex-wrap gap-2">
                      {windows.map((w) => {
                        const selected = slot?.date === day && slot.window === w.window;
                        return (
                          <button
                            key={w.window}
                            type="button"
                            disabled={!w.available}
                            aria-pressed={selected}
                            title={WINDOW_LABELS[w.window]}
                            onClick={() => setSlot({ date: day, window: w.window })}
                            className={cx(
                              "rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ring-inset",
                              selected ? "bg-brand-600 text-white ring-brand-600"
                                : w.available ? "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"
                                  : "cursor-not-allowed bg-slate-50 text-slate-300 ring-slate-200 line-through",
                            )}
                          >
                            {WINDOW_SHORT[w.window]}
                            <span className="sr-only">{w.available ? "" : " (unavailable)"}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)} disabled={!slot}>Continue</Button>
            </div>
          </Card>
        ) : null}

        {step === 3 && slot ? (
          <Card className="p-5">
            <h2 className="text-lg font-semibold text-slate-900">Confirm your order</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Address</dt><dd className="text-right font-medium text-slate-900">{where.label}</dd></div>
              {unit ? <div className="flex justify-between gap-4"><dt className="text-slate-500">HVAC unit</dt><dd className="text-right font-medium text-slate-900">{unit.brand} {unit.model_number}</dd></div> : null}
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Requested visit</dt><dd className="text-right font-medium text-slate-900">{formatPlainDate(slot.date)} · {WINDOW_LABELS[slot.window]}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Payment</dt><dd className="text-right font-medium text-slate-900">Pay on service</dd></div>
            </dl>
            <Field label="Notes for the technician (optional)" htmlFor="notes" className="mt-5">
              <Textarea id="notes" rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Gate code, parking, pets…" />
            </Field>
            <p className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600 ring-1 ring-slate-200">
              Pay on service: no card details are collected and nothing is charged online. You pay the technician
              after the visit. Your final total is recalculated by our server when you place the order.
            </p>
            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={() => setStep(2)} disabled={submitting}>Back</Button>
              <Button onClick={submit} disabled={submitting || quoteBlocked}>
                {submitting ? "Placing order…" : `Place order${quote ? ` · ${formatPrice(quote.total, quote.currency)}` : ""}`}
              </Button>
            </div>
          </Card>
        ) : null}
      </div>

      <Card className="h-fit p-5 lg:sticky lg:top-24">
        <h2 className="text-base font-semibold text-slate-900">Price breakdown</h2>
        <div className="mt-4">
          <QuoteSummary quote={quote} loading={quoteLoading} error={quoteError} />
        </div>
        {fromCart ? <p className="mt-4 text-xs text-slate-500">Your cart is emptied once the order is placed.</p> : null}
        {planId ? <p className="mt-4 text-xs text-slate-500">Your saved plan is kept so you can order it again.</p> : null}
      </Card>
    </div>
  );
}

export default function ServiceCheckoutPage() {
  return (
    <RequireAuth>
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <BackLink href="/services">Services</BackLink>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">Checkout</h1>
        <p className="mt-1 text-sm text-slate-500">
          Questions? <Link href="/contact" className="font-semibold text-brand-700 hover:underline">Contact us</Link>.
        </p>
        <div className="mt-8">
          <Suspense fallback={<PageLoader label="Preparing checkout" />}>
            <Checkout />
          </Suspense>
        </div>
      </section>
    </RequireAuth>
  );
}
