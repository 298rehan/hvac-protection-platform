import type { ReactNode } from "react";

import { Card } from "@/components/ui";
import { cx } from "@/lib/format";

/** Small table primitives shared by the admin list pages. */

export function TableCard({
  children,
  header,
  footer,
}: {
  children: ReactNode;
  /** Optional title / toolbar row rendered above the table. */
  header?: ReactNode;
  /** Optional row rendered below the table, e.g. a result count. */
  footer?: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      {header}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">{children}</table>
      </div>
      {footer ? (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-xs text-slate-500">
          {footer}
        </div>
      ) : null}
    </Card>
  );
}

/** Header row container with consistent styling. */
export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-slate-200 bg-slate-50/80">
      <tr>{children}</tr>
    </thead>
  );
}

/** Body container with row dividers. */
export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>;
}

/** Table row with hover highlight. */
export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cx("transition-colors hover:bg-slate-50/80", className)}>{children}</tr>;
}

export function Th({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cx(
        "whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 first:pl-5 last:pr-5",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <td
      className={cx(
        "whitespace-nowrap px-4 py-3.5 align-middle text-slate-700 first:pl-5 last:pr-5",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function TableEmpty({
  colSpan,
  message,
  icon,
  action,
}: {
  colSpan: number;
  message: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-14 text-center">
        {icon ? (
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            {icon}
          </div>
        ) : null}
        <p className="text-sm text-slate-500">{message}</p>
        {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
      </td>
    </tr>
  );
}

/** Table-shaped loading placeholder. */
export function TableSkeleton({ columns, rows = 6 }: { columns: number; rows?: number }) {
  return (
    <Card className="overflow-hidden" role="status" aria-label="Loading">
      <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-3.5">
        <div className="h-3 w-40 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }, (_, row) => (
          <div
            key={row}
            className="grid gap-4 px-5 py-4"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }, (_, col) => (
              <div
                key={col}
                className="h-3.5 animate-pulse rounded bg-slate-200/70"
                style={{ width: `${55 + ((row * 7 + col * 13) % 40)}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}
