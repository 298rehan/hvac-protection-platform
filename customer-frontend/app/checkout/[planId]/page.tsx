"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { InfoIcon, MapPinIcon } from "@/components/icons";
import { RequireAuth } from "@/components/require-auth";
import {
  Alert,
  BackLink,
  Button,
  ButtonLink,
  Card,
  CheckIcon,
  DetailRow,
  PageLoader,
} from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cx, formatMoney } from "@/lib/format";
import { fetchPlan } from "@/services/planService";
import { createPurchase } from "@/services/purchaseService";
import type { BillingCycle, PublicPlan } from "@/types";

export default function CheckoutPage() {
  return (
    <RequireAuth>
      <Checkout />
    </RequireAuth>
  );
}

function Checkout() {
  const params = useParams<{ planId: string }>();
  const planId = Number(params.planId);
  const router = useRouter();
  const { user } = useAuth();

  const [plan, setPlan] = useState<PublicPlan | null>(null);
  const [cycle, setCycle] = useState<BillingCycle>("MONTHLY");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The customer's own state is always used - it is what the backend validates.
  const stateCode = user?.state ?? null;

  useEffect(() => {
    if (!stateCode || Number.isNaN(planId)) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    fetchPlan(planId, stateCode)
      .then((result) => {
        if (!cancelled) setPlan(result);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [planId, stateCode]);

  async function handlePurchase() {
    if (!plan) return;
    setError(null);
    setSubmitting(true);
    try {
      const purchase = await createPurchase(plan.id, cycle);
      router.push(`/dashboard/purchases?submitted=${purchase.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  if (loading) {
    return <PageLoader label="Loading checkout" />;
  }

  if (!stateCode) {
    return (
      <Shell>
        <Alert>
          Your account does not have a service state yet. Add your address on the{" "}
          <Link href="/dashboard/profile" className="font-semibold underline">
            Profile page
          </Link>{" "}
          before enrolling.
        </Alert>
      </Shell>
    );
  }

  if (error && !plan) {
    return (
      <Shell>
        <Alert>{error}</Alert>
        <div className="mt-6">
          <ButtonLink href="/plans" variant="secondary">
            Back to plans
          </ButtonLink>
        </div>
      </Shell>
    );
  }

  if (!plan) {
    return (
      <Shell>
        <Alert>This plan could not be found.</Alert>
      </Shell>
    );
  }

  const price = cycle === "ANNUAL" ? plan.annual_price : plan.monthly_price;
  const annualUnavailable = cycle === "ANNUAL" && !plan.annual_price;
  const canSubmit =
    confirmed && plan.available_in_region && !annualUnavailable && !submitting;

  return (
    <Shell>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5">
            <InfoIcon className="mt-px h-5 w-5 text-amber-500" />
            <div>
              <p className="text-sm font-semibold text-amber-900">Demo checkout</p>
              <p className="mt-1 text-sm leading-relaxed text-amber-800">
                This is a simulated checkout for a portfolio project. No payment gateway
                is contacted, no card details are collected, and nothing is charged.
                Submitting creates a pending enrollment for our team to review.
              </p>
            </div>
          </div>

          <Card>
            <Step number={1} title="Service address">
              <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-700 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-3">
                  <MapPinIcon className="mt-0.5 h-5 w-5 text-slate-400" />
                  <div>
                    <p className="font-semibold text-slate-900">
                      {user?.first_name} {user?.last_name}
                    </p>
                    <p className="mt-1">{user?.address}</p>
                    <p>
                      {user?.city}, {user?.state} {user?.zip_code}
                    </p>
                  </div>
                </div>
                <Link
                  href="/dashboard/profile"
                  className="pl-8 text-sm font-semibold text-brand-600 hover:text-brand-700 sm:pl-0"
                >
                  Update address
                </Link>
              </div>
            </Step>

            <Step number={2} title="Billing frequency">
              <div
                role="radiogroup"
                aria-label="Billing frequency"
                className="grid gap-3 sm:grid-cols-2"
              >
                <CycleOption
                  label="Monthly"
                  price={formatMoney(plan.monthly_price)}
                  suffix="/month"
                  selected={cycle === "MONTHLY"}
                  onSelect={() => setCycle("MONTHLY")}
                />
                <CycleOption
                  label="Annual"
                  price={plan.annual_price ? formatMoney(plan.annual_price) : "Not offered"}
                  suffix={plan.annual_price ? "/year" : ""}
                  selected={cycle === "ANNUAL"}
                  disabled={!plan.annual_price}
                  onSelect={() => plan.annual_price && setCycle("ANNUAL")}
                />
              </div>
            </Step>

            <Step number={3} title="Confirm" last>
              <label
                className={cx(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors",
                  confirmed
                    ? "border-brand-300 bg-brand-50/60"
                    : "border-slate-200 hover:border-slate-300",
                )}
              >
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-brand-600"
                />
                <span className="text-sm leading-relaxed text-slate-700">
                  I understand this is a demonstration enrollment, that no payment will be
                  taken, and that my plan becomes active only after our service team
                  approves it.
                </span>
              </label>

              {error ? (
                <div className="mt-5">
                  <Alert>{error}</Alert>
                </div>
              ) : null}

              <Button
                size="lg"
                className="mt-6 w-full"
                onClick={handlePurchase}
                disabled={!canSubmit}
              >
                {submitting ? (
                  <>
                    <span
                      aria-hidden
                      className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                    />
                    Submitting enrollment...
                  </>
                ) : (
                  "Purchase plan"
                )}
              </Button>
              {!confirmed ? (
                <p className="mt-3 text-center text-xs text-slate-500">
                  Tick the confirmation above to continue.
                </p>
              ) : null}
            </Step>
          </Card>
        </div>

        <div>
          <Card className="overflow-hidden lg:sticky lg:top-24">
            <div className="border-b border-slate-100 bg-slate-50/70 px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Order summary
              </p>
              <h2 className="mt-1.5 text-lg font-bold text-slate-900">{plan.name}</h2>
            </div>

            <div className="px-6 py-5">
              <dl>
                <DetailRow label="Service region">{plan.state_name}</DetailRow>
                <DetailRow label="Billing">
                  {cycle === "ANNUAL" ? "Annual" : "Monthly"}
                </DetailRow>
                <DetailRow label="Price">
                  {formatMoney(price)}
                  <span className="ml-1 font-normal text-slate-500">
                    {cycle === "ANNUAL" ? "/year" : "/month"}
                  </span>
                </DetailRow>
              </dl>
              <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-4">
                <span className="text-sm font-semibold text-slate-900">Due today</span>
                <span className="text-xl font-bold text-slate-900 tabular-nums">$0.00</span>
              </div>

              <ul className="mt-5 space-y-2.5 border-t border-slate-100 pt-5">
                {plan.features.slice(0, 5).map((feature) => (
                  <li key={feature} className="flex gap-2 text-sm text-slate-600">
                    <CheckIcon className="mt-0.5 h-4 w-4 text-brand-600" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              {!plan.available_in_region ? (
                <div className="mt-5">
                  <Alert>This plan is not available in {plan.state_name}.</Alert>
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <BackLink href="/plans">Back to plans</BackLink>
      <h1 className="mt-4 mb-8 text-3xl font-bold tracking-tight text-slate-900">Checkout</h1>
      {children}
    </div>
  );
}

function Step({
  number,
  title,
  last = false,
  children,
}: {
  number: number;
  title: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={cx("px-5 py-6 sm:px-7", !last && "border-b border-slate-100")}>
      <h2 className="flex items-center gap-3 text-base font-semibold text-slate-900">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
          {number}
        </span>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CycleOption({
  label,
  price,
  suffix,
  selected,
  disabled = false,
  onSelect,
}: {
  label: string;
  price: string;
  suffix: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      disabled={disabled}
      className={cx(
        "rounded-lg border p-4 text-left transition-[border-color,background-color,box-shadow]",
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60"
          : selected
            ? "border-brand-500 bg-brand-50/60 ring-1 ring-brand-500"
            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
      )}
    >
      <span className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-900">{label}</span>
        <span
          aria-hidden
          className={cx(
            "flex h-4 w-4 items-center justify-center rounded-full border",
            selected ? "border-brand-600 bg-brand-600" : "border-slate-300 bg-white",
          )}
        >
          {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
        </span>
      </span>
      <span className="mt-2 block text-xl font-bold text-slate-900 tabular-nums">
        {price}
        <span className="text-sm font-normal text-slate-500">{suffix}</span>
      </span>
    </button>
  );
}
