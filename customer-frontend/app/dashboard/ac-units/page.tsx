"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ArrowRightIcon, SnowflakeIcon } from "@/components/icons";
import { Alert, ButtonLink, Card, EmptyState, PageHeader, PageLoader } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { AC_TYPE_LABELS } from "@/lib/service-labels";
import { fetchCoverage, fetchMyAcUnits, type Coverage } from "@/services/acUnitService";
import type { AcUnit } from "@/types";

export default function AcUnitsPage() {
  const [units, setUnits] = useState<AcUnit[] | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchMyAcUnits(), fetchCoverage()])
      .then(([list, cov]) => {
        setUnits(list);
        setCoverage(cov);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!units || !coverage) return <PageLoader label="Loading your AC units" />;

  const { purchase, maxUnits } = coverage;
  const covered = purchase ? units.filter((u) => u.purchase_id === purchase.id).length : 0;
  const atLimit = maxUnits !== null && covered >= maxUnits;
  const canRegister = Boolean(purchase) && !atLimit;

  const registerButton = canRegister ? (
    <ButtonLink href="/dashboard/ac-units/new">Register an AC unit</ButtonLink>
  ) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My AC Units"
        description="The equipment covered by your protection plan."
        actions={registerButton}
      />

      {!purchase ? (
        <Alert tone="info">
          Enroll in a protection plan to register AC units.{" "}
          <Link href="/plans" className="font-semibold underline">
            Browse plans
          </Link>
        </Alert>
      ) : (
        <Card className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {purchase.status === "ACTIVE" ? "Current plan" : "Pending plan"}
            </p>
            <p className="mt-1 text-base font-semibold text-slate-900">{purchase.plan.name}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-900 tabular-nums">
              {covered}
              {maxUnits !== null ? <span className="text-base font-medium text-slate-500"> of {maxUnits}</span> : null}
            </p>
            <p className="text-xs text-slate-500">AC units covered</p>
          </div>
          {atLimit ? (
            <p className="w-full text-sm text-slate-600">
              Your plan&apos;s unit limit is reached. Remove a unit or choose a plan that covers more
              units to register another.
            </p>
          ) : null}
        </Card>
      )}

      {units.length === 0 ? (
        <EmptyState
          icon={<SnowflakeIcon />}
          title="No AC units registered"
          description="Register your air conditioner so our technicians know what to expect and you can request service for it."
          action={registerButton ?? undefined}
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {units.map((unit) => (
            <li key={unit.id}>
              <Link href={`/dashboard/ac-units/${unit.id}`} className="block h-full rounded-xl">
                <Card className="hover-lift spotlight h-full p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-slate-900">
                        {unit.brand} {unit.model_number}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-500">{AC_TYPE_LABELS[unit.ac_type]}</p>
                    </div>
                    <ArrowRightIcon className="h-4.5 w-4.5 text-slate-400" />
                  </div>
                  <p className="mt-3 truncate text-sm text-slate-600">
                    {unit.address}, {unit.city}, {unit.state}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    {purchase && unit.purchase_id === purchase.id ? (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800 ring-1 ring-emerald-200">
                        Covered
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600 ring-1 ring-slate-200">
                        Not on current plan
                      </span>
                    )}
                    {unit.has_open_request ? (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-800 ring-1 ring-amber-200">
                        Service request open
                      </span>
                    ) : null}
                    <span className="rounded-full bg-slate-50 px-2.5 py-1 font-medium text-slate-600 ring-1 ring-slate-200">
                      {unit.photos.length} photo{unit.photos.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
