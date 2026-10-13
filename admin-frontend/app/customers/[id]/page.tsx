"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { TableCard, TableEmpty, TBody, Td, Th, THead, Tr } from "@/components/data-table";
import {
  ArrowRightIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  ReceiptIcon,
  ShieldIcon,
  WrenchIcon,
} from "@/components/icons";
import {
  Alert,
  Avatar,
  BackLink,
  Card,
  CardHeader,
  DetailRow,
  PageLoader,
  RegionTag,
  StatusBadge,
  TogglePill,
} from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { cycleLabel, cycleSuffix, formatDate, formatMoney } from "@/lib/format";
import {
  fetchCustomer,
  fetchCustomerCurrentPlan,
  fetchCustomerPurchases,
} from "@/services/adminService";
import { AC_TYPE_LABELS, CONDITION_LABELS } from "@/lib/service-format";
import { fetchCustomerAcUnits } from "@/services/serviceRequestService";
import type { AcUnit, Purchase, User } from "@/types";

export default function CustomerDetailPage() {
  return (
    <AdminShell>
      <CustomerDetail />
    </AdminShell>
  );
}

function CustomerDetail() {
  const params = useParams<{ id: string }>();
  const customerId = Number(params.id);

  const [customer, setCustomer] = useState<User | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [currentPlan, setCurrentPlan] = useState<Purchase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Number.isNaN(customerId)) {
      setError("Invalid customer id.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    Promise.all([
      fetchCustomer(customerId),
      fetchCustomerPurchases(customerId),
      fetchCustomerCurrentPlan(customerId),
    ])
      .then(([customerResult, purchaseResult, planResult]) => {
        if (cancelled) return;
        setCustomer(customerResult);
        setPurchases(purchaseResult);
        setCurrentPlan(planResult);
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
  }, [customerId]);

  if (loading) return <PageLoader label="Loading customer" />;

  if (error) return <Alert>{error}</Alert>;
  if (!customer) return null;

  const location = [customer.city, customer.state].filter(Boolean).join(", ");

  return (
    <div className="space-y-6">
      <BackLink href="/customers">Back to customers</BackLink>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar firstName={customer.first_name} lastName={customer.last_name} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {customer.first_name} {customer.last_name}
              </h1>
              <TogglePill on={customer.is_active} onLabel="Active" offLabel="Deactivated" />
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Customer #{customer.id} &middot; registered {formatDate(customer.created_at)}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <MailIcon className="h-4 w-4 text-slate-400" />
                {customer.email}
              </span>
              {customer.phone ? (
                <span className="inline-flex items-center gap-1.5">
                  <PhoneIcon className="h-4 w-4 text-slate-400" />
                  {customer.phone}
                </span>
              ) : null}
              {location ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPinIcon className="h-4 w-4 text-slate-400" />
                  {location}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Account details" />
          <dl className="px-5 py-2">
            <DetailRow label="Email">{customer.email}</DetailRow>
            <DetailRow label="Phone">{customer.phone ?? "—"}</DetailRow>
            <DetailRow label="Address">{customer.address ?? "—"}</DetailRow>
            <DetailRow label="City">{customer.city ?? "—"}</DetailRow>
            <DetailRow label="Service region">{customer.state ?? "—"}</DetailRow>
            <DetailRow label="ZIP code">{customer.zip_code ?? "—"}</DetailRow>
            <DetailRow label="Role">{customer.role}</DetailRow>
            <DetailRow label="Account status">
              {customer.is_active ? "Active" : "Deactivated"}
            </DetailRow>
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Current plan"
            action={
              currentPlan ? (
                <Link
                  href={`/purchases/${currentPlan.id}`}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700"
                >
                  Open enrollment #{currentPlan.id}
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>
              ) : null
            }
          />
          {currentPlan ? (
            <div className="px-5 py-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                    <ShieldIcon />
                  </span>
                  <p className="text-lg font-bold text-slate-900">{currentPlan.plan.name}</p>
                </div>
                <StatusBadge status={currentPlan.status} />
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 rounded-lg bg-slate-50/80 p-4 ring-1 ring-slate-100 sm:grid-cols-3">
                <Fact label="Price">
                  {formatMoney(currentPlan.price)}
                  <span className="font-normal text-slate-500">
                    {cycleSuffix(currentPlan.billing_cycle)}
                  </span>
                </Fact>
                <Fact label="Billing">{cycleLabel(currentPlan.billing_cycle)}</Fact>
                <Fact label="Region">{currentPlan.state_code}</Fact>
                <Fact label="Activated">{formatDate(currentPlan.activated_at)}</Fact>
                <Fact label="Expires">{formatDate(currentPlan.expires_at)}</Fact>
              </dl>
            </div>
          ) : (
            <div className="px-5 py-10 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <ShieldIcon className="h-5 w-5" />
              </div>
              <p className="text-sm text-slate-500">This customer does not have an active plan.</p>
            </div>
          )}
        </Card>
      </div>

      <TableCard
        header={
          <CardHeader
            title="Purchase history"
            description={`${purchases.length} enrollment${purchases.length === 1 ? "" : "s"}`}
          />
        }
      >
        <THead>
          <Th>Ref</Th>
          <Th>Plan</Th>
          <Th className="text-right">Price</Th>
          <Th>Region</Th>
          <Th>Submitted</Th>
          <Th>Expires</Th>
          <Th>Status</Th>
        </THead>
        <TBody>
          {purchases.length === 0 ? (
            <TableEmpty
              colSpan={7}
              message="This customer has no purchases."
              icon={<ReceiptIcon className="h-5 w-5" />}
            />
          ) : (
            purchases.map((purchase) => (
              <Tr key={purchase.id}>
                <Td>
                  <Link
                    href={`/purchases/${purchase.id}`}
                    className="font-semibold text-brand-600 hover:text-brand-700"
                  >
                    #{purchase.id}
                  </Link>
                </Td>
                <Td className="font-medium text-slate-900">{purchase.plan.name}</Td>
                <Td className="text-right tabular-nums">
                  {formatMoney(purchase.price)}
                  <span className="text-slate-500">{cycleSuffix(purchase.billing_cycle)}</span>
                </Td>
                <Td>
                  <RegionTag code={purchase.state_code} />
                </Td>
                <Td className="text-slate-500">{formatDate(purchase.created_at)}</Td>
                <Td className="text-slate-500">{formatDate(purchase.expires_at)}</Td>
                <Td>
                  <StatusBadge status={purchase.status} size="sm" />
                </Td>
              </Tr>
            ))
          )}
        </TBody>
      </TableCard>

      <CustomerAcUnits customerId={customerId} />
    </div>
  );
}

