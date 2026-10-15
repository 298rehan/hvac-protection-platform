"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { Field, MoneyInput, Textarea } from "@/components/form";
import { MailIcon, PhoneIcon } from "@/components/icons";
import { OrderBookingPanel } from "@/components/order-booking-panel";
import {
  OrderItemsCard,
  OrderStatusBadge,
  PaymentStatusBadge,
  PriceBreakdownCard,
  VisitCard,
} from "@/components/order-ui";
import { Modal } from "@/components/service-ui";
import { Alert, Avatar, BackLink, Button, Card, CardHeader, DetailRow, PageHeader, PageLoader } from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { formatAmount, normaliseMoney } from "@/lib/order-format";
import {
  cancelOrder,
  completeOrder,
  confirmOrder,
  fetchOrder,
  markOrderPaid,
  setFinalPrices,
} from "@/services/marketplaceService";
import type { OrderDetail } from "@/types";

type Dialog = "confirm" | "complete" | "paid" | "cancel" | "prices" | null;

export default function OrderDetailPage() {
  return (
    <AdminShell>
      <OrderDetailView />
    </AdminShell>
  );
}

function OrderDetailView() {
  const params = useParams<{ id: string }>();
  const orderId = Number(params.id);
  const validId = Number.isInteger(orderId) && orderId > 0;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(validId);
  const [error, setError] = useState<string | null>(validId ? null : "Invalid order id.");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [note, setNote] = useState("");
  const [prices, setPrices] = useState<Record<number, string>>({});

  const load = useCallback(() => fetchOrder(orderId).then(setOrder), [orderId]);

  useEffect(() => {
    if (!validId) return;
    load()
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [validId, load]);

  const closeDialog = useCallback(() => setDialog(null), []);

  async function run(action: () => Promise<OrderDetail>, success: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setOrder(await action());
      setDialog(null);
      setNotice(success);
    } catch (err) {
      setError(errorMessage(err));
      // Someone else changed the order first: show its current state.
      if (err instanceof ApiError && (err.status === 409 || err.status === 404)) {
        setDialog(null);
        void load().catch(() => undefined);
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <PageLoader label="Loading order" />;
  if (!order) return <Alert>{error ?? "Order not found."}</Alert>;

  const status = order.status;
  const estimates = order.items.filter((item) => item.is_estimate);
  const canPrice = estimates.length > 0 && status !== "CANCELLED" && order.payment_status === "PENDING";
  const canPay = status === "COMPLETED" && order.payment_status === "PENDING";

  function openPrices() {
    setPrices(Object.fromEntries(estimates.map((item) => [item.id, ""])));
    setDialog("prices");
  }

  function submitPrices() {
    const entries: { item_id: number; unit_price: string }[] = [];
    for (const item of estimates) {
      const value = normaliseMoney(prices[item.id] ?? "");
      if (value === null) {
        setError(`Enter a valid final price for ${item.service_name}.`);
        return;
      }
      entries.push({ item_id: item.id, unit_price: value });
    }
    void run(() => setFinalPrices(order!.id, entries), "Final prices recorded and the total recalculated.");
  }

  return (
    <div className="space-y-6">
      <BackLink href="/orders">Back to orders</BackLink>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            Order #{order.id}
            <OrderStatusBadge status={status} />
            <PaymentStatusBadge status={order.payment_status} />
          </span>
        }
        description={`Placed ${formatDateTime(order.created_at)}${order.custom_plan_id ? " from a saved custom plan" : ""}.`}
        actions={
          <>
            {status === "PENDING_CONFIRMATION" ? <Button onClick={() => setDialog("confirm")}>Confirm order</Button> : null}
            {status === "IN_PROGRESS" ? <Button onClick={() => setDialog("complete")}>Mark completed</Button> : null}
            {canPay ? (
              <Button onClick={() => setDialog("paid")} disabled={order.total_is_estimate}>
                Mark paid
              </Button>
            ) : null}
            {status !== "COMPLETED" && status !== "CANCELLED" ? (
              <Button variant="danger-outline" onClick={() => {
                setNote("");
                setDialog("cancel");
              }}>
                Cancel order
              </Button>
            ) : null}
          </>
        }
      />

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}
      {canPay && order.total_is_estimate ? (
        <Alert tone="info">Record the final prices for the estimated services before marking this order as paid.</Alert>
      ) : null}
      {order.status_reason ? <Alert tone="info">Reason: {order.status_reason}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          {status === "CONFIRMED" || status === "SCHEDULED" ? (
            <OrderBookingPanel
              key={`${order.id}-${order.appointment?.id ?? "none"}`}
              order={order}
              onBooked={(updated) => {
                setOrder(updated);
                setError(null);
                setNotice("Visit booked. The technician can now see this order.");
              }}
              onConflict={() => void load().catch(() => undefined)}
            />
          ) : null}
          {status === "PENDING_CONFIRMATION" ? (
            <Alert tone="info">Confirm the order to book a technician.</Alert>
          ) : null}

          <OrderItemsCard
            order={order}
            footer={
              canPrice ? (
                <div className="flex flex-col gap-3 border-t border-slate-100 bg-amber-50/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-amber-900">
                    {estimates.length} service{estimates.length === 1 ? " has" : "s have"} an estimated price. Record the
                    final price after inspection.
                  </p>
                  <Button size="sm" variant="secondary" onClick={openPrices}>
                    Record final prices
                  </Button>
                </div>
              ) : undefined
            }
          />
          <VisitCard order={order} />
        </div>

        <div className="space-y-6">
          <PriceBreakdownCard order={order} />
          {order.customer ? (
            <Card>
              <CardHeader title="Customer" />
              <div className="space-y-3 px-5 py-4">
                <div className="flex items-center gap-3">
                  <Avatar firstName={order.customer.first_name} lastName={order.customer.last_name} />
                  <Link href={`/customers/${order.customer.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                    {order.customer.first_name} {order.customer.last_name}
                  </Link>
                </div>
                <p className="flex items-center gap-2 text-sm text-slate-600">
                  <MailIcon className="h-4 w-4 text-slate-400" />
                  <a href={`mailto:${order.customer.email}`} className="hover:text-brand-700">
                    {order.customer.email}
                  </a>
                </p>
                {order.customer.phone ? (
                  <p className="flex items-center gap-2 text-sm text-slate-600">
                    <PhoneIcon className="h-4 w-4 text-slate-400" />
                    {order.customer.phone}
                  </p>
                ) : null}
              </div>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Timeline" />
            <dl className="px-5 py-2">
              <DetailRow label="Placed">{formatDateTime(order.created_at)}</DetailRow>
              <DetailRow label="Confirmed">{formatDateTime(order.confirmed_at)}</DetailRow>
              <DetailRow label="Completed">{formatDateTime(order.completed_at)}</DetailRow>
              <DetailRow label="Paid">{formatDateTime(order.paid_at)}</DetailRow>
              {order.cancelled_at ? <DetailRow label="Cancelled">{formatDateTime(order.cancelled_at)}</DetailRow> : null}
            </dl>
          </Card>
        </div>
      </div>

      {dialog === "confirm" ? (
        <Modal title="Confirm this order?" description="The customer's request is accepted. You can then book a technician." onClose={closeDialog}>
          <DialogButtons busy={busy} onCancel={closeDialog} onConfirm={() => run(() => confirmOrder(order.id), "Order confirmed.")} label="Confirm order" />
        </Modal>
      ) : null}
      {dialog === "complete" ? (
        <Modal title="Mark as completed?" description="Use this when the technician finished but could not update the order themselves." onClose={closeDialog}>
          <DialogButtons busy={busy} onCancel={closeDialog} onConfirm={() => run(() => completeOrder(order.id), "Order marked completed.")} label="Mark completed" />
        </Modal>
      ) : null}
      {dialog === "paid" ? (
        <Modal
          title="Record payment received?"
          description={`Only do this once ${formatAmount(order.total, order.currency)} has actually been collected. Nothing is charged online.`}
          onClose={closeDialog}
        >
          <DialogButtons busy={busy} onCancel={closeDialog} onConfirm={() => run(() => markOrderPaid(order.id), "Payment recorded.")} label="Mark paid" />
        </Modal>
      ) : null}
      {dialog === "cancel" ? (
        <Modal title="Cancel this order?" description="Any booked visit is cancelled and the payment status becomes void." onClose={closeDialog}>
          <Field label="Reason (shown to the customer)" htmlFor="cancel-note">
            <Textarea id="cancel-note" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <DialogButtons
            busy={busy}
            danger
            onCancel={closeDialog}
            onConfirm={() => run(() => cancelOrder(order.id, note.trim()), "Order cancelled.")}
            label="Cancel order"
          />
        </Modal>
      ) : null}
      {dialog === "prices" ? (
        <Modal title="Record final prices" description="Enter the confirmed price per unit, excluding add-ons (they are added automatically)." onClose={closeDialog}>
          <div className="space-y-4">
            {estimates.map((item) => (
              <Field
                key={item.id}
                label={`${item.service_name} (qty ${item.quantity})`}
                htmlFor={`price-${item.id}`}
                hint={`Estimate was ${formatAmount(item.unit_price, order.currency)} per unit including add-ons.`}
              >
                <MoneyInput
                  id={`price-${item.id}`}
                  inputMode="decimal"
                  value={prices[item.id] ?? ""}
                  onChange={(e) => setPrices({ ...prices, [item.id]: e.target.value })}
                />
              </Field>
            ))}
          </div>
          <DialogButtons busy={busy} onCancel={closeDialog} onConfirm={submitPrices} label="Save final prices" />
        </Modal>
      ) : null}
    </div>
  );
}

function DialogButtons({
  busy,
  onCancel,
  onConfirm,
  label,
  danger,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <Button variant="secondary" onClick={onCancel}>
        Back
      </Button>
      <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
        {busy ? "Working..." : label}
      </Button>
    </div>
  );
}
