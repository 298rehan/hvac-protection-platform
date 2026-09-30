"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import {
  ChevronRightIcon,
  CloseIcon,
  GridIcon,
  LayersIcon,
  LogoutIcon,
  MenuIcon,
  ReceiptIcon,
  UsersIcon,
} from "@/components/icons";
import { Avatar, PageLoader } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { cx } from "@/lib/format";

const NAV = [
  { href: "/", label: "Dashboard", icon: GridIcon },
  { href: "/customers", label: "Customers", icon: UsersIcon },
  { href: "/plans", label: "Plans", icon: LayersIcon },
  { href: "/purchases", label: "Purchases", icon: ReceiptIcon },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * Chrome for every authenticated admin page.
 *
 * The redirect below is a UX convenience only - the API independently requires
 * a valid ADMIN token on every endpoint this panel calls.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // The drawer remembers which page it was opened on, so navigating closes it.
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const sidebarOpen = drawerPath === pathname;

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!sidebarOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDrawerPath(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sidebarOpen]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <PageLoader label="Checking your session" />
      </div>
    );
  }

  const section = NAV.find((item) => isActive(pathname, item.href));

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Backdrop for the mobile drawer */}
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setDrawerPath(null)}
          className="fixed inset-0 z-30 animate-fade-in bg-slate-950/50 backdrop-blur-[2px] lg:hidden"
        />
      ) : null}

      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-brand-950 transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          sidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between gap-2.5 border-b border-white/10 px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm ring-1 ring-white/10">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5" aria-hidden>
                <path strokeLinecap="round" d="M12 3v18M3 12h18M6.3 6.3l11.4 11.4M17.7 6.3 6.3 17.7" />
                <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
              </svg>
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-sm font-bold text-white">Summit Air</span>
              <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-300">
                Admin Panel
              </span>
            </span>
          </Link>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerPath(null)}
            className="rounded-md p-1.5 text-brand-300 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label="Admin">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-400">
            Management
          </p>
          <ul className="space-y-0.5">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-white/10 text-white"
                        : "text-brand-200 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    {active ? (
                      <span
                        aria-hidden
                        className="absolute top-2 bottom-2 -left-3 w-1 rounded-r-full bg-brand-400"
                      />
                    ) : null}
                    <Icon
                      className={cx(
                        "h-4.5 w-4.5",
                        active ? "text-brand-200" : "text-brand-400 group-hover:text-brand-200",
                      )}
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <Avatar firstName={user.first_name} lastName={user.last_name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {user.first_name} {user.last_name}
              </p>
              <p className="truncate text-xs text-brand-300">{user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-brand-200 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogoutIcon className="h-4.5 w-4.5 text-brand-400" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button
            type="button"
            aria-label="Open navigation"
            aria-expanded={sidebarOpen}
            onClick={() => setDrawerPath(pathname)}
            className="-ml-1 rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
          >
            <MenuIcon />
          </button>
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
            <Link href="/" className="font-medium text-slate-500 hover:text-slate-900">
              Admin
            </Link>
            {section ? (
              <>
                <ChevronRightIcon className="h-4 w-4 text-slate-300" />
                <Link
                  href={section.href}
                  className="truncate font-semibold text-slate-900"
                >
                  {section.label}
                </Link>
              </>
            ) : null}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 animate-fade-in px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
