"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { AdminShell } from "@/components/admin-shell";
import {
  TableCard,
  TableEmpty,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/data-table";
import { Field, Input } from "@/components/form";
import { ShieldIcon, UserPlusIcon } from "@/components/icons";
import { Modal } from "@/components/service-ui";
import { Alert, Avatar, Button, PageHeader, TogglePill } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import {
  createTechnician,
  fetchTechnicians,
  updateTechnician,
} from "@/services/serviceRequestService";
import type { Technician } from "@/types";

const EMPTY_FORM = { first_name: "", last_name: "", email: "", phone: "", password: "" };

export default function TechniciansPage() {
  return (
    <AdminShell>
      <TechnicianList />
    </AdminShell>
  );
}

function TechnicianList() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(
    () => fetchTechnicians().then(setTechnicians),
    [],
  );

  useEffect(() => {
    load()
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [load]);

  async function toggleActive(tech: Technician) {
    const next = !tech.is_active;
    if (
      !next &&
      !window.confirm(`Deactivate ${tech.first_name} ${tech.last_name}? They will no longer be able to sign in.`)
    ) {
      return;
    }
    setBusyId(tech.id);
    setError(null);
    setNotice(null);
    try {
      const updated = await updateTechnician(tech.id, { is_active: next });
      setTechnicians((list) => list.map((t) => (t.id === updated.id ? updated : t)));
      setNotice(`${updated.first_name} ${updated.last_name} is now ${next ? "active" : "deactivated"}.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const closeCreate = useCallback(() => setCreating(false), []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Technicians"
        description="Technician accounts can sign in to the staff portal and see only the jobs assigned to them."
        actions={
          <Button onClick={() => setCreating(true)}>
            <UserPlusIcon className="h-4 w-4" />
            Add technician
          </Button>
        }
      />

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}

      {loading ? (
        <TableSkeleton columns={6} rows={4} />
      ) : (
        <TableCard
          footer={
            technicians.length > 0
              ? `${technicians.length} technician${technicians.length === 1 ? "" : "s"}`
              : undefined
          }
        >
          <THead>
            <Th>Technician</Th>
            <Th>Phone</Th>
            <Th>Status</Th>
            <Th className="text-right">Open jobs</Th>
            <Th>Added</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </THead>
          <TBody>
            {technicians.length === 0 ? (
              <TableEmpty
                colSpan={6}
                message="No technicians yet. Add one to start assigning service requests."
                icon={<ShieldIcon className="h-5 w-5" />}
              />
            ) : (
              technicians.map((tech) => (
                <Tr key={tech.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar firstName={tech.first_name} lastName={tech.last_name} size="sm" />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">
                          {tech.first_name} {tech.last_name}
                        </p>
                        <p className="text-xs text-slate-500">{tech.email}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>{tech.phone ?? "—"}</Td>
                  <Td>
                    <TogglePill on={tech.is_active} onLabel="Active" offLabel="Deactivated" />
                  </Td>
                  <Td className="text-right tabular-nums">{tech.open_jobs}</Td>
                  <Td className="text-slate-500">{formatDate(tech.created_at)}</Td>
                  <Td className="text-right">
                    <Button
                      size="sm"
                      variant={tech.is_active ? "subtle" : "secondary"}
                      disabled={busyId === tech.id}
                      onClick={() => toggleActive(tech)}
                    >
                      {tech.is_active ? "Deactivate" : "Reactivate"}
                    </Button>
                  </Td>
                </Tr>
              ))
            )}
          </TBody>
        </TableCard>
      )}

      {creating ? (
        <CreateTechnicianDialog
          onClose={closeCreate}
          onCreated={(tech) => {
            setTechnicians((list) => [...list, tech]);
            setCreating(false);
            setNotice(
              `${tech.first_name} ${tech.last_name} was added. Share the initial password with them securely.`,
            );
          }}
        />
      ) : null}
    </div>
  );
}

function CreateTechnicianDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (tech: Technician) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set(key: keyof typeof EMPTY_FORM, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim()) {
      setError("Name and email are required.");
      return;
    }
    if (form.password.length < 8) {
      setError("The initial password must be at least 8 characters.");
      return;
    }
    setSaving(true);
    try {
      const tech = await createTechnician({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        password: form.password,
      });
      onCreated(tech);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Add technician"
      description="They sign in at the staff portal with this email and initial password."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error ? <Alert>{error}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="tech-first">
            <Input id="tech-first" value={form.first_name} maxLength={80} onChange={(e) => set("first_name", e.target.value)} />
          </Field>
          <Field label="Last name" htmlFor="tech-last">
            <Input id="tech-last" value={form.last_name} maxLength={80} onChange={(e) => set("last_name", e.target.value)} />
          </Field>
        </div>
        <Field label="Email address" htmlFor="tech-email">
          <Input id="tech-email" type="email" autoComplete="off" value={form.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Phone (optional)" htmlFor="tech-phone">
          <Input id="tech-phone" type="tel" value={form.phone} maxLength={30} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field
          label="Initial password"
          htmlFor="tech-password"
          hint="At least 8 characters. Share it with the technician through a secure channel, never by plain email."
        >
          <Input
            id="tech-password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            maxLength={128}
            onChange={(e) => set("password", e.target.value)}
          />
        </Field>
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create account"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
