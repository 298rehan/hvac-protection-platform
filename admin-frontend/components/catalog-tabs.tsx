"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cx } from "@/lib/format";

const TABS = [
  { href: "/catalog", label: "Services & categories", match: (p: string) => p === "/catalog" || p.startsWith("/catalog/services") },
  { href: "/catalog/discounts", label: "Discount codes", match: (p: string) => p.startsWith("/catalog/discounts") },
];

/** Sub-navigation shared by the catalog pages. */
export function CatalogTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Catalog sections" className="flex gap-1 border-b border-slate-200">
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
