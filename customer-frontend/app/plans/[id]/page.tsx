"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { RegionSelect } from "@/components/region-select";
import {
  Alert,
  ButtonLink,
  Card,
  CheckIcon,
  DetailRow,
  Spinner,
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
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Link
        href="/plans"
        className="text-sm font-medium text-brand-600 hover:text-brand-700"
      >
        &larr; Back to all plans
      </Link>

      <div className="mt-6">
        <RegionSelect
          value={region}
          regions={serviceAreas}
          locked={locked}
          onChange={setRegion}
        />
      </div>

      {loading || regionLoading ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading plan" />
        </div>
      ) : error ? (
        <div className="mt-8">
          <Alert>{error}</Alert>
        </div>
      ) : !plan ? (
        <div className="mt-8">
          <Alert>This plan could not be found.</Alert>
        </div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              {plan.name}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-slate-600">
              {plan.description}
            </p>

            <h2 className="mt-10 text-lg font-semibold text-slate-900">
              What is included
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {plan.features.map((feature) => (
                <li
                  key={feature}
                  className="flex gap-2.5 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700"
                >
                  <CheckIcon className="text-brand-600" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <div className="mt-10 rounded-lg border border-slate-200 bg-slate-50 p-5">
              <h3 className="text-sm font-semibold text-slate-900">
                About regional pricing
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                This plan is priced for {plan.state_name}. Service costs vary between
                states, so the same plan can cost a different amount depending on where
                your home is. Your enrollment always uses the price for the service
                address on your account.
              </p>
            </div>
          </div>

          <div>
            <Card className="sticky top-24 p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {plan.state_name} pricing
              </p>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-4xl font-bold tracking-tight text-slate-900">
                  {formatMoney(plan.monthly_price)}
                </span>
                <span className="text-sm font-medium text-slate-500">/month</span>
              </div>

              <dl className="mt-6">
                <DetailRow label="Monthly">
                  {formatMoney(plan.monthly_price)}
                </DetailRow>
                <DetailRow label="Annual">
                  {plan.annual_price ? formatMoney(plan.annual_price) : "Not offered"}
                </DetailRow>
                <DetailRow label="Service region">{plan.state_name}</DetailRow>
                <DetailRow label="Availability">
                  {plan.available_in_region ? (
                    <span className="text-emerald-700">Available</span>
                  ) : (
                    <span className="text-rose-700">Not offered here</span>
                  )}
                </DetailRow>
              </dl>

              {plan.available_in_region ? (
                <ButtonLink
                  href={`/checkout/${plan.id}`}
                  size="lg"
                  className="mt-6 w-full"
                >
                  Enroll in this plan
                </ButtonLink>
              ) : (
                <p className="mt-6 rounded-md bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
                  This plan is not sold in {plan.state_name}. Choose another region or
                  browse the plans available to you.
                </p>
              )}

              <p className="mt-4 text-xs leading-relaxed text-slate-500">
                Demo checkout. Enrolling creates a pending request for our team to review
                and never charges a card.
              </p>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
