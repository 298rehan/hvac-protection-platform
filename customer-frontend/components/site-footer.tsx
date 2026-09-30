import Link from "next/link";

import { ClockIcon, MapPinIcon } from "@/components/icons";
import { Logo } from "@/components/logo";

const PLAN_LINKS = [
  { href: "/plans", label: "Compare plans" },
  { href: "/register", label: "Create an account" },
  { href: "/login", label: "Member sign in" },
];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-14">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
          <div className="sm:col-span-2">
            <div className="flex items-center gap-2.5">
              <Logo className="h-8 w-8" />
              <p className="text-base font-bold tracking-tight text-brand-950">Summit Air</p>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-600">
              Residential HVAC maintenance and protection plans for homeowners across
              Florida, Texas, Arizona and California. Plan availability and pricing vary
              by service region.
            </p>
            <p className="mt-4 inline-flex items-center gap-2 text-sm text-slate-500">
              <MapPinIcon className="h-4 w-4 text-slate-400" />
              Serving FL &middot; TX &middot; AZ &middot; CA
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-900">Plans</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {PLAN_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-slate-600 transition-colors hover:text-brand-700"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ClockIcon className="h-4 w-4 text-slate-400" />
              Service hours
            </p>
            <dl className="mt-4 space-y-2.5 text-sm text-slate-600">
              <div className="flex justify-between gap-4 sm:block">
                <dt className="font-medium text-slate-700">Mon to Fri</dt>
                <dd>7:00 AM to 7:00 PM</dd>
              </div>
              <div className="flex justify-between gap-4 sm:block">
                <dt className="font-medium text-slate-700">Saturday</dt>
                <dd>8:00 AM to 4:00 PM</dd>
              </div>
              <div className="flex justify-between gap-4 sm:block">
                <dt className="font-medium text-slate-700">Emergency line</dt>
                <dd>24/7 for Complete members</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="mt-12 border-t border-slate-200 pt-6">
          <p className="text-xs leading-relaxed text-slate-500">
            &copy; {year} Summit Air Protection Plans.{" "}
            <strong className="font-semibold text-slate-600">Demonstration project.</strong>{" "}
            Summit Air is a fictional company; all plans, prices and customer records are
            sample data. Checkout is simulated and no payment is ever processed.
          </p>
        </div>
      </div>
    </footer>
  );
}
