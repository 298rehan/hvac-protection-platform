"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import {
  TableCard,
  TableEmpty,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/data-table";
import { LayersIcon, PencilIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { Alert, Button, ButtonLink, PageHeader, TogglePill } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { deletePlan, fetchPlans, updatePlan } from "@/services/adminService";
import type { Plan } from "@/types";

export default function PlansPage() {
  return (
    <AdminShell>
      <PlanList />
    </AdminShell>
  );
}

function PlanList() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchPlans()
      .then(setPlans)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function toggleActive(plan: Plan) {
    setError(null);
    setNotice(null);
    setBusyId(plan.id);
    try {
      await updatePlan(plan.id, { is_active: !plan.is_active });
      setNotice(
        `${plan.name} is now ${plan.is_active ? "inactive and hidden from customers" : "active and visible to customers"}.`,
      );
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(plan: Plan) {
    const confirmed = window.confirm(
      `Delete "${plan.name}"? This cannot be undone. Plans with existing purchases cannot be deleted - deactivate them instead.`,
    );
    if (!confirmed) return;

    setError(null);
    setNotice(null);
    setBusyId(plan.id);
    try {
      await deletePlan(plan.id);
      setNotice(`${plan.name} was deleted.`);
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plans"
        description="Creating an active plan with regional pricing makes it appear on the customer site immediately, with no frontend change."
        actions={
          <ButtonLink href="/plans/new">
            <PlusIcon className="h-4.5 w-4.5" />
            Create plan
          </ButtonLink>
        }
      />

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}

      {loading ? (
        <TableSkeleton columns={6} rows={4} />
      ) : (
        <TableCard
          footer={
            plans.length > 0
              ? `${plans.length} plan${plans.length === 1 ? "" : "s"} · ${plans.filter((plan) => plan.is_active).length} active`
              : undefined
          }
        >
          <THead>
            <Th>Plan</Th>
            <Th className="text-right">Base monthly</Th>
            <Th className="text-right">Base annual</Th>
            <Th>Regions</Th>
            <Th className="text-center">Order</Th>
            <Th>Status</Th>
            <Th className="text-right">Actions</Th>
          </THead>
          <TBody>
            {plans.length === 0 ? (
              <TableEmpty
                colSpan={7}
                message="No plans yet. Create your first plan."
                icon={<LayersIcon className="h-5 w-5" />}
                action={
                  <ButtonLink href="/plans/new" size="sm">
                    <PlusIcon className="h-4 w-4" />
                    Create plan
                  </ButtonLink>
                }
              />
            ) : (
              plans.map((plan) => (
                <Tr key={plan.id} className={plan.is_active ? undefined : "bg-slate-50/50"}>
                  <Td>
                    <Link
                      href={`/plans/${plan.id}`}
                      className="font-semibold text-slate-900 hover:text-brand-700"
                    >
                      {plan.name}
                    </Link>
                    <p className="mt-0.5 max-w-xs truncate text-xs font-normal text-slate-500">
                      {plan.features.length} feature
                      {plan.features.length === 1 ? "" : "s"}
                    </p>
                  </Td>
                  <Td className="text-right tabular-nums">
                    {formatMoney(plan.base_monthly_price)}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {plan.base_annual_price ? formatMoney(plan.base_annual_price) : "—"}
                  </Td>
                  <Td>
                    {plan.regions.length === 0 ? (
                      <span className="text-xs text-slate-400">None</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {plan.regions.map((region) => (
                          <span
                            key={region.id}
                            title={`${region.state_name}: ${formatMoney(region.monthly_price)}/month${region.is_available ? "" : " (paused)"}`}
                            className={
                              region.is_available
                                ? "rounded-md bg-brand-50 px-1.5 py-0.5 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-100"
                                : "rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-400 line-through ring-1 ring-inset ring-slate-200"
                            }
                          >
                            {region.state_code}
                          </span>
                        ))}
                      </span>
                    )}
                  </Td>
                  <Td className="text-center tabular-nums text-slate-500">
                    {plan.display_order}
                  </Td>
                  <Td>
                    <TogglePill on={plan.is_active} onLabel="Active" offLabel="Inactive" />
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      <ButtonLink href={`/plans/${plan.id}/edit`} variant="secondary" size="sm">
                        <PencilIcon className="h-3.5 w-3.5" />
                        Edit
                      </ButtonLink>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busyId === plan.id}
                        onClick={() => toggleActive(plan)}
                      >
                        {plan.is_active ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="danger-outline"
                        size="sm"
                        disabled={busyId === plan.id}
                        onClick={() => handleDelete(plan)}
                        aria-label={`Delete ${plan.name}`}
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))
            )}
          </TBody>
        </TableCard>
      )}
    </div>
  );
}
