"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { TableCard, TableEmpty, Td, Th } from "@/components/data-table";
import { Alert, Button, ButtonLink, Spinner } from "@/components/ui";
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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Plans</h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Creating an active plan with regional pricing makes it appear on the customer
            site immediately, with no frontend change.
          </p>
        </div>
        <ButtonLink href="/plans/new">Create plan</ButtonLink>
      </header>

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading plans" />
        </div>
      ) : (
        <TableCard>
          <thead className="bg-slate-50">
            <tr>
              <Th>Plan</Th>
              <Th>Base monthly</Th>
              <Th>Base annual</Th>
              <Th>Regions</Th>
              <Th>Order</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {plans.length === 0 ? (
              <TableEmpty colSpan={7} message="No plans yet. Create your first plan." />
            ) : (
              plans.map((plan) => (
                <tr key={plan.id} className="hover:bg-slate-50">
                  <Td>
                    <Link
                      href={`/plans/${plan.id}`}
                      className="font-semibold text-brand-600 hover:text-brand-700"
                    >
                      {plan.name}
                    </Link>
                    <p className="mt-0.5 max-w-xs truncate text-xs font-normal text-slate-500">
                      {plan.features.length} feature
                      {plan.features.length === 1 ? "" : "s"}
                    </p>
                  </Td>
                  <Td>{formatMoney(plan.base_monthly_price)}</Td>
                  <Td>
                    {plan.base_annual_price ? formatMoney(plan.base_annual_price) : "-"}
                  </Td>
                  <Td>
                    {plan.regions.length === 0 ? (
                      <span className="text-slate-400">None</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {plan.regions.map((region) => (
                          <span
                            key={region.id}
                            title={`${region.state_name}: ${formatMoney(region.monthly_price)}/month`}
                            className={
                              region.is_available
                                ? "rounded bg-brand-50 px-1.5 py-0.5 text-xs font-semibold text-brand-700"
                                : "rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-400 line-through"
                            }
                          >
                            {region.state_code}
                          </span>
                        ))}
                      </span>
                    )}
                  </Td>
                  <Td>{plan.display_order}</Td>
                  <Td>
                    <span
                      className={
                        plan.is_active
                          ? "inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-emerald-800"
                          : "inline-flex rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-slate-600"
                      }
                    >
                      {plan.is_active ? "Active" : "Inactive"}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex gap-2">
                      <ButtonLink href={`/plans/${plan.id}/edit`} variant="secondary" size="sm">
                        Edit
                      </ButtonLink>
                      <Button
                        variant="subtle"
                        size="sm"
                        disabled={busyId === plan.id}
                        onClick={() => toggleActive(plan)}
                      >
                        {plan.is_active ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={busyId === plan.id}
                        onClick={() => handleDelete(plan)}
                      >
                        Delete
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </TableCard>
      )}
    </div>
  );
}
