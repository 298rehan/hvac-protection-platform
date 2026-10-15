"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { AdminShell } from "@/components/admin-shell";
import { CatalogTabs } from "@/components/catalog-tabs";
import { TableCard, TableEmpty, TableSkeleton, TBody, Td, Th, THead, Tr } from "@/components/data-table";
import { Checkbox, Field, Input, SearchInput, Select, Textarea } from "@/components/form";
import { PencilIcon, PlusIcon, TagIcon } from "@/components/icons";
import { Modal } from "@/components/service-ui";
import { Alert, Button, ButtonLink, Card, CardHeader, PageHeader, TogglePill } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { cx } from "@/lib/format";
import { formatDuration, formatServicePrice, SERVICE_ICONS } from "@/lib/order-format";
import {
  createCategory,
  fetchAdminCategories,
  fetchAdminServices,
  updateCategory,
} from "@/services/marketplaceService";
import type { CatalogService, CategoryPayload, ServiceCategory } from "@/types";

type ActiveFilter = "all" | "active" | "inactive";

export default function CatalogPage() {
  return (
    <AdminShell>
      <CatalogView />
    </AdminShell>
  );
}

function CatalogView() {
  const [services, setServices] = useState<CatalogService[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<ActiveFilter>("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ServiceCategory | "new" | null>(null);

  const load = useCallback(
    () =>
      Promise.all([fetchAdminServices(), fetchAdminCategories()]).then(([s, c]) => {
        setServices(s);
        setCategories(c);
      }),
    [],
  );

  useEffect(() => {
    load()
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [load]);

  const groups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const visible = services.filter(
      (s) =>
        (filter === "all" || (filter === "active" ? s.is_active : !s.is_active)) &&
        (!needle || s.name.toLowerCase().includes(needle) || s.description.toLowerCase().includes(needle)),
    );
    return categories
      .map((category) => ({ category, services: visible.filter((s) => s.category.id === category.id) }))
      .filter((group) => group.services.length > 0);
  }, [services, categories, filter, search]);

  const closeEditor = useCallback(() => setEditing(null), []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Services"
        description="The HVAC services customers can book. Prices here are the only prices the system uses - the backend recalculates every quote and order from them. Deactivate a service to stop selling it; past orders keep their original prices."
        actions={
          <ButtonLink href="/catalog/services/new">
            <PlusIcon className="h-4 w-4" />
            New service
          </ButtonLink>
        }
      />
      <CatalogTabs />

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div role="radiogroup" aria-label="Filter by status" className="inline-flex gap-1 rounded-lg bg-slate-200/60 p-1">
              {(["all", "active", "inactive"] as ActiveFilter[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={filter === value}
                  onClick={() => setFilter(value)}
                  className={cx(
                    "rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                    filter === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search services"
              aria-label="Search services"
              className="w-full sm:w-72"
            />
          </div>

          {loading ? (
            <TableSkeleton columns={5} />
          ) : groups.length === 0 ? (
            <TableCard>
              <TBody>
                <TableEmpty
                  colSpan={1}
                  message={services.length === 0 ? "No services yet. Create the first one." : "No services match these filters."}
                  icon={<TagIcon className="h-5 w-5" />}
                />
              </TBody>
            </TableCard>
          ) : (
            groups.map(({ category, services: rows }) => (
              <TableCard
                key={category.id}
                header={
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
                    <h2 className="text-sm font-semibold text-slate-900">{category.name}</h2>
                    {!category.is_active ? <TogglePill on={false} onLabel="" offLabel="Category hidden" /> : null}
                  </div>
                }
              >
                <THead>
                  <Th>Service</Th>
                  <Th>Price</Th>
                  <Th>Duration</Th>
                  <Th>Status</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </THead>
                <TBody>
                  {rows.map((service) => (
                    <Tr key={service.id}>
                      <Td className="whitespace-normal">
                        <Link href={`/catalog/services/${service.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                          {service.name}
                        </Link>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {service.addons.filter((a) => a.is_active).length} add-on(s) · max {service.max_quantity} per order
                          {service.available_states ? ` · ${service.available_states.join(", ")} only` : ""}
                        </p>
                      </Td>
                      <Td className="tabular-nums">
                        {formatServicePrice(service)}
                        {service.requires_inspection ? (
                          <span className="block text-xs text-amber-700">Confirmed after inspection</span>
                        ) : null}
                      </Td>
                      <Td>{formatDuration(service.duration_minutes)}</Td>
                      <Td>
                        <TogglePill on={service.is_active} onLabel="Active" offLabel="Inactive" />
                      </Td>
                      <Td className="text-right">
                        <ButtonLink href={`/catalog/services/${service.id}`} size="sm" variant="secondary">
                          <PencilIcon className="h-3.5 w-3.5" />
                          Edit
                        </ButtonLink>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </TableCard>
            ))
          )}
        </div>

        <Card className="h-fit">
          <CardHeader
            title="Categories"
            description="How services are grouped for customers."
            action={
              <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
                <PlusIcon className="h-3.5 w-3.5" />
                Add
              </Button>
            }
          />
          {categories.length === 0 && !loading ? (
            <p className="px-5 py-6 text-sm text-slate-500">No categories yet. Add one before creating services.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {categories.map((category) => (
                <li key={category.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{category.name}</p>
                    <p className="text-xs text-slate-500">
                      Order {category.display_order} · {services.filter((s) => s.category.id === category.id).length} service(s)
                      {category.is_active ? "" : " · hidden"}
                    </p>
                  </div>
                  <Button size="sm" variant="subtle" onClick={() => setEditing(category)} aria-label={`Edit ${category.name}`}>
                    <PencilIcon className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {editing ? (
        <CategoryDialog
          category={editing === "new" ? null : editing}
          onClose={closeEditor}
          onSaved={(saved, created) => {
            setEditing(null);
            setNotice(created ? `Category "${saved.name}" created.` : `Category "${saved.name}" updated.`);
            void load().catch((err) => setError(errorMessage(err)));
          }}
        />
      ) : null}
    </div>
  );
}

function CategoryDialog({
  category,
  onClose,
  onSaved,
}: {
  category: ServiceCategory | null;
  onClose: () => void;
  onSaved: (category: ServiceCategory, created: boolean) => void;
}) {
  const [form, setForm] = useState<CategoryPayload>({
    name: category?.name ?? "",
    description: category?.description ?? "",
    icon: category?.icon ?? "wrench",
    display_order: category?.display_order ?? 0,
    is_active: category?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (form.name.trim().length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = { ...form, name: form.name.trim(), description: form.description.trim() };
      const saved = category ? await updateCategory(category.id, payload) : await createCategory(payload);
      onSaved(saved, !category);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={category ? "Edit category" : "New category"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        <Field label="Name" htmlFor="cat-name">
          <Input id="cat-name" value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <Field label="Description" htmlFor="cat-desc">
          <Textarea id="cat-desc" value={form.description} maxLength={1000} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Icon" htmlFor="cat-icon">
            <Select id="cat-icon" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })}>
              {SERVICE_ICONS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Display order" htmlFor="cat-order">
            <Input
              id="cat-order"
              type="number"
              value={form.display_order}
              onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) || 0 })}
            />
          </Field>
        </div>
        <Checkbox
          label="Visible to customers"
          description="Hidden categories hide all their services from the catalog."
          checked={form.is_active}
          onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save category"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
