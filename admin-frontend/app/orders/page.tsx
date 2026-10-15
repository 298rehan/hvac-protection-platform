"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { TableCard, TableEmpty, TableSkeleton, TBody, Td, Th, THead, Tr } from "@/components/data-table";
import { SearchInput, Select } from "@/components/form";
import { ChevronRightIcon, ClipboardIcon } from "@/components/icons";
import { EstimateBadge, OrderStatusBadge, PaymentStatusBadge, requestedWindowText } from "@/components/order-ui";
import { Alert, Button, PageHeader } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { cx } from "@/lib/format";
import {
  formatAmount,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUSES,
} from "@/lib/order-format";
import { formatVisit } from "@/lib/service-format";
import { fetchOrders } from "@/services/marketplaceService";
import type { OrderListItem, OrderStatus, PaymentStatus } from "@/types";

const QUICK: { value: OrderStatus | ""; label: string }[] = [
  { value: "PENDING_CONFIRMATION", label: "New" },
  { value: "CONFIRMED", label: "Needs technician" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "", label: "All" },
];

const PAGE_SIZE = 50;

export default function OrdersPage() {
  return (
    <AdminShell>
      <OrdersList />
    </AdminShell>
  );
}

function OrdersList() {
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [status, setStatus] = useState<OrderStatus | "">("PENDING_CONFIRMATION");
  const [payment, setPayment] = useState<PaymentStatus | "">("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      fetchOrders({ status, paymentStatus: payment, search: search.trim() || undefined, limit: PAGE_SIZE, offset })
        .then(setOrders)
        .catch((err) => setError(errorMessage(err)))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [status, payment, search, offset]);

  function changeStatus(value: OrderStatus | "") {
    setStatus(value);
    setOffset(0);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service orders"
        description="Individual services and custom plans customers have booked. Confirm new orders, book a technician, record final prices for estimated work and record payment once it is collected."
      />

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div role="radiogroup" aria-label="Quick status filter" className="-mx-4 flex overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className="inline-flex gap-1 rounded-lg bg-slate-200/60 p-1">
              {QUICK.map((option) => (
                <button
                  key={option.value || "ALL"}
                  type="button"
                  role="radio"
                  aria-checked={status === option.value}
                  onClick={() => changeStatus(option.value)}
                  className={cx(
                    "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    status === option.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <Select
            aria-label="Filter by order status"
            value={status}
            onChange={(e) => changeStatus(e.target.value as OrderStatus | "")}
            className="sm:w-52"
          >
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {ORDER_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filter by payment status"
            value={payment}
            onChange={(e) => {
              setPayment(e.target.value as PaymentStatus | "");
              setOffset(0);
            }}
            className="sm:w-48"
          >
            <option value="">Any payment</option>
            {PAYMENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {PAYMENT_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
        <SearchInput
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
          placeholder="Search customer name or email"
          aria-label="Search orders"
          className="w-full xl:w-72"
        />
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {loading ? (
        <TableSkeleton columns={8} />
      ) : (
        <TableCard
          footer={
            orders.length > 0 || offset > 0 ? (
              <div className="flex items-center justify-between gap-3">
                <span>
                  Showing {orders.length === 0 ? 0 : offset + 1}–{offset + orders.length}
                </span>
                <span className="flex gap-2">
                  <Button size="sm" variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                    Previous
                  </Button>
                  <Button size="sm" variant="secondary" disabled={orders.length < PAGE_SIZE} onClick={() => setOffset(offset + PAGE_SIZE)}>
                    Next
                  </Button>
                </span>
              </div>
            ) : undefined
          }
        >
          <THead>
            <Th>#</Th>
            <Th>Customer</Th>
            <Th>Services</Th>
            <Th>Requested</Th>
            <Th>Booked visit</Th>
            <Th>Total</Th>
            <Th>Status</Th>
            <Th>Payment</Th>
            <Th>
              <span className="sr-only">Open</span>
            </Th>
          </THead>
          <TBody>
            {orders.length === 0 ? (
              <TableEmpty colSpan={9} message="No orders match these filters." icon={<ClipboardIcon className="h-5 w-5" />} />
            ) : (
              orders.map((order) => (
                <Tr key={order.id}>
                  <Td className="font-semibold text-slate-900">
                    <Link href={`/orders/${order.id}`} className="hover:text-brand-700">
                      #{order.id}
                    </Link>
                  </Td>
                  <Td>
                    {order.customer ? (
                      <>
                        <span className="block font-medium text-slate-900">
                          {order.customer.first_name} {order.customer.last_name}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {order.city}, {order.state}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className="max-w-56 whitespace-normal">
                    <span className="line-clamp-2 text-sm">{order.service_names.join(", ")}</span>
                  </Td>
                  <Td className="text-xs">{requestedWindowText(order)}</Td>
                  <Td className="text-xs">
                    {order.appointment ? formatVisit(order.appointment.start_at, order.appointment.end_at, order.appointment.timezone) : "—"}
                  </Td>
                  <Td className="tabular-nums">
                    <span className="flex items-center gap-1.5">
                      {formatAmount(order.total, order.currency)}
                      {order.total_is_estimate ? <EstimateBadge /> : null}
                    </span>
                  </Td>
                  <Td>
                    <OrderStatusBadge status={order.status} size="sm" />
                  </Td>
                  <Td>
                    <PaymentStatusBadge status={order.payment_status} size="sm" />
                  </Td>
                  <Td className="text-right">
                    <Link href={`/orders/${order.id}`} aria-label={`Open order ${order.id}`} className="inline-flex text-slate-400 hover:text-brand-700">
                      <ChevronRightIcon className="h-5 w-5" />
                    </Link>
                  </Td>
                </Tr>
              ))
            )}
          </TBody>
        </TableCard>
      )}
    </div>
  );
}
