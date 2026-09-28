"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { Field, Textarea } from "@/components/form";
import {
  Alert,
  Button,
  Card,
  CheckIcon,
  DetailRow,
  Spinner,
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

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner label="Loading purchase" />
      </div>
    );
  }

  if (error && !purchase) return <Alert>{error}</Alert>;
  if (!purchase) return null;

  const canApprove = purchase.status === "PENDING";
  const canCancel = purchase.status === "PENDING" || purchase.status === "ACTIVE";

  return (
    <div className="space-y-6">
      <Link
        href="/purchases"
        className="text-sm font-medium text-brand-600 hover:text-brand-700"
      >
        &larr; Back to purchases
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Enrollment #{purchase.id}
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            {purchase.plan.name} &middot; {STATUS_DESCRIPTIONS[purchase.status]}
          </p>
        </div>
        <StatusBadge status={purchase.status} />
      </header>

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <h2 className="text-base font-semibold text-slate-900">Enrollment details</h2>
          <dl className="mt-4">
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

          <h3 className="mt-8 text-base font-semibold text-slate-900">Status history</h3>
          <ol className="mt-4 space-y-4">
            {purchase.status_history.map((entry) => (
              <li key={entry.id} className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {entry.from_status
                      ? `${entry.from_status} to ${entry.to_status}`
                      : `Created as ${entry.to_status}`}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(entry.created_at)}
                  </p>
                  {entry.note ? (
                    <p className="mt-1 text-sm text-slate-600">{entry.note}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-base font-semibold text-slate-900">Customer</h2>
            {purchase.customer ? (
              <>
                <p className="mt-3 font-medium text-slate-900">
                  {purchase.customer.first_name} {purchase.customer.last_name}
                </p>
                <p className="text-sm text-slate-600">{purchase.customer.email}</p>
                <p className="text-sm text-slate-600">{purchase.customer.phone ?? "-"}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {purchase.customer.city ?? "-"}, {purchase.customer.state ?? "-"}
                </p>
                <Link
                  href={`/customers/${purchase.customer.id}`}
                  className="mt-4 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700"
                >
                  Open customer record
                </Link>
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Customer record unavailable.</p>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="text-base font-semibold text-slate-900">Actions</h2>
            <p className="mt-1.5 text-sm text-slate-600">
              Approving sets the status to ACTIVE, records the coverage dates and emails
              the customer.
            </p>

            <div className="mt-4">
              <Field label="Internal note (optional)" htmlFor="note">
                <Textarea
                  id="note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Reason for this change"
                  maxLength={500}
                />
              </Field>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <Button
                className="w-full"
                disabled={!canApprove || saving}
                onClick={() => changeStatus("ACTIVE")}
              >
                <CheckIcon className="h-4 w-4" />
                Approve and activate
              </Button>
              <Button
                variant="danger"
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
              <p className="mt-4 rounded-md bg-slate-100 px-3 py-2.5 text-sm text-slate-600">
                A {purchase.status} enrollment is final and cannot be changed further.
              </p>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
