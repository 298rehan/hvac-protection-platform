import type { ReactNode } from "react";

import { Card, CardHeader, DetailRow } from "@/components/ui";
import { cx } from "@/lib/format";
import {
  formatAmount,
  formatDuration,
  FREQUENCY_LABELS,
  ORDER_STATUS_DOTS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHOD_NOTE,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_STYLES,
} from "@/lib/order-format";
import { formatVisit, formatWindowDate, PREFERRED_WINDOW_LABELS } from "@/lib/service-format";
import type { OrderDetail, OrderListItem, OrderStatus, PaymentStatus } from "@/types";

/* Presentational pieces shared by the admin and technician order views. */

export function OrderStatusBadge({ status, size = "md" }: { status: OrderStatus; size?: "sm" | "md" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ring-1 ring-inset",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        ORDER_STATUS_STYLES[status],
      )}
    >
      <span aria-hidden className={cx("h-1.5 w-1.5 rounded-full", ORDER_STATUS_DOTS[status])} />
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}

export function PaymentStatusBadge({ status, size = "md" }: { status: PaymentStatus; size?: "sm" | "md" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center whitespace-nowrap rounded-full font-semibold ring-1 ring-inset",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        PAYMENT_STATUS_STYLES[status],
      )}
    >
      {PAYMENT_STATUS_LABELS[status]}
    </span>
  );
}

export function EstimateBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
      Estimate
    </span>
  );
}

export function requestedWindowText(order: Pick<OrderListItem, "requested_date" | "requested_window">): string {
  return `${formatWindowDate(order.requested_date)} · ${PREFERRED_WINDOW_LABELS[order.requested_window]}`;
}

/** Each purchased service on its own row, with options and its own price. */
export function OrderItemsCard({ order, footer }: { order: OrderDetail; footer?: ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Services"
        description={`${order.items.length} item${order.items.length === 1 ? "" : "s"} · about ${formatDuration(order.total_duration_minutes)} on site`}
      />
      <ul className="divide-y divide-slate-100">
        {order.items.map((item) => (
          <li key={item.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                {item.service_name}
                {item.is_estimate ? <EstimateBadge /> : null}
              </p>
              <p className="mt-0.5 text-sm text-slate-500">
                {FREQUENCY_LABELS[item.frequency]} · Qty {item.quantity} ·{" "}
                {formatAmount(item.unit_price, order.currency)} each · {formatDuration(item.duration_minutes)}
              </p>
              {item.addons.length > 0 ? (
                <p className="mt-1 text-xs text-slate-500">
                  Includes:{" "}
                  {item.addons.map((a) => `${a.name} (${formatAmount(a.price, order.currency)})`).join(", ")}
                </p>
              ) : null}
            </div>
            <p className="shrink-0 text-right font-semibold tabular-nums text-slate-900">
              {formatAmount(item.line_total, order.currency)}
            </p>
          </li>
        ))}
      </ul>
      {footer}
    </Card>
  );
}

export function PriceBreakdownCard({ order }: { order: OrderDetail }) {
  const money = (value: string) => formatAmount(value, order.currency);
  return (
    <Card>
      <CardHeader
        title="Price"
        description={order.total_is_estimate ? "Includes estimated prices that are confirmed after inspection." : "All prices confirmed."}
      />
      <dl className="px-5 py-2">
        <DetailRow label="Subtotal">{money(order.subtotal)}</DetailRow>
        {Number(order.discount_amount) > 0 ? (
          <DetailRow label={`Discount${order.discount_code ? ` (${order.discount_code})` : ""}`}>
            −{money(order.discount_amount)}
          </DetailRow>
        ) : null}
        {Number(order.tax_amount) > 0 ? <DetailRow label="Tax">{money(order.tax_amount)}</DetailRow> : null}
        {Number(order.fee_amount) > 0 ? <DetailRow label="Booking fee">{money(order.fee_amount)}</DetailRow> : null}
        <DetailRow label={order.total_is_estimate ? "Estimated total" : "Total"}>
          <span className="text-base font-bold">{money(order.total)}</span>
        </DetailRow>
      </dl>
      <div className="border-t border-slate-100 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-slate-700">{PAYMENT_METHOD_LABEL}</span>
          <PaymentStatusBadge status={order.payment_status} size="sm" />
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{PAYMENT_METHOD_NOTE}</p>
      </div>
    </Card>
  );
}

export function VisitCard({ order, children }: { order: OrderDetail; children?: ReactNode }) {
  const appointment = order.appointment;
  return (
    <Card>
      <CardHeader title="Visit" />
      <dl className="px-5 py-2">
        <DetailRow label="Address">
          <span className="block">{order.address}</span>
          <span className="block font-normal text-slate-500">
            {order.city}, {order.state} {order.zip_code}
          </span>
        </DetailRow>
        <DetailRow label="Requested">{requestedWindowText(order)}</DetailRow>
        <DetailRow label="Booked visit">
          {appointment ? formatVisit(appointment.start_at, appointment.end_at, appointment.timezone) : "Not booked yet"}
        </DetailRow>
        <DetailRow label="Technician">
          {order.technician ? `${order.technician.first_name} ${order.technician.last_name}` : "Not assigned"}
        </DetailRow>
      </dl>
      {order.customer_notes ? (
        <div className="border-t border-slate-100 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Customer notes</p>
          <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{order.customer_notes}</p>
        </div>
      ) : null}
      {children}
    </Card>
  );
}
