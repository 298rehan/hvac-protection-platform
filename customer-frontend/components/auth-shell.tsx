import type { ReactNode } from "react";

import { BoltIcon, MapPinIcon, ShieldIcon } from "@/components/icons";
import { cx } from "@/lib/format";

const POINTS = [
  {
    icon: ShieldIcon,
    title: "Track your coverage",
    body: "See your plan status, coverage dates and full enrollment history in one place.",
  },
  {
    icon: MapPinIcon,
    title: "Pricing for your region",
    body: "Your service address sets which plans are offered and exactly what they cost.",
  },
  {
    icon: BoltIcon,
    title: "Priority service",
    body: "Members are scheduled ahead of non-members during peak heating and cooling season.",
  },
];

/** Two-column layout for sign-in and registration: form beside a brand panel. */
export function AuthShell({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="bg-slate-50">
      <div
        className={cx(
          "mx-auto grid gap-10 px-4 py-10 sm:px-6 sm:py-14 lg:items-start lg:gap-14 lg:px-8 lg:py-16",
          wide
            ? "max-w-6xl lg:grid-cols-[minmax(0,1fr)_20rem]"
            : "max-w-5xl lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]",
        )}
      >
        <div className="w-full animate-fade-in">{children}</div>

        <aside className="hidden rounded-2xl bg-brand-950 p-8 text-white lg:block">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-300">
            Summit Air members
          </p>
          <p className="mt-3 text-xl font-bold leading-snug tracking-tight">
            One account for your plan, your purchases and your service address.
          </p>
          <ul className="mt-8 space-y-6">
            {POINTS.map((point) => (
              <li key={point.title} className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-brand-200 ring-1 ring-white/10">
                  <point.icon className="h-4.5 w-4.5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{point.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-brand-200">{point.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
