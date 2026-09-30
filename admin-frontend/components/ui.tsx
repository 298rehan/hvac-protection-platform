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
 * Small presentational primitives shared across the admin panel.
 * ------------------------------------------------------------------ */

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap " +
  "transition-[background-color,color,box-shadow,transform] duration-150 active:translate-y-px " +
  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25 " +
  "disabled:pointer-events-none disabled:opacity-55";

const BUTTON_VARIANTS = {
  primary: "bg-brand-600 text-white shadow-sm shadow-brand-900/10 hover:bg-brand-700",
  secondary:
    "bg-white text-slate-800 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 hover:ring-slate-400",
  subtle: "bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900",
  danger: "bg-rose-600 text-white shadow-sm hover:bg-rose-700",
  "danger-outline":
    "bg-white text-rose-700 shadow-sm ring-1 ring-inset ring-rose-200 hover:bg-rose-50 hover:ring-rose-300",
} as const;

const BUTTON_SIZES = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
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
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm text-slate-500">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Heading block at the top of every admin page. */
export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-600">
            {description}
          </p>
        ) : null}
        {meta ? <div className="mt-3">{meta}</div> : null}
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

/** Neutral on/off pill for non-purchase states (plan active, region availability). */
export function TogglePill({
  on,
  onLabel,
  offLabel,
}: {
  on: boolean;
  onLabel: string;
  offLabel: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        on
          ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
          : "bg-slate-100 text-slate-600 ring-slate-200",
      )}
    >
      <span
        aria-hidden
        className={cx("h-1.5 w-1.5 rounded-full", on ? "bg-emerald-500" : "bg-slate-400")}
      />
      {on ? onLabel : offLabel}
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

const STAT_TONES = {
  brand: "bg-brand-50 text-brand-600 ring-brand-100",
  amber: "bg-amber-50 text-amber-600 ring-amber-100",
  rose: "bg-rose-50 text-rose-600 ring-rose-100",
  emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
} as const;

/** Metric card for the dashboard. */
export function StatCard({
  label,
  value,
  icon,
  tone = "brand",
  href,
  hint,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: keyof typeof STAT_TONES;
  href?: string;
  hint?: ReactNode;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span
          className={cx(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1",
            STAT_TONES[tone],
          )}
        >
          {icon}
        </span>
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </>
  );

  const shell =
    "block rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

  return href ? (
    <Link
      href={href}
      className={cx(shell, "transition-[box-shadow,border-color] hover:border-slate-300 hover:shadow-md")}
    >
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

/** Initials avatar for customers and staff. */
export function Avatar({
  firstName,
  lastName,
  size = "md",
}: {
  firstName: string;
  lastName: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = { sm: "h-8 w-8 text-[11px]", md: "h-9 w-9 text-xs", lg: "h-14 w-14 text-lg" };
  return (
    <span
      aria-hidden
      className={cx(
        "flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800",
        sizes[size],
      )}
    >
      {`${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()}
    </span>
  );
}

/** Compact state-code tag, e.g. "FL". */
export function RegionTag({ code }: { code: string }) {
  return (
    <span className="inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200/70">
      {code}
    </span>
  );
}

/** Label + value row used across the detail pages. */
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
      <dd className="min-w-0 text-right text-sm font-medium break-words text-slate-900 tabular-nums">
        {children}
      </dd>
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
