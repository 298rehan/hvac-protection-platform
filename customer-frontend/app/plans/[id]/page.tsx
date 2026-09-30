"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ArrowRightIcon, LockIcon, MapPinIcon } from "@/components/icons";
import { RegionSelect } from "@/components/region-select";
import {
  Alert,
  BackLink,
  ButtonLink,
  Card,
  CheckIcon,
  DetailRow,
  Skeleton,
} from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useRegion } from "@/lib/use-region";
import { fetchPlan } from "@/services/planService";
import type { PublicPlan } from "@/types";

export default function PlanDetailsPage() {
  const params = useParams<{ id: string }>();
  const planId = Number(params.id);

  const { region, serviceAreas, locked, loading: regionLoading, setRegion } = useRegion();
  const [plan, setPlan] = useState<PublicPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!region || Number.isNaN(planId)) {
      if (!regionLoading) setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchPlan(planId, region)
      .then((result) => {
        if (!cancelled) setPlan(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setPlan(null);
          setError(errorMessage(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [planId, region, regionLoading]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <BackLink href="/plans">All plans</BackLink>

      <div className="mt-6">
        <RegionSelect
          value={region}
          regions={serviceAreas}
          locked={locked}
          onChange={setRegion}
        />
      </div>

      {loading || regionLoading ? (
        <PlanDetailSkeleton />
      ) : error ? (
        <div className="mt-8">
          <Alert>{error}</Alert>
        </div>
      ) : !plan ? (
        <div className="mt-8">
          <Alert>This plan could not be found.</Alert>
        </div>
      ) : (
        <div className="mt-10 grid animate-fade-in gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-brand-600">
              Protection plan
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              {plan.name}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
              {plan.description}
            </p>

            <h2 className="mt-12 text-lg font-semibold text-slate-900">What is included</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {plan.features.map((feature) => (
                <li
                  key={feature}
                  className="flex gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50">
                    <CheckIcon className="h-3.5 w-3.5 text-brand-600" />
                  </span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <div className="mt-10 flex gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-brand-600 ring-1 ring-slate-200">
                <MapPinIcon />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  About regional pricing
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  This plan is priced for {plan.state_name}. Service costs vary between
                  states, so the same plan can cost a different amount depending on where
                  your home is. Your enrollment always uses the price for the service
                  address on your account.
                </p>
              </div>
            </div>
          </div>

          <div>
            <Card className="overflow-hidden lg:sticky lg:top-24">
              <div className="border-b border-slate-100 bg-slate-50/70 px-6 py-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {plan.state_name} pricing
                </p>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-4xl font-bold tracking-tight text-slate-900 tabular-nums">
                    {formatMoney(plan.monthly_price)}
                  </span>
                  <span className="text-sm font-medium text-slate-500">/month</span>
                </div>
              </div>

              <div className="px-6 py-5">
                <dl>
                  <DetailRow label="Monthly">{formatMoney(plan.monthly_price)}</DetailRow>
                  <DetailRow label="Annual">
                    {plan.annual_price ? formatMoney(plan.annual_price) : "Not offered"}
                  </DetailRow>
                  <DetailRow label="Service region">{plan.state_name}</DetailRow>
                  <DetailRow label="Availability">
                    {plan.available_in_region ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Available
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-rose-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                        Not offered here
                      </span>
                    )}
                  </DetailRow>
                </dl>

                {plan.available_in_region ? (
                  <ButtonLink href={`/checkout/${plan.id}`} size="lg" className="mt-6 w-full">
                    Enroll in this plan
                    <ArrowRightIcon className="h-4.5 w-4.5" />
                  </ButtonLink>
                ) : (
                  <div className="mt-6">
                    <Alert>
                      This plan is not sold in {plan.state_name}. Choose another region or
                      browse the plans available to you.
                    </Alert>
                  </div>
                )}

                <p className="mt-4 flex gap-2 text-xs leading-relaxed text-slate-500">
                  <LockIcon className="h-4 w-4 text-slate-400" />
                  Demo checkout. Enrolling creates a pending request for our team to review
                  and never charges a card.
                </p>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function PlanDetailSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading plan"
      className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12"
    >
      <div>
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-3 h-9 w-2/3" />
        <Skeleton className="mt-5 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-5/6" />
        <div className="mt-12 grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((slot) => (
            <Skeleton key={slot} className="h-14 rounded-lg" />
          ))}
        </div>
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}
