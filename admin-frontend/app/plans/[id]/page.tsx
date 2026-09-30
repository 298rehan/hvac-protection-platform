"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { TableCard, TableEmpty, TBody, Td, Th, THead, Tr } from "@/components/data-table";
import { MapPinIcon, PencilIcon } from "@/components/icons";
import {
  Alert,
  BackLink,
  ButtonLink,
  Card,
  CardHeader,
  CheckIcon,
  DetailRow,
  PageHeader,
  PageLoader,
  TogglePill,
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

  if (loading) return <PageLoader label="Loading plan" />;

  if (error) return <Alert>{error}</Alert>;
  if (!plan) return null;

  return (
    <div className="space-y-6">
      <BackLink href="/plans">Back to plans</BackLink>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {plan.name}
            <TogglePill on={plan.is_active} onLabel="Active" offLabel="Inactive" />
          </span>
        }
        meta={
          <p className="text-sm text-slate-500">
            Plan #{plan.id} &middot; slug{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
              {plan.slug}
            </code>
          </p>
        }
        actions={
          <ButtonLink href={`/plans/${plan.id}/edit`}>
            <PencilIcon className="h-4 w-4" />
            Edit plan
          </ButtonLink>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Overview" />
          <div className="px-5 py-5">
            <p className="text-sm leading-relaxed text-slate-600">
              {plan.description || "No description set."}
            </p>

            <h3 className="mt-6 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Features ({plan.features.length})
            </h3>
            {plan.features.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No features listed.</p>
            ) : (
              <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex gap-2.5 rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-700 ring-1 ring-slate-100"
                  >
                    <CheckIcon className="mt-px h-4 w-4 text-brand-600" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card className="h-fit">
          <CardHeader title="Settings" />
          <dl className="px-5 py-2">
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

      <TableCard
        header={
          <CardHeader
            title="Regional pricing"
            description="The customer site prices this plan from the row matching the customer's state. States not listed here cannot buy this plan."
          />
        }
      >
        <THead>
          <Th>State</Th>
          <Th>Code</Th>
          <Th className="text-right">Monthly price</Th>
          <Th className="text-right">Annual price</Th>
          <Th>Availability</Th>
        </THead>
        <TBody>
          {plan.regions.length === 0 ? (
            <TableEmpty
              colSpan={5}
              message="No states assigned. This plan is not sold anywhere."
              icon={<MapPinIcon className="h-5 w-5" />}
            />
          ) : (
            plan.regions.map((region) => (
              <Tr key={region.id}>
                <Td className="font-medium text-slate-900">{region.state_name}</Td>
                <Td className="text-slate-500">{region.state_code}</Td>
                <Td className="text-right tabular-nums">{formatMoney(region.monthly_price)}</Td>
                <Td className="text-right tabular-nums">
                  {region.annual_price ? formatMoney(region.annual_price) : "—"}
                </Td>
                <Td>
                  <TogglePill on={region.is_available} onLabel="Available" offLabel="Paused" />
                </Td>
              </Tr>
            ))
          )}
        </TBody>
      </TableCard>
    </div>
  );
}
