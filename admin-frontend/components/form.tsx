import type { ComponentProps, ReactNode } from "react";

import { SearchIcon } from "@/components/icons";
import { cx } from "@/lib/format";

const FIELD_BASE =
  "block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm " +
  "placeholder:text-slate-400 transition-[border-color,box-shadow] duration-150 " +
  "hover:border-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 " +
  "disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500 disabled:shadow-none";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && !error ? <p className="mt-1.5 text-xs text-slate-500">{hint}</p> : null}
      {error ? <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p> : null}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(FIELD_BASE, className)} {...props} />;
}

/** Text input with a leading currency symbol, for price fields. */
export function MoneyInput({ className, ...props }: ComponentProps<"input">) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-sm text-slate-400">
        $
      </span>
      <input className={cx(FIELD_BASE, "pl-7 tabular-nums", className)} {...props} />
    </div>
  );
}

/** Search box with a leading magnifier icon. */
export function SearchInput({
  className,
  ...props
}: Omit<ComponentProps<"input">, "type">) {
  return (
    <div className={cx("relative", className)}>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
      <input type="search" className={cx(FIELD_BASE, "pl-10")} {...props} />
    </div>
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(FIELD_BASE, "form-select pr-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(FIELD_BASE, "min-h-24", className)} {...props} />;
}

/** Styled checkbox with a label and optional description. */
export function Checkbox({
  label,
  description,
  className,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { label: string; description?: string }) {
  return (
    <label
      className={cx(
        "flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white px-3.5 py-3 transition-colors hover:border-slate-300 has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50/50",
        className,
      )}
    >
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-brand-600"
        {...props}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-slate-500">{description}</span>
        ) : null}
      </span>
    </label>
  );
}