/** The customer's registered AC units (read-only for admins). */
function CustomerAcUnits({ customerId }: { customerId: number }) {
  const [units, setUnits] = useState<AcUnit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCustomerAcUnits(customerId)
      .then(setUnits)
      .catch((err) => setError(errorMessage(err)));
  }, [customerId]);

  return (
    <TableCard
      header={
        <CardHeader
          title="AC units"
          description={units ? `${units.length} registered unit${units.length === 1 ? "" : "s"}` : undefined}
        />
      }
    >
      <THead>
        <Th>Unit</Th>
        <Th>Type</Th>
        <Th>Serial</Th>
        <Th>Location</Th>
        <Th>Condition</Th>
        <Th>Plan</Th>
        <Th className="text-right">Photos</Th>
      </THead>
      <TBody>
        {error ? (
          <TableEmpty colSpan={7} message={error} />
        ) : units === null ? (
          <TableEmpty colSpan={7} message="Loading AC units…" />
        ) : units.length === 0 ? (
          <TableEmpty colSpan={7} message="No AC units registered." icon={<WrenchIcon className="h-5 w-5" />} />
        ) : (
          units.map((unit) => (
            <Tr key={unit.id}>
              <Td className="font-medium text-slate-900">
                {unit.brand} {unit.model_number}
                {unit.has_open_request ? (
                  <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
                    Open request
                  </span>
                ) : null}
              </Td>
              <Td>{AC_TYPE_LABELS[unit.ac_type]}</Td>
              <Td className="text-slate-500">{unit.serial_number ?? "—"}</Td>
              <Td className="text-slate-500">
                {unit.city}, {unit.state}
              </Td>
              <Td>{CONDITION_LABELS[unit.reported_condition]}</Td>
              <Td>{unit.plan_name ?? "—"}</Td>
              <Td className="text-right tabular-nums">{unit.photos.length}</Td>
            </Tr>
          ))
        )}
      </TBody>
    </TableCard>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold text-slate-900 tabular-nums">{children}</dd>
    </div>
  );
}
