"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { HomeIcon, ReceiptIcon, ShieldIcon, UserIcon } from "@/components/icons";
import { RequireAuth } from "@/components/require-auth";
import { cx } from "@/lib/format";

const TABS = [
  { href: "/dashboard", label: "Overview", icon: HomeIcon },
  { href: "/dashboard/my-plan", label: "My Plan", icon: ShieldIcon },
  { href: "/dashboard/purchases", label: "My Purchases", icon: ReceiptIcon },
  { href: "/dashboard/profile", label: "Profile", icon: UserIcon },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <RequireAuth>
      <div className="min-h-full bg-slate-50/70">
        <div className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <nav
              className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]"
              aria-label="Dashboard"
            >
              {TABS.map((tab) => {
                const active = pathname === tab.href;
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-4 text-sm font-medium transition-colors sm:px-4",
                      active
                        ? "border-brand-600 text-brand-700"
                        : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900",
                    )}
                  >
                    <tab.icon
                      className={cx("h-4.5 w-4.5", active ? "text-brand-600" : "text-slate-400")}
                    />
                    {tab.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        <div className="mx-auto max-w-7xl animate-fade-in px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          {children}
        </div>
      </div>
    </RequireAuth>
  );
}
