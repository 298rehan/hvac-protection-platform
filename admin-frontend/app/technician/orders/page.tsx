"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { TechnicianShell } from "@/components/admin-shell";
import { ChevronRightIcon, ClipboardIcon, MapPinIcon, PhoneIcon } from "@/components/icons";
import { OrderStatusBadge, requestedWindowText } from "@/components/order-ui";
import { Alert, Card, PageHeader, Skeleton } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { cx } from "@/lib/format";
import { formatVisit } from "@/lib/service-format";
import { fetchAssignedOrders } from "@/services/marketplaceService";
import type { OrderListItem } from "@/types";

interface Result {
  closed: boolean;
  orders: OrderListItem[];
  error: string | null;
}

export default function TechnicianOrdersPage() {
  return (
    <TechnicianShell>
      <TechnicianOrders />
    </TechnicianShell>
  );
}

/** Service orders booked with the signed-in technician. The API only returns their own. */
function TechnicianOrders() {
  const [closed, setClosed] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAssignedOrders(closed)
      .then((list) => {
        const orders = closed ? list.filter((o) => o.status === "COMPLETED" || o.status === "CANCELLED") : list;
        if (!cancelled) setResult({ closed, orders, error: null });
      })
      .catch((err) => {
        if (!cancelled) setResult({ closed, orders: [], error: errorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [closed]);

  const loading = result?.closed !== closed;
  const orders = result?.orders ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service orders"
        description="Booked service visits assigned to you. Open one to start and complete the visit."
      />

      <div role="radiogroup" aria-label="Show" className="inline-flex gap-1 rounded-lg bg-slate-200/60 p-1">
        {[
          { value: false, label: "Open" },
          { value: true, label: "History" },
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            role="radio"
            aria-checked={closed === option.value}
            onClick={() => setClosed(option.value)}
            className={cx(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              closed === option.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {result?.error && !loading ? <Alert>{result.error}</Alert> : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((key) => (
            <Card key={key} className="space-y-3 p-5">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-3/4" />
            </Card>
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <ClipboardIcon className="h-5 w-5" />
          </div>
          <p className="text-sm text-slate-500">{closed ? "No finished service orders yet." : "No service orders are booked with you right now."}</p>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/technician/orders/${order.id}`}
                className="block rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-brand-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Order #{order.id}</p>
                    <p className="mt-1 line-clamp-2 text-base font-semibold text-slate-900">{order.service_names.join(", ")}</p>
                  </div>
                  <OrderStatusBadge status={order.status} size="sm" />
                </div>
                <ul className="mt-4 space-y-1.5 text-sm text-slate-600">
                  {order.customer ? (
                    <li className="flex items-center gap-2">
                      <PhoneIcon className="h-4 w-4 text-slate-400" />
                      {order.customer.first_name} {order.customer.last_name}
                      {order.customer.phone ? ` · ${order.customer.phone}` : ""}
                    </li>
                  ) : null}
                  <li className="flex items-start gap-2">
                    <MapPinIcon className="mt-0.5 h-4 w-4 text-slate-400" />
                    {order.city}, {order.state}
                  </li>
                </ul>
                <p className="mt-3 rounded-md bg-teal-50 px-2.5 py-1.5 text-xs font-medium text-teal-900 ring-1 ring-teal-200">
                  {order.appointment
                    ? `Visit: ${formatVisit(order.appointment.start_at, order.appointment.end_at, order.appointment.timezone)}`
                    : `Requested: ${requestedWindowText(order)}`}
                </p>
                <p className="mt-4 flex justify-end text-xs">
                  <span className="inline-flex items-center gap-0.5 font-semibold text-brand-600">
                    Open order
                    <ChevronRightIcon className="h-4 w-4" />
                  </span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
