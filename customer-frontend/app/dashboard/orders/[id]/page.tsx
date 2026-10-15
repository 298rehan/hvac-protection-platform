"use client";

import { useParams } from "next/navigation";
import { useState } from "react";

import { Field, Input, Select, Textarea } from "@/components/form";
import { EstimateBadge, OrderStatusBadge, PaymentBadge } from "@/components/marketplace/order-badges";
import { Alert, BackLink, Button, Card, CardHeader, DetailRow, PageLoader } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import {
  CUSTOMER_EDITABLE,
  FREQUENCY_LABELS,
  WINDOW_LABELS,
  formatDuration,
  formatInZone,
  formatPlainDate,
  formatPrice,
  isPositive,
} from "@/lib/marketplace-format";
import { useFetch } from "@/lib/use-fetch";
import { cancelOrder, fetchOrder, rescheduleOrder } from "@/services/marketplaceService";
import type { OrderDetail, VisitWindow } from "@/types/marketplace";

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const loaded = useFetch(`order-${id}`, () => fetchOrder(Number(id)));
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const current = order ?? loaded.data;

  if (loaded.loading) return <PageLoader label="Loading order" />;
  if (loaded.error || !current) {
    return (
      <div className="space-y-6">
        <BackLink href="/dashboard/orders">All orders</BackLink>
        <Alert>{loaded.error ?? "Order not found."}</Alert>
      </div>
    );
  }
  return <OrderView order={current} onChange={setOrder} />;
}

function OrderView({ order, onChange }: { order: OrderDetail; onChange: (o: OrderDetail) => void }) {
  const editable = CUSTOMER_EDITABLE.includes(order.status);
  const money = (v: string) => formatPrice(v, order.currency);

  return (
    <div className="space-y-6">
      <div className="print:hidden"><BackLink href="/dashboard/orders">All orders</BackLink></div>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Order #{order.id}</h1>
          <p className="mt-1 text-sm text-slate-500">Placed {formatDateTime(order.created_at)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OrderStatusBadge status={order.status} />
          <PaymentBadge status={order.payment_status} />
          <Button variant="secondary" size="sm" className="print:hidden" onClick={() => window.print()}>Print receipt</Button>
        </div>
      </header>

      {order.status === "CANCELLED" && order.status_reason ? <Alert tone="info">Cancelled: {order.status_reason}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Services" description={`${order.items.length} item${order.items.length === 1 ? "" : "s"} · about ${formatDuration(order.total_duration_minutes)} on site`} />
            <ul className="divide-y divide-slate-100">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                      {item.service_name}
                      {item.is_estimate ? <EstimateBadge /> : null}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-600">
                      {item.quantity} × {money(item.unit_price)} · {FREQUENCY_LABELS[item.frequency]}
                      {item.frequency !== "ONE_TIME" ? " (per visit)" : ""}
                    </p>
                    {item.addons.length > 0 ? (
                      <p className="mt-0.5 text-xs text-slate-500">
                        Includes {item.addons.map((a) => `${a.name} (+${money(a.price)})`).join(", ")}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums text-slate-900">{money(item.line_total)}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-1.5 border-t border-slate-100 px-5 py-4 text-sm sm:px-6">
              <Line label="Subtotal" value={money(order.subtotal)} />
              {isPositive(order.discount_amount) ? <Line label={`Discount${order.discount_code ? ` (${order.discount_code})` : ""}`} value={`−${money(order.discount_amount)}`} /> : null}
              {isPositive(order.tax_amount) ? <Line label="Tax" value={money(order.tax_amount)} /> : null}
              {isPositive(order.fee_amount) ? <Line label="Booking fee" value={money(order.fee_amount)} /> : null}
              <div className="flex justify-between border-t border-slate-100 pt-2 text-base">
                <dt className="font-semibold text-slate-900">{order.total_is_estimate ? "Estimated total" : "Total"}</dt>
                <dd className="font-bold tabular-nums text-slate-900">{money(order.total)}</dd>
              </div>
            </dl>
            {order.total_is_estimate ? (
              <p className="border-t border-slate-100 px-5 py-3 text-xs text-amber-800 sm:px-6">
                Items marked “Estimate” have a starting price. The final price is confirmed after the technician inspects your system.
              </p>
            ) : null}
          </Card>

          {editable ? <ManageOrder order={order} onChange={onChange} /> : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Visit" />
            <dl className="px-5 sm:px-6">
              <DetailRow label="Requested">{formatPlainDate(order.requested_date)}<br />{WINDOW_LABELS[order.requested_window]}</DetailRow>
              <DetailRow label="Confirmed time">
                {order.appointment ? formatInZone(order.appointment.start_at, order.timezone) : "Not booked yet"}
              </DetailRow>
              <DetailRow label="Technician">
                {order.technician ? `${order.technician.first_name} ${order.technician.last_name}` : "Assigned when booked"}
              </DetailRow>
              <DetailRow label="Address">{order.address}, {order.city}, {order.state} {order.zip_code}</DetailRow>
            </dl>
          </Card>
          <Card>
            <CardHeader title="Payment" />
            <dl className="px-5 sm:px-6">
              <DetailRow label="Method">Pay on service</DetailRow>
              <DetailRow label="Status"><PaymentBadge status={order.payment_status} /></DetailRow>
              {order.paid_at ? <DetailRow label="Paid">{formatDateTime(order.paid_at)}</DetailRow> : null}
            </dl>
            <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500 sm:px-6">
              Nothing is charged online. You pay the technician after the visit.
            </p>
          </Card>
          {order.customer_notes ? (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-900">Your notes</h2>
              <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{order.customer_notes}</p>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ManageOrder({ order, onChange }: { order: OrderDetail; onChange: (o: OrderDetail) => void }) {
  const [date, setDate] = useState(order.requested_date);
  const [visitWindow, setVisitWindow] = useState<VisitWindow>(order.requested_window);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function reschedule() {
    setBusy(true);
    setMessage(null);
    try {
      onChange(await rescheduleOrder(order.id, date, visitWindow));
      setMessage({ tone: "success", text: "Your requested visit time was updated." });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!window.confirm("Cancel this order? Nothing has been charged.")) return;
    setBusy(true);
    setMessage(null);
    try {
      onChange(await cancelOrder(order.id, reason.trim() || null));
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 print:hidden">
      <h2 className="text-base font-semibold text-slate-900">Change or cancel</h2>
      <p className="mt-1 text-sm text-slate-500">You can change the requested time or cancel until a technician is booked.</p>
      {message ? <div className="mt-3"><Alert tone={message.tone}>{message.text}</Alert></div> : null}
      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="New date" htmlFor="new-date">
          <Input id="new-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Time window" htmlFor="new-window">
          <Select id="new-window" value={visitWindow} onChange={(e) => setVisitWindow(e.target.value as VisitWindow)}>
            {(Object.keys(WINDOW_LABELS) as VisitWindow[]).map((w) => <option key={w} value={w}>{WINDOW_LABELS[w]}</option>)}
          </Select>
        </Field>
        <Button variant="secondary" onClick={reschedule} disabled={busy}>Update time</Button>
      </div>
      <div className="mt-5 border-t border-slate-100 pt-4">
        <Field label="Reason for cancelling (optional)" htmlFor="cancel-reason">
          <Textarea id="cancel-reason" rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Button variant="danger" className="mt-3" onClick={cancel} disabled={busy}>Cancel order</Button>
      </div>
    </Card>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-600">{label}</dt>
      <dd className="tabular-nums text-slate-900">{value}</dd>
    </div>
  );
}
