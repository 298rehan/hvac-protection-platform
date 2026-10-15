"use client";

import Link from "next/link";

import { ReceiptIcon } from "@/components/icons";
import { OrderStatusBadge, PaymentBadge } from "@/components/marketplace/order-badges";
import { Alert, ButtonLink, Card, EmptyState, PageHeader, PageLoader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { WINDOW_SHORT, formatInZone, formatPlainDate, formatPrice } from "@/lib/marketplace-format";
import { useFetch } from "@/lib/use-fetch";
import { fetchMyOrders } from "@/services/marketplaceService";

export default function OrdersPage() {
  const orders = useFetch("my-orders", fetchMyOrders);
  const list = orders.data ?? [];
  const upcoming = list.filter((o) => o.appointment && o.status === "SCHEDULED");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Service orders"
        description="Every service you have booked, with its status and payment."
        actions={<ButtonLink href="/services">Book a service</ButtonLink>}
      />
      {orders.loading ? <PageLoader label="Loading orders" /> : null}
      {orders.error ? <Alert>{orders.error}</Alert> : null}

      {upcoming.length > 0 ? (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900">Upcoming appointments</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {upcoming.map((o) => (
              <li key={o.id} className="flex flex-wrap justify-between gap-2">
                <Link href={`/dashboard/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">
                  Order #{o.id} · {o.service_names.slice(0, 2).join(", ")}{o.service_names.length > 2 ? "…" : ""}
                </Link>
                <span className="text-slate-600">
                  {formatInZone(o.appointment!.start_at, o.timezone)}
                  {o.technician ? ` · ${o.technician.first_name} ${o.technician.last_name}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {!orders.loading && list.length === 0 && !orders.error ? (
        <EmptyState
          icon={<ReceiptIcon />}
          title="No orders yet"
          description="Book a single service, a few from your cart, or a custom plan."
          action={<ButtonLink href="/services">Browse services</ButtonLink>}
        />
      ) : null}

      {list.length > 0 ? (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {list.map((order) => (
              <li key={order.id}>
                <Link href={`/dashboard/orders/${order.id}`} className="flex flex-col gap-3 px-5 py-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">Order #{order.id}</p>
                    <p className="truncate text-sm text-slate-600">{order.service_names.join(", ")}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Placed {formatDate(order.created_at)} ·{" "}
                      {order.appointment
                        ? `Visit ${formatInZone(order.appointment.start_at, order.timezone)}`
                        : `Requested ${formatPlainDate(order.requested_date)}, ${WINDOW_SHORT[order.requested_window].toLowerCase()}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <OrderStatusBadge status={order.status} />
                    <PaymentBadge status={order.payment_status} />
                    <span className="ml-1 font-semibold tabular-nums text-slate-900">
                      {formatPrice(order.total, order.currency)}
                      {order.total_is_estimate ? <span className="ml-1 text-xs font-normal text-amber-700">est.</span> : null}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
