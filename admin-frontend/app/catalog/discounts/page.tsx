"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { AdminShell } from "@/components/admin-shell";
import { CatalogTabs } from "@/components/catalog-tabs";
import { TableCard, TableEmpty, TableSkeleton, TBody, Td, Th, THead, Tr } from "@/components/data-table";
import { Checkbox, Field, Input, MoneyInput, Select } from "@/components/form";
import { PencilIcon, PlusIcon, TagIcon } from "@/components/icons";
import { Modal } from "@/components/service-ui";
import { Alert, Button, PageHeader, TogglePill } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { DISCOUNT_TYPE_LABELS, normaliseMoney } from "@/lib/order-format";
import { createDiscount, fetchDiscounts, updateDiscount } from "@/services/marketplaceService";
import type { DiscountCode, DiscountPayload, DiscountType } from "@/types";

export default function DiscountsPage() {
  return (
    <AdminShell>
      <DiscountsView />
    </AdminShell>
  );
}

function describeValue(discount: Pick<DiscountCode, "discount_type" | "value">): string {
  return discount.discount_type === "PERCENT" ? `${Number(discount.value)}% off` : `${formatMoney(discount.value)} off`;
}

function DiscountsView() {
  const [discounts, setDiscounts] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<DiscountCode | "new" | null>(null);

  const load = useCallback(() => fetchDiscounts().then(setDiscounts), []);

  useEffect(() => {
    load()
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [load]);

  const close = useCallback(() => setEditing(null), []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Discount codes"
        description="Codes customers can enter at checkout. The backend checks every rule (active, expiry, minimum subtotal, usage limit) before applying one."
        actions={
          <Button onClick={() => setEditing("new")}>
            <PlusIcon className="h-4 w-4" />
            New code
          </Button>
        }
      />
      <CatalogTabs />

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}

      {loading ? (
        <TableSkeleton columns={6} />
      ) : (
        <TableCard>
          <THead>
            <Th>Code</Th>
            <Th>Discount</Th>
            <Th>Minimum subtotal</Th>
            <Th>Used</Th>
            <Th>Expires</Th>
            <Th>Status</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </THead>
          <TBody>
            {discounts.length === 0 ? (
              <TableEmpty colSpan={7} message="No discount codes yet." icon={<TagIcon className="h-5 w-5" />} />
            ) : (
              discounts.map((discount) => (
                <Tr key={discount.id}>
                  <Td className="font-mono font-semibold text-slate-900">{discount.code}</Td>
                  <Td>{describeValue(discount)}</Td>
                  <Td className="tabular-nums">{Number(discount.min_subtotal) > 0 ? formatMoney(discount.min_subtotal) : "—"}</Td>
                  <Td className="tabular-nums">
                    {discount.times_used}
                    {discount.max_uses ? ` / ${discount.max_uses}` : ""}
                  </Td>
                  <Td>{discount.expires_at ? formatDate(discount.expires_at) : "Never"}</Td>
                  <Td>
                    <TogglePill on={discount.is_active} onLabel="Active" offLabel="Inactive" />
                  </Td>
                  <Td className="text-right">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(discount)}>
                      <PencilIcon className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                  </Td>
                </Tr>
              ))
            )}
          </TBody>
        </TableCard>
      )}

      {editing ? (
        <DiscountDialog
          discount={editing === "new" ? null : editing}
          onClose={close}
          onSaved={(saved, created) => {
            setEditing(null);
            setNotice(`${created ? "Created" : "Updated"} ${saved.code}.`);
            void load().catch((err) => setError(errorMessage(err)));
          }}
        />
      ) : null}
    </div>
  );
}

function DiscountDialog({
  discount,
  onClose,
  onSaved,
}: {
  discount: DiscountCode | null;
  onClose: () => void;
  onSaved: (discount: DiscountCode, created: boolean) => void;
}) {
  const [code, setCode] = useState(discount?.code ?? "");
  const [type, setType] = useState<DiscountType>(discount?.discount_type ?? "PERCENT");
  const [value, setValue] = useState(discount ? String(Number(discount.value)) : "");
  const [minSubtotal, setMinSubtotal] = useState(discount ? String(Number(discount.min_subtotal)) : "0");
  const [maxUses, setMaxUses] = useState(discount?.max_uses ? String(discount.max_uses) : "");
  const [expires, setExpires] = useState(discount?.expires_at ? discount.expires_at.slice(0, 10) : "");
  const [active, setActive] = useState(discount?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cleanCode = code.trim();
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(cleanCode)) {
      setError("Codes are 3-40 letters, numbers, - or _.");
      return;
    }
    const amount = normaliseMoney(value);
    if (amount === null || Number(amount) <= 0) {
      setError("Enter a discount value greater than zero.");
      return;
    }
    if (type === "PERCENT" && Number(amount) > 100) {
      setError("A percentage discount cannot exceed 100.");
      return;
    }
    const minimum = normaliseMoney(minSubtotal || "0");
    if (minimum === null) {
      setError("Enter a valid minimum subtotal.");
      return;
    }
    const uses = maxUses.trim() ? Number(maxUses) : null;
    if (uses !== null && (!Number.isInteger(uses) || uses < 1)) {
      setError("Usage limit must be a whole number of at least 1, or empty for unlimited.");
      return;
    }
    const payload: DiscountPayload = {
      code: cleanCode,
      discount_type: type,
      value: amount,
      min_subtotal: minimum,
      max_uses: uses,
      // End of the chosen day (UTC).
      expires_at: expires ? `${expires}T23:59:59Z` : null,
      is_active: active,
    };
    setSaving(true);
    setError(null);
    try {
      const saved = discount ? await updateDiscount(discount.id, payload) : await createDiscount(payload);
      onSaved(saved, !discount);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={discount ? `Edit ${discount.code}` : "New discount code"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error ? <Alert>{error}</Alert> : null}
        <Field label="Code" htmlFor="dc-code" hint="Customers can type it in any case.">
          <Input id="dc-code" value={code} maxLength={40} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" htmlFor="dc-type">
            <Select id="dc-type" value={type} onChange={(e) => setType(e.target.value as DiscountType)}>
              {(Object.keys(DISCOUNT_TYPE_LABELS) as DiscountType[]).map((t) => (
                <option key={t} value={t}>
                  {DISCOUNT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={type === "PERCENT" ? "Percent off" : "Amount off"} htmlFor="dc-value">
            {type === "PERCENT" ? (
              <Input id="dc-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="10" />
            ) : (
              <MoneyInput id="dc-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
            )}
          </Field>
          <Field label="Minimum subtotal" htmlFor="dc-min">
            <MoneyInput id="dc-min" inputMode="decimal" value={minSubtotal} onChange={(e) => setMinSubtotal(e.target.value)} />
          </Field>
          <Field label="Usage limit" htmlFor="dc-uses" hint="Empty = unlimited.">
            <Input id="dc-uses" type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
          </Field>
          <Field label="Expires on" htmlFor="dc-expires" hint="Empty = never.">
            <Input id="dc-expires" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </Field>
        </div>
        <Checkbox label="Active" checked={active} onChange={(e) => setActive(e.target.checked)} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save code"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
