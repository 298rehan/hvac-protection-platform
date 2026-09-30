"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { Field, Textarea } from "@/components/form";
import { ArrowRightIcon, MailIcon, MapPinIcon, PhoneIcon } from "@/components/icons";
import {
  Alert,
  Avatar,
  BackLink,
  Button,
  Card,
  CardHeader,
  CheckIcon,
  DetailRow,
  PageHeader,
  PageLoader,
  StatusBadge,
} from "@/components/ui";
import { errorMessage } from "@/lib/api";
import {
  cycleLabel,
  cycleSuffix,
  formatDate,
  formatDateTime,
  formatMoney,
  STATUS_DESCRIPTIONS,
  STATUS_DOTS,
  STATUS_LABELS,
} from "@/lib/format";
import { fetchPurchase, updatePurchaseStatus } from "@/services/adminService";
import type { PurchaseDetail, PurchaseStatus } from "@/types";

export default function PurchaseDetailPage() {
  return (
    <AdminShell>
      <PurchaseDetailView />
    </AdminShell>
  );
}

function PurchaseDetailView() {
  const params = useParams<{ id: string }>();
  const purchaseId = Number(params.id);

  const [purchase, setPurchase] = useState<PurchaseDetail | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (Number.isNaN(purchaseId)) {
      setError("Invalid purchase id.");
      setLoading(false);
      return;
    }
    fetchPurchase(purchaseId)
      .then(setPurchase)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [purchaseId]);

  async function changeStatus(next: PurchaseStatus) {
    if (!purchase) return;

    if (next === "CANCELLED") {
      const confirmed = window.confirm(
        `Cancel enrollment #${purchase.id} for ${purchase.customer?.first_name ?? "this customer"}?`,
      );
      if (!confirmed) return;
    }

    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const updated = await updatePurchaseStatus(purchase.id, next, note);
      setPurchase(updated);
      setNote("");
      setNotice(
        next === "ACTIVE"
          ? "Enrollment approved. The plan is now active and the customer has been emailed."
          : `Enrollment status changed to ${next}.`,
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageLoader label="Loading purchase" />;

  if (error && !purchase) return <Alert>{error}</Alert>;
  if (!purchase) return null;

  const canApprove = purchase.status === "PENDING";
  const canCancel = purchase.status === "PENDING" || purchase.status === "ACTIVE";

  return (
    <div className="space-y-6">
      <BackLink href="/purchases">Back to purchases</BackLink>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            Enrollment #{purchase.id}
            <StatusBadge status={purchase.status} />
          </span>
        }
        description={
          <>
            <span className="font-medium text-slate-800">{purchase.plan.name}</span> &middot;{" "}
            {STATUS_DESCRIPTIONS[purchase.status]}
          </>
        }
      />

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Enrollment details" />
            <dl className="px-5 py-2">
              <DetailRow label="Plan">{purchase.plan.name}</DetailRow>
              <DetailRow label="Price">
                {formatMoney(purchase.price)}
                <span className="ml-1 font-normal text-slate-500">
                  {cycleSuffix(purchase.billing_cycle)}
                </span>
              </DetailRow>
              <DetailRow label="Billing">{cycleLabel(purchase.billing_cycle)}</DetailRow>
              <DetailRow label="Service region">{purchase.state_code}</DetailRow>
              <DetailRow label="Submitted">{formatDateTime(purchase.created_at)}</DetailRow>
              <DetailRow label="Activated">
                {formatDateTime(purchase.activated_at)}
              </DetailRow>
              <DetailRow label="Cancelled">
                {formatDateTime(purchase.cancelled_at)}
              </DetailRow>
              <DetailRow label="Expires">{formatDate(purchase.expires_at)}</DetailRow>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Status history" />
            <ol className="px-5 py-5">
              {purchase.status_history.map((entry, index) => {
                const last = index === purchase.status_history.length - 1;
                return (
                  <li key={entry.id} className="relative flex gap-4 pb-6 last:pb-0">
                    {!last ? (
                      <span
                        aria-hidden
                        className="absolute top-6 bottom-0 left-[11px] w-px bg-slate-200"
                      />
                    ) : null}
                    <span
                      aria-hidden
                      className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-slate-200"
                    >
                      <span className={`h-2 w-2 rounded-full ${STATUS_DOTS[entry.to_status]}`} />
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p className="text-sm font-medium text-slate-900">
                        {entry.from_status
                          ? `${STATUS_LABELS[entry.from_status]} to ${STATUS_LABELS[entry.to_status]}`
                          : `Created as ${STATUS_LABELS[entry.to_status]}`}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatDateTime(entry.created_at)}
                      </p>
                      {entry.note ? (
                        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-100">
                          {entry.note}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className={canApprove ? "ring-1 ring-amber-200" : undefined}>
            <CardHeader
              title="Actions"
              description="Approving sets the status to ACTIVE, records the coverage dates and emails the customer."
            />

            <div className="px-5 py-5">
              <Field label="Internal note (optional)" htmlFor="note">
                <Textarea
                  id="note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Reason for this change"
                  maxLength={500}
                />
              </Field>
              <p className="mt-1.5 text-right text-xs text-slate-400 tabular-nums">
                {note.length}/500
              </p>

              <div className="mt-3 flex flex-col gap-2">
                <Button
                  className="w-full"
                  disabled={!canApprove || saving}
                  onClick={() => changeStatus("ACTIVE")}
                >
                  <CheckIcon className="h-4 w-4" />
                  Approve and activate
                </Button>
                <Button
                  variant="danger-outline"
                  className="w-full"
                  disabled={!canCancel || saving}
                  onClick={() => changeStatus("CANCELLED")}
                >
                  Cancel enrollment
                </Button>
                {purchase.status === "ACTIVE" ? (
                  <Button
                    variant="subtle"
                    className="w-full"
                    disabled={saving}
                    onClick={() => changeStatus("EXPIRED")}
                  >
                    Mark as expired
                  </Button>
                ) : null}
              </div>

              {!canApprove && !canCancel ? (
                <p className="mt-4 rounded-lg bg-slate-100 px-3 py-2.5 text-sm text-slate-600">
                  A {purchase.status} enrollment is final and cannot be changed further.
                </p>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Customer" />
            <div className="px-5 py-5">
              {purchase.customer ? (
                <>
                  <div className="flex items-center gap-3">
                    <Avatar
                      firstName={purchase.customer.first_name}
                      lastName={purchase.customer.last_name}
                    />
                    <p className="font-semibold text-slate-900">
                      {purchase.customer.first_name} {purchase.customer.last_name}
                    </p>
                  </div>
                  <ul className="mt-4 space-y-2 text-sm text-slate-600">
                    <li className="flex items-center gap-2.5 break-all">
                      <MailIcon className="h-4 w-4 text-slate-400" />
                      {purchase.customer.email}
                    </li>
                    <li className="flex items-center gap-2.5">
                      <PhoneIcon className="h-4 w-4 text-slate-400" />
                      {purchase.customer.phone ?? "—"}
                    </li>
                    <li className="flex items-center gap-2.5">
                      <MapPinIcon className="h-4 w-4 text-slate-400" />
                      {purchase.customer.city ?? "—"}, {purchase.customer.state ?? "—"}
                    </li>
                  </ul>
                  <Link
                    href={`/customers/${purchase.customer.id}`}
                    className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700"
                  >
                    Open customer record
                    <ArrowRightIcon className="h-4 w-4" />
                  </Link>
                </>
              ) : (
                <p className="text-sm text-slate-500">Customer record unavailable.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
