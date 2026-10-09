import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import {
  AlertIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  InfoIcon,
} from "@/components/icons";
import { cx, STATUS_DOTS, STATUS_LABELS, STATUS_STYLES } from "@/lib/format";
import type { PurchaseStatus } from "@/types";

/* ------------------------------------------------------------------ *
 * Small presentational primitives shared across the customer site.
 * ------------------------------------------------------------------ */

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap " +
  "transition-[background-color,color,box-shadow,translate] duration-200 ease-out " +
  "motion-safe:hover:-translate-y-px active:translate-y-px " +
  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25 " +
  "disabled:pointer-events-none disabled:opacity-55";

const BUTTON_VARIANTS = {
  primary:
    "bg-brand-600 text-white shadow-sm shadow-brand-900/10 hover:bg-brand-700 hover:shadow-md hover:shadow-brand-900/20",
  secondary:
    "bg-white text-slate-800 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 hover:ring-slate-400",
  subtle: "bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900",
  danger: "bg-rose-600 text-white shadow-sm hover:bg-rose-700",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  /* For use on dark (brand-900/950) backgrounds. */
  inverse: "bg-white text-brand-900 shadow-sm hover:bg-brand-50",
  "outline-inverse":
    "text-white ring-1 ring-inset ring-white/25 hover:bg-white/10 hover:ring-white/40",
} as const;

const BUTTON_SIZES = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
} as const;

type Variant = keyof typeof BUTTON_VARIANTS;
type Size = keyof typeof BUTTON_SIZES;

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return (
    <Link
      className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    />
  );
}

export function Card({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cx(
        "rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** Title row inside a card, with an optional trailing action. */
export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm text-slate-500">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  center = false,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  center?: boolean;
}) {
  return (
    <div className={cx("max-w-2xl", center && "mx-auto text-center")}>
      {eyebrow ? (
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance text-slate-900 sm:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-base leading-relaxed text-pretty text-slate-600">
          {description}
        </p>
      ) : null}
    </div>
  );
}

/** Heading block used at the top of dashboard and account pages. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.75rem]">
          {title}
        </h1>
        {description ? (
          <div className="mt-1.5 text-sm text-slate-600">{description}</div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-brand-700"
    >
      <ArrowLeftIcon className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
      {children}
    </Link>
  );
}

export function StatusBadge({
  status,
  size = "md",
}: {
  status: PurchaseStatus;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        STATUS_STYLES[status],
      )}
    >
      <span aria-hidden className={cx("h-1.5 w-1.5 rounded-full", STATUS_DOTS[status])} />
      {STATUS_LABELS[status]}
    </span>
  );
}

const ALERT_TONES = {
  error: { box: "border-rose-200 bg-rose-50 text-rose-800", icon: AlertIcon, iconColor: "text-rose-500" },
  success: {
    box: "border-emerald-200 bg-emerald-50 text-emerald-800",
    icon: CheckCircleIcon,
    iconColor: "text-emerald-500",
  },
  info: { box: "border-brand-200 bg-brand-50 text-brand-900", icon: InfoIcon, iconColor: "text-brand-500" },
} as const;

export function Alert({
  tone = "error",
  children,
}: {
  tone?: "error" | "success" | "info";
  children: ReactNode;
}) {
  const style = ALERT_TONES[tone];
  const Icon = style.icon;

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "flex animate-fade-in gap-3 rounded-lg border px-4 py-3 text-sm leading-relaxed",
        style.box,
      )}
    >
      <Icon className={cx("mt-px h-5 w-5", style.iconColor)} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 text-sm text-slate-500">
      <span
        aria-hidden
        className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600"
      />
      {label}
    </div>
  );
}

/** Centred spinner used while a page's data loads. */
export function PageLoader({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center py-16">
      <Spinner label={label} />
    </div>
  );
}

/** Grey placeholder block for skeleton loading layouts. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-md bg-slate-200/70", className)} />;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-6 py-12 text-center">
      {icon ? (
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white text-brand-600 shadow-sm ring-1 ring-slate-200">
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description ? (
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** Compact metric tile for dashboard summaries. */
export function StatTile({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Card className="hover-lift spotlight flex items-start gap-4 p-5">
      {icon ? (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
        <div className="mt-1 truncate text-lg font-semibold text-slate-900">{value}</div>
        {hint ? <div className="mt-0.5 text-xs text-slate-500">{hint}</div> : null}
      </div>
    </Card>
  );
}

/** Label + value row used across the dashboard and detail pages. */
export function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-slate-900 tabular-nums">{children}</dd>
    </div>
  );
}

export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
      className={cx("h-5 w-5 shrink-0", className)}
    >
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
