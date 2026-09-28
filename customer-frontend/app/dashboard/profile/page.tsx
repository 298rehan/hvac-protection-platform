"use client";

import { useEffect, useState, type FormEvent } from "react";

import { Field, Input, Select } from "@/components/form";
import { Alert, Button, Card } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDate } from "@/lib/format";
import { storeRegion } from "@/lib/region";
import { changePassword, updateProfile } from "@/services/accountService";
import { fetchRegions } from "@/services/planService";
import type { ProfileUpdatePayload, Region, User } from "@/types";

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const [regions, setRegions] = useState<Region[]>([]);

  useEffect(() => {
    fetchRegions().then(setRegions).catch(() => setRegions([]));
  }, []);

  if (!user) return null;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Profile
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Signed in as <strong>{user.email}</strong> &middot; member since{" "}
          {formatDate(user.created_at)}
        </p>
      </header>

      <ProfileForm regions={regions} onSaved={setUser} />
      <PasswordForm />
    </div>
  );
}

function ProfileForm({
  regions,
  onSaved,
}: {
  regions: Region[];
  onSaved: (user: User) => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState<ProfileUpdatePayload>({
    first_name: user?.first_name ?? "",
    last_name: user?.last_name ?? "",
    phone: user?.phone ?? "",
    address: user?.address ?? "",
    city: user?.city ?? "",
    state: user?.state ?? "",
    zip_code: user?.zip_code ?? "",
  });
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);

  function update<K extends keyof ProfileUpdatePayload>(
    key: K,
    value: ProfileUpdatePayload[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus(null);
    setSaving(true);
    try {
      const updated = await updateProfile(form);
      onSaved(updated);
      if (updated.state) storeRegion(updated.state);
      setStatus({
        tone: "success",
        text: "Your profile has been updated. Plan pricing now uses your new service region.",
      });
    } catch (err) {
      setStatus({ tone: "error", text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-6 sm:p-8">
      <h2 className="text-lg font-semibold text-slate-900">Contact and service address</h2>
      <p className="mt-1 text-sm text-slate-600">
        Changing your state changes which plans are offered to you and what they cost.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
        {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="First name" htmlFor="p_first">
            <Input
              id="p_first"
              required
              value={form.first_name ?? ""}
              onChange={(e) => update("first_name", e.target.value)}
            />
          </Field>
          <Field label="Last name" htmlFor="p_last">
            <Input
              id="p_last"
              required
              value={form.last_name ?? ""}
              onChange={(e) => update("last_name", e.target.value)}
            />
          </Field>
          <Field
            label="Email address"
            htmlFor="p_email"
            hint="Your sign-in email cannot be changed in this demo."
          >
            <Input id="p_email" value={user?.email ?? ""} disabled />
          </Field>
          <Field label="Phone number" htmlFor="p_phone">
            <Input
              id="p_phone"
              type="tel"
              value={form.phone ?? ""}
              onChange={(e) => update("phone", e.target.value)}
            />
          </Field>
          <Field label="Street address" htmlFor="p_address" className="sm:col-span-2">
            <Input
              id="p_address"
              value={form.address ?? ""}
              onChange={(e) => update("address", e.target.value)}
            />
          </Field>
          <Field label="City" htmlFor="p_city">
            <Input
              id="p_city"
              value={form.city ?? ""}
              onChange={(e) => update("city", e.target.value)}
            />
          </Field>
          <Field label="State" htmlFor="p_state">
            <Select
              id="p_state"
              value={form.state ?? ""}
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
          <Field label="ZIP code" htmlFor="p_zip">
            <Input
              id="p_zip"
              inputMode="numeric"
              value={form.zip_code ?? ""}
              onChange={(e) => update("zip_code", e.target.value)}
            />
          </Field>
        </div>

        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </form>
    </Card>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus(null);

    if (next !== confirm) {
      setStatus({ tone: "error", text: "The two new passwords do not match." });
      return;
    }

    setSaving(true);
    try {
      const result = await changePassword(current, next);
      setStatus({ tone: "success", text: result.message });
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setStatus({ tone: "error", text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-6 sm:p-8">
      <h2 className="text-lg font-semibold text-slate-900">Change password</h2>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
        {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}

        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Current password" htmlFor="pw_current">
            <Input
              id="pw_current"
              type="password"
              required
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <Field label="New password" htmlFor="pw_new" hint="At least 8 characters.">
            <Input
              id="pw_new"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <Field label="Confirm new password" htmlFor="pw_confirm">
            <Input
              id="pw_confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
        </div>

        <Button type="submit" disabled={saving}>
          {saving ? "Updating..." : "Update password"}
        </Button>
      </form>
    </Card>
  );
}
