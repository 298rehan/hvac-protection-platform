"use client";

import { useState, type ComponentProps, type ReactNode } from "react";

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

/** Password field with a show / hide toggle. */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        className={cx(FIELD_BASE, "pr-16", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-1 right-1 rounded-md px-3 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(FIELD_BASE, "form-select pr-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(FIELD_BASE, "min-h-24", className)} {...props} />;
}

/** Groups related fields under a heading, stacked on mobile and side-by-side on desktop. */
export function FormSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-labelledby={id}
      className="grid gap-x-8 gap-y-5 border-t border-slate-100 pt-6 first:border-0 first:pt-0 md:grid-cols-3"
    >
      <div>
        <h3 id={id} className="text-sm font-semibold text-slate-900">
          {title}
        </h3>
        {description ? (
          <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p>
        ) : null}
      </div>
      <div className="grid content-start gap-5 sm:grid-cols-2 md:col-span-2">{children}</div>
    </div>
  );
}
