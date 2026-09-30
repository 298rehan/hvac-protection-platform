"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  ChevronDownIcon,
  CloseIcon,
  HomeIcon,
  LogoutIcon,
  MenuIcon,
  ReceiptIcon,
  ShieldIcon,
  UserIcon,
} from "@/components/icons";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { cx } from "@/lib/format";

const PUBLIC_LINKS = [
  { href: "/", label: "Home" },
  { href: "/plans", label: "Plans" },
];

const ACCOUNT_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: HomeIcon },
  { href: "/dashboard/my-plan", label: "My Plan", icon: ShieldIcon },
  { href: "/dashboard/purchases", label: "My Purchases", icon: ReceiptIcon },
  { href: "/dashboard/profile", label: "Profile", icon: UserIcon },
];

function isActive(pathname: string, href: string) {
  if (href === "/" || href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const { user, logout, loading } = useAuth();
  const pathname = usePathname();

  // The mobile menu remembers which page it was opened on, so navigating to
  // another page closes it automatically.
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menuOpen = menuPath === pathname;

  const initials = user
    ? `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase()
    : "";

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5 rounded-lg">
            <Logo />
            <span className="flex flex-col leading-none">
              <span className="text-[17px] font-bold tracking-tight text-brand-950">
                Summit Air
              </span>
              <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Protection Plans
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {[...PUBLIC_LINKS, ...(user ? [ACCOUNT_LINKS[0]] : [])].map((link) => (
              <NavLink key={link.href} href={link.href} active={isActive(pathname, link.href)}>
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          {loading ? (
            <span className="h-9 w-40 animate-pulse rounded-lg bg-slate-100" aria-hidden />
          ) : user ? (
            <AccountMenu
              name={`${user.first_name} ${user.last_name}`}
              email={user.email}
              initials={initials}
              pathname={pathname}
              onLogout={logout}
            />
          ) : (
            <>
              <ButtonLink href="/login" variant="secondary">
                Sign in
              </ButtonLink>
              <ButtonLink href="/register">
                Get started
              </ButtonLink>
            </>
          )}
        </div>

        <button
          type="button"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          onClick={() => setMenuPath(menuOpen ? null : pathname)}
          className="-mr-1 rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 lg:hidden"
        >
          {menuOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>

      {menuOpen ? (
        <div
          id="mobile-nav"
          className="max-h-[calc(100vh-4rem)] animate-fade-in overflow-y-auto border-t border-slate-200 bg-white shadow-lg lg:hidden"
        >
          <nav className="mx-auto max-w-7xl space-y-1 px-4 py-4 sm:px-6" aria-label="Mobile">
            {PUBLIC_LINKS.map((link) => (
              <MobileLink key={link.href} href={link.href} active={isActive(pathname, link.href)}>
                {link.label}
              </MobileLink>
            ))}

            {user ? (
              <>
                <p className="px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  My account
                </p>
                {ACCOUNT_LINKS.map((link) => (
                  <MobileLink
                    key={link.href}
                    href={link.href}
                    active={isActive(pathname, link.href)}
                  >
                    <link.icon className="h-4.5 w-4.5 text-slate-400" />
                    {link.label}
                  </MobileLink>
                ))}
              </>
            ) : null}

            <div className="mt-3 border-t border-slate-200 pt-4">
              {user ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar initials={initials} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {user.first_name} {user.last_name}
                      </p>
                      <p className="truncate text-xs text-slate-500">{user.email}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={logout}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  >
                    <LogoutIcon className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <ButtonLink href="/login" variant="secondary">
                    Sign in
                  </ButtonLink>
                  <ButtonLink href="/register">Get started</ButtonLink>
                </div>
              )}
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "relative rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
      )}
    >
      {children}
      {active ? (
        <span
          aria-hidden
          className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-brand-600"
        />
      ) : null}
    </Link>
  );
}

function MobileLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
        active ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-50",
      )}
    >
      {children}
    </Link>
  );
}

function AccountMenu({
  name,
  email,
  initials,
  pathname,
  onLogout,
}: {
  name: string;
  email: string;
  initials: string;
  pathname: string;
  onLogout: () => void;
}) {
  // Same trick as the mobile menu: the dropdown closes on navigation.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpenPath(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenPath(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpenPath(open ? null : pathname)}
        className={cx(
          "flex items-center gap-2.5 rounded-full py-1 pr-2.5 pl-1 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition-colors hover:bg-slate-50 hover:ring-slate-300",
          open && "bg-slate-50 ring-slate-300",
        )}
      >
        <Avatar initials={initials} />
        <span className="max-w-[10rem] truncate">{name}</span>
        <ChevronDownIcon
          className={cx("h-4 w-4 text-slate-400 transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 origin-top-right animate-fade-in overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/10"
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
            <p className="truncate text-xs text-slate-500">{email}</p>
          </div>
          <div className="p-1.5">
            {ACCOUNT_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                role="menuitem"
                className={cx(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
                  isActive(pathname, link.href)
                    ? "bg-brand-50 font-medium text-brand-700"
                    : "text-slate-700 hover:bg-slate-50",
                )}
              >
                <link.icon className="h-4.5 w-4.5 text-slate-400" />
                {link.label}
              </Link>
            ))}
          </div>
          <div className="border-t border-slate-100 p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={onLogout}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <LogoutIcon className="h-4.5 w-4.5 text-slate-400" />
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Avatar({ initials }: { initials: string }) {
  return (
    <span
      aria-hidden
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800"
    >
      {initials}
    </span>
  );
}
