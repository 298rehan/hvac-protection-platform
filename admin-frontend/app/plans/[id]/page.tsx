"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { TableCard, TableEmpty, Td, Th } from "@/components/data-table";
import {
  Alert,
  ButtonLink,
  Card,
  CheckIcon,
  DetailRow,
  Spinner,
} from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { fetchPlan } from "@/services/adminService";
import type { Plan } from "@/types";

export default function PlanDetailPage() {
  return (
    <AdminShell>
      <PlanDetail />
    </AdminShell>
  );
}

function PlanDetail() {
  const params = useParams<{ id: string }>();
  const planId = Number(params.id);

  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Number.isNaN(planId)) {
      setError("Invalid plan id.");
      setLoading(false);
      return;
    }
    fetchPlan(planId)
      .then(setPlan)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [planId]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner label="Loading plan" />
      </div>
    );
  }

  if (error) return <Alert>{error}</Alert>;
  if (!plan) return null;

  return (
    <div className="space-y-6">
      <Link href="/plans" className="text-sm font-medium text-brand-600 hover:text-brand-700">
        &larr; Back to plans
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{plan.name}</h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Plan #{plan.id} &middot; slug <code className="text-slate-500">{plan.slug}</code>
          </p>
        </div>
        <ButtonLink href={`/plans/${plan.id}/edit`}>Edit plan</ButtonLink>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <h2 className="text-base font-semibold text-slate-900">Overview</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            {plan.description || "No description set."}
          </p>

          <h3 className="mt-6 text-sm font-semibold text-slate-900">Features</h3>
          {plan.features.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No features listed.</p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2 text-sm text-slate-700">
                  <CheckIcon className="h-4 w-4 text-brand-600" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="h-fit p-6">
          <h2 className="text-base font-semibold text-slate-900">Settings</h2>
          <dl className="mt-4">
            <DetailRow label="Status">
              {plan.is_active ? (
                <span className="text-emerald-700">Active</span>
              ) : (
                <span className="text-slate-500">Inactive</span>
              )}
            </DetailRow>
            <DetailRow label="Base monthly">
              {formatMoney(plan.base_monthly_price)}
            </DetailRow>
            <DetailRow label="Base annual">
              {plan.base_annual_price ? formatMoney(plan.base_annual_price) : "Not offered"}
            </DetailRow>
            <DetailRow label="Display order">{plan.display_order}</DetailRow>
            <DetailRow label="Created">{formatDate(plan.created_at)}</DetailRow>
            <DetailRow label="Last updated">{formatDate(plan.updated_at)}</DetailRow>
          </dl>
        </Card>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Regional pricing</h2>
        <p className="mt-1 text-sm text-slate-600">
          The customer site prices this plan from the row matching the customer&apos;s
          state. States not listed here cannot buy this plan.
        </p>
        <div className="mt-4">
          <TableCard>
            <thead className="bg-slate-50">
              <tr>
                <Th>State</Th>
                <Th>Code</Th>
                <Th>Monthly price</Th>
                <Th>Annual price</Th>
                <Th>Availability</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plan.regions.length === 0 ? (
                <TableEmpty
                  colSpan={5}
                  message="No states assigned. This plan is not sold anywhere."
                />
              ) : (
                plan.regions.map((region) => (
                  <tr key={region.id} className="hover:bg-slate-50">
                    <Td className="font-medium text-slate-900">{region.state_name}</Td>
                    <Td>{region.state_code}</Td>
                    <Td>{formatMoney(region.monthly_price)}</Td>
                    <Td>
                      {region.annual_price ? formatMoney(region.annual_price) : "-"}
                    </Td>
                    <Td>
                      {region.is_available ? (
                        <span className="text-emerald-700">Available</span>
                      ) : (
                        <span className="text-slate-500">Paused</span>
                      )}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </TableCard>
        </div>
      </section>
    </div>
  );
}
