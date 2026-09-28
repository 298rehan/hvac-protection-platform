"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Field, Input, Select } from "@/components/form";
import { Alert, Button, Card } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { storeRegion } from "@/lib/region";
import { fetchRegions } from "@/services/planService";
import type { Region, RegisterPayload } from "@/types";

const EMPTY_FORM: RegisterPayload = {
  first_name: "",
  last_name: "",
  email: "",
  password: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  zip_code: "",
};

export default function RegisterPage() {
  const { register, user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState<RegisterPayload>(EMPTY_FORM);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [regions, setRegions] = useState<Region[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && user) router.replace("/dashboard");
  }, [authLoading, user, router]);

  // The state list comes from the API so it is never duplicated in the UI.
  useEffect(() => {
    fetchRegions()
      .then(setRegions)
      .catch(() => setError("Could not load the list of states. Is the API running?"));
  }, []);

  function update<K extends keyof RegisterPayload>(key: K, value: RegisterPayload[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (form.password !== confirmPassword) {
      setError("The two passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const created = await register(form);
      if (created.state) storeRegion(created.state);
      router.replace("/dashboard");
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <Card className="p-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Create your account
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          We use your service address to determine which protection plans are available
          in your area and what they cost.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-8" noValidate>
          {error ? <Alert>{error}</Alert> : null}

          <fieldset>
            <legend className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Your details
            </legend>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <Field label="First name" htmlFor="first_name">
                <Input
                  id="first_name"
                  required
                  autoComplete="given-name"
                  value={form.first_name}
                  onChange={(e) => update("first_name", e.target.value)}
                />
              </Field>
              <Field label="Last name" htmlFor="last_name">
                <Input
                  id="last_name"
                  required
                  autoComplete="family-name"
                  value={form.last_name}
                  onChange={(e) => update("last_name", e.target.value)}
                />
              </Field>
              <Field label="Email address" htmlFor="email">
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                />
              </Field>
              <Field label="Phone number" htmlFor="phone">
                <Input
                  id="phone"
                  type="tel"
                  required
                  autoComplete="tel"
                  placeholder="(305) 555-0142"
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                />
              </Field>
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Service address
            </legend>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <Field label="Street address" htmlFor="address" className="sm:col-span-2">
                <Input
                  id="address"
                  required
                  autoComplete="street-address"
                  placeholder="1420 Palm Grove Avenue"
                  value={form.address}
                  onChange={(e) => update("address", e.target.value)}
                />
              </Field>
              <Field label="City" htmlFor="city">
                <Input
                  id="city"
                  required
                  autoComplete="address-level2"
                  value={form.city}
                  onChange={(e) => update("city", e.target.value)}
                />
              </Field>
              <Field
                label="State"
                htmlFor="state"
                hint="Determines which plans are offered to you."
              >
                <Select
                  id="state"
                  required
                  value={form.state}
                  onChange={(e) => update("state", e.target.value)}
                >
                  <option value="">Select a state</option>
                  {regions.map((region) => (
                    <option key={region.code} value={region.code}>
                      {region.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="ZIP code" htmlFor="zip_code">
                <Input
                  id="zip_code"
                  required
                  autoComplete="postal-code"
                  inputMode="numeric"
                  placeholder="33132"
                  value={form.zip_code}
                  onChange={(e) => update("zip_code", e.target.value)}
                />
              </Field>
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Password
            </legend>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <Field
                label="Password"
                htmlFor="password"
                hint="At least 8 characters, including a letter and a number."
              >
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                />
              </Field>
              <Field label="Confirm password" htmlFor="confirm_password">
                <Input
                  id="confirm_password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </Field>
            </div>
          </fieldset>

          <Button type="submit" size="lg" className="w-full" disabled={submitting}>
            {submitting ? "Creating your account..." : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
