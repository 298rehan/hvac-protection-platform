"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { RequireAuth } from "@/components/require-auth";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  CheckIcon,
  DetailRow,
  Spinner,
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
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="Loading checkout" />
      </div>
    );
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
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="p-6 sm:p-8">
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-900">Demo checkout</p>
              <p className="mt-1 text-sm leading-relaxed text-amber-800">
                This is a simulated checkout for a portfolio project. No payment gateway
                is contacted, no card details are collected, and nothing is charged.
                Submitting creates a pending enrollment for our team to review.
              </p>
            </div>

            <h2 className="mt-8 text-lg font-semibold text-slate-900">
              1. Service address
            </h2>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">
                {user?.first_name} {user?.last_name}
              </p>
              <p className="mt-1">{user?.address}</p>
              <p>
                {user?.city}, {user?.state} {user?.zip_code}
              </p>
              <Link
                href="/dashboard/profile"
                className="mt-2 inline-block text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                Update address
              </Link>
            </div>

            <h2 className="mt-8 text-lg font-semibold text-slate-900">
              2. Billing frequency
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
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

            <h2 className="mt-8 text-lg font-semibold text-slate-900">3. Confirm</h2>
            <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-4">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm leading-relaxed text-slate-700">
                I understand this is a demonstration enrollment, that no payment will be
                taken, and that my plan becomes active only after our service team
                approves it.
              </span>
            </label>

            {error ? (
              <div className="mt-6">
                <Alert>{error}</Alert>
              </div>
            ) : null}

            <Button
              size="lg"
              className="mt-6 w-full"
              onClick={handlePurchase}
              disabled={!canSubmit}
            >
              {submitting ? "Submitting enrollment..." : "Purchase plan"}
            </Button>
          </Card>
        </div>

        <div>
          <Card className="sticky top-24 p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Order summary
            </p>
            <h3 className="mt-2 text-lg font-bold text-slate-900">{plan.name}</h3>

            <dl className="mt-4">
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
              <DetailRow label="Due today">$0.00</DetailRow>
            </dl>

            <ul className="mt-5 space-y-2.5 border-t border-slate-100 pt-5">
              {plan.features.slice(0, 5).map((feature) => (
                <li key={feature} className="flex gap-2 text-sm text-slate-600">
                  <CheckIcon className="h-4 w-4 text-brand-600" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            {!plan.available_in_region ? (
              <p className="mt-5 rounded-md bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
                This plan is not available in {plan.state_name}.
              </p>
            ) : null}
          </Card>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Link href="/plans" className="text-sm font-medium text-brand-600 hover:text-brand-700">
        &larr; Back to plans
      </Link>
      <h1 className="mt-4 mb-8 text-3xl font-bold tracking-tight text-slate-900">
        Checkout
      </h1>
      {children}
    </div>
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
      onClick={onSelect}
      disabled={disabled}
      className={cx(
        "rounded-lg border p-4 text-left transition-colors",
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60"
          : selected
            ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
            : "border-slate-200 hover:border-slate-300",
      )}
    >
      <span className="block text-sm font-semibold text-slate-900">{label}</span>
      <span className="mt-1 block text-xl font-bold text-slate-900">
        {price}
        <span className="text-sm font-normal text-slate-500">{suffix}</span>
      </span>
    </button>
  );
}
