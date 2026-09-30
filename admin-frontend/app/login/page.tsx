"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Field, Input } from "@/components/form";
import { ShieldIcon } from "@/components/icons";
import { Alert, Button } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function AdminLoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace("/");
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-950 px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(72,148,197,0.18),transparent_60%)]"
      />
      <div className="relative w-full max-w-md animate-fade-in">
        <div className="mb-8 flex items-center justify-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow-lg shadow-black/20 ring-1 ring-white/10">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-6 w-6" aria-hidden>
              <path strokeLinecap="round" d="M12 3v18M3 12h18M6.3 6.3l11.4 11.4M17.7 6.3 6.3 17.7" />
              <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-lg font-bold text-white">Summit Air</span>
            <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-300">
              Admin Panel
            </span>
          </span>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-2xl shadow-black/30 sm:p-8">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100">
              <ShieldIcon />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Administrator sign in
              </h1>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                This portal is separate from the customer site. Customer accounts cannot
                sign in here.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-7 space-y-5" noValidate>
            {error ? <Alert>{error}</Alert> : null}

            <Field label="Email address" htmlFor="email">
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@hvacdemo.com"
              />
            </Field>

            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>

            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <span
                    aria-hidden
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Demo admin login
            </p>
            <p className="mt-1.5 font-mono text-[13px] text-slate-700">
              admin@hvacdemo.com / Admin123!
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-brand-300">
          Demonstration project. Summit Air is a fictional company and all data is sample
          data.
        </p>
      </div>
    </div>
  );
}
