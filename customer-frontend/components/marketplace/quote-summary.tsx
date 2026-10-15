import type { ReactNode } from "react";

import { AlertIcon, InfoIcon } from "@/components/icons";
import { Spinner } from "@/components/ui";
import { EstimateBadge } from "@/components/marketplace/order-badges";
import {
  FREQUENCY_LABELS,
  formatDuration,
  formatPrice,
  isPositive,
} from "@/lib/marketplace-format";
import type { Quote } from "@/types/marketplace";

/** Server-calculated price breakdown: lines, subtotal, discount, tax/fees, total. */
export function QuoteSummary({
  quote,
  loading,
  error,
  showLines = true,
  children,
}: {
  quote: Quote | null;
  loading?: boolean;
  error?: string | null;
  showLines?: boolean;
  children?: ReactNode;
}) {
  if (error) {
    return <p className="text-sm text-rose-600">{error}</p>;
  }
  if (!quote) {
    return loading ? <Spinner label="Calculating price" /> : null;
  }
  const currency = quote.currency;

  return (
    <div className="space-y-4" aria-busy={loading}>
      {quote.problems.length > 0 ? (
        <div role="alert" className="space-y-1.5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {quote.problems.map((problem, index) => (
            <p key={index} className="flex gap-2">
              <AlertIcon className="mt-px h-4 w-4 text-rose-500" />
              {problem.message}
            </p>
          ))}
        </div>
      ) : null}

      {showLines && quote.lines.length > 0 ? (
        <ul className="divide-y divide-slate-100 text-sm">
          {quote.lines.map((line) => (
            <li key={line.service_id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                  {line.service_name}
                  {line.is_estimate ? <EstimateBadge /> : null}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {line.quantity} × {formatPrice(line.unit_price, currency)}
                  {line.unit_label ? ` per ${line.unit_label}` : ""} · {FREQUENCY_LABELS[line.frequency]}
                  {line.frequency !== "ONE_TIME" ? " (price per visit)" : ""}
                </p>
                {line.addons.length > 0 ? (
                  <p className="mt-0.5 text-xs text-slate-500">
                    Includes: {line.addons.map((addon) => `${addon.name} (+${formatPrice(addon.price, currency)})`).join(", ")}
                  </p>
                ) : null}
              </div>
              <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                {formatPrice(line.line_total, currency)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {children}

      <dl className="space-y-1.5 border-t border-slate-200 pt-3 text-sm">
        <Row label="Subtotal" value={formatPrice(quote.subtotal, currency)} />
        {isPositive(quote.discount_amount) ? (
          <Row
            label={`Discount${quote.discount_code ? ` (${quote.discount_code})` : ""}`}
            value={`−${formatPrice(quote.discount_amount, currency)}`}
            accent="text-emerald-700"
          />
        ) : null}
        {isPositive(quote.tax_amount) ? <Row label="Tax" value={formatPrice(quote.tax_amount, currency)} /> : null}
        {isPositive(quote.fee_amount) ? <Row label="Booking fee" value={formatPrice(quote.fee_amount, currency)} /> : null}
        <div className="flex items-baseline justify-between border-t border-slate-200 pt-2.5">
          <dt className="font-semibold text-slate-900">{quote.total_is_estimate ? "Estimated total" : "Total"}</dt>
          <dd className="text-xl font-bold tabular-nums text-slate-900">{formatPrice(quote.total, currency)}</dd>
        </div>
      </dl>

      {quote.total_duration_minutes > 0 ? (
        <p className="text-xs text-slate-500">Estimated time on site: {formatDuration(quote.total_duration_minutes)}</p>
      ) : null}
      {quote.total_is_estimate ? (
        <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900 ring-1 ring-amber-200">
          <InfoIcon className="h-4 w-4 text-amber-600" />
          Some prices are starting prices. The technician confirms the final price after inspecting your system,
          before any extra work is done.
        </p>
      ) : null}
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-600">{label}</dt>
      <dd className={`tabular-nums ${accent ?? "text-slate-900"}`}>{value}</dd>
    </div>
  );
}
