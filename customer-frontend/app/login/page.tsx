"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";

import { AuthShell } from "@/components/auth-shell";
import { Field, Input, PasswordInput } from "@/components/form";
import { Alert, Button, Card, PageLoader } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

function LoginForm() {
  const { login, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in? Skip the form.
  useEffect(() => {
    if (!authLoading && user) router.replace(next);
  }, [authLoading, user, router, next]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace(next);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Sign in to your account
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        Manage your protection plan, review enrollments and update your service address.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
        {error ? <Alert>{error}</Alert> : null}

        <Field label="Email address" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </Field>

        <Field label="Password" htmlFor="password">
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Your password"
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

      <p className="mt-6 text-center text-sm text-slate-600">
        Do not have an account?{" "}
        <Link href="/register" className="font-semibold text-brand-600 hover:text-brand-700">
          Create one
        </Link>
      </p>

      <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Demo customer login
        </p>
        <p className="mt-1.5 font-mono text-[13px] text-slate-700 break-all">
          maria.alvarez@example.com / Customer123!
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Administrators sign in through the separate admin portal on port 3001.
        </p>
      </div>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <AuthShell>
      <Suspense fallback={<PageLoader />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
