"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { TechnicianShell } from "@/components/admin-shell";
import { MailIcon, PhoneIcon } from "@/components/icons";
import { OrderItemsCard, OrderStatusBadge, PriceBreakdownCard, VisitCard } from "@/components/order-ui";
import { Modal } from "@/components/service-ui";
import { Alert, BackLink, Button, Card, CardHeader, PageHeader, PageLoader } from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api";
import { completeOrder, fetchOrder, startOrderVisit } from "@/services/marketplaceService";
import type { OrderDetail } from "@/types";

type Dialog = "start" | "complete" | null;

export default function TechnicianOrderPage() {
  return (
    <TechnicianShell>
      <TechnicianOrder />
    </TechnicianShell>
  );
}

function TechnicianOrder() {
  const params = useParams<{ id: string }>();
  const orderId = Number(params.id);
  const validId = Number.isInteger(orderId) && orderId > 0;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(validId);
  const [error, setError] = useState<string | null>(validId ? null : "Invalid order id.");
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);

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
      setNotice(success);
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && (err.status === 409 || err.status === 404)) void load().catch(() => undefined);
    } finally {
      setDialog(null);
      setBusy(false);
    }
  }

  if (loading) return <PageLoader label="Loading order" />;
  if (!order) return <Alert>{error ?? "Order not found."}</Alert>;

  return (
    <div className="space-y-6">
      <BackLink href="/technician/orders">Back to service orders</BackLink>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            Order #{order.id}
            <OrderStatusBadge status={order.status} />
          </span>
        }
        description={order.service_names.join(", ")}
        actions={
          <>
            {order.status === "SCHEDULED" ? <Button onClick={() => setDialog("start")}>Start visit</Button> : null}
            {order.status === "IN_PROGRESS" ? <Button onClick={() => setDialog("complete")}>Complete visit</Button> : null}
          </>
        }
      />

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}
      {order.items.some((item) => item.is_estimate) && order.status !== "CANCELLED" ? (
        <Alert tone="info">
          Some services have an estimated price. Tell the office the final price after your inspection so they can
          record it before payment is collected.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <VisitCard order={order} />
          <OrderItemsCard order={order} />
        </div>
        <div className="space-y-6">
          {order.customer ? (
            <Card>
              <CardHeader title="Customer" />
              <div className="space-y-2 px-5 py-4 text-sm text-slate-700">
                <p className="font-medium text-slate-900">
                  {order.customer.first_name} {order.customer.last_name}
                </p>
                {order.customer.phone ? (
                  <p className="flex items-center gap-2">
                    <PhoneIcon className="h-4 w-4 text-slate-400" />
                    <a href={`tel:${order.customer.phone}`} className="hover:text-brand-700">
                      {order.customer.phone}
                    </a>
                  </p>
                ) : null}
                <p className="flex items-center gap-2">
                  <MailIcon className="h-4 w-4 text-slate-400" />
                  {order.customer.email}
                </p>
              </div>
            </Card>
          ) : null}
          <PriceBreakdownCard order={order} />
        </div>
      </div>

      {dialog ? (
        <Modal
          title={dialog === "start" ? "Start this visit?" : "Complete this visit?"}
          description={
            dialog === "start"
              ? "The order moves to In progress so the customer and office can see you are on site."
              : "Confirm all listed services were carried out. The office records payment afterwards."
          }
          onClose={closeDialog}
        >
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeDialog}>
              Back
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                dialog === "start"
                  ? run(() => startOrderVisit(order.id), "Visit started.")
                  : run(() => completeOrder(order.id), "Visit completed.")
              }
            >
              {busy ? "Working..." : dialog === "start" ? "Start visit" : "Complete visit"}
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
