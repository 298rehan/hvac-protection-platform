import { cx } from "@/lib/format";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_STYLES,
} from "@/lib/marketplace-format";
import type { OrderStatus, PaymentStatus } from "@/types/marketplace";

const BADGE = "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset";

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <span className={cx(BADGE, ORDER_STATUS_STYLES[status])}>{ORDER_STATUS_LABELS[status]}</span>;
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return (
    <span className={cx(BADGE, PAYMENT_STATUS_STYLES[status])}>
      <span className="sr-only">Payment: </span>
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
