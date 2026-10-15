"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Field, Input } from "@/components/form";
import { requestedWindowText } from "@/components/order-ui";
import { Modal } from "@/components/service-ui";
import { Alert, Button, Card, CardHeader } from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api";
import { cx } from "@/lib/format";
import { formatDuration } from "@/lib/order-format";
import { PREFERRED_WINDOW_START, todayInZone } from "@/lib/service-format";
import { bookOrderVisit, fetchOrderTechnicians } from "@/services/marketplaceService";
import type { OrderDetail, OrderTechnician } from "@/types";

interface TechResult {
  version: number;
  technicians: OrderTechnician[];
  error: string | null;
}

/**
 * Pick a technician who serves the address and book the visit. Times are in the
 * property's local time; the backend converts to UTC and rejects any overlap
 * with the technician's other visits (claims or orders).
 */
export function OrderBookingPanel({
  order,
  onBooked,
  onConflict,
}: {
  order: OrderDetail;
  onBooked: (updated: OrderDetail) => void;
  onConflict: () => void;
}) {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<TechResult | null>(null);
  const [technicianId, setTechnicianId] = useState<number | null>(order.technician?.id ?? null);
  const [date, setDate] = useState(order.requested_date);
  const [startTime, setStartTime] = useState(PREFERRED_WINDOW_START[order.requested_window]);
  const [duration, setDuration] = useState(String(Math.min(480, Math.max(30, order.total_duration_minutes))));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOrderTechnicians(order.id)
      .then((technicians) => {
        if (!cancelled) setResult({ version, technicians, error: null });
      })
      .catch((err) => {
        if (!cancelled) setResult({ version, technicians: [], error: errorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [order.id, version]);

  const loading = result?.version !== version;
  const technicians = result?.technicians ?? [];
  const selected = technicians.find((t) => t.id === technicianId) ?? null;
  const closeConfirm = useCallback(() => setConfirming(false), []);

  function validate(): string | null {
    if (!selected) return "Choose a technician.";
    if (!date || date < todayInZone(order.timezone)) return "Choose a visit date that is not in the past.";
    if (!/^\d{2}:\d{2}$/.test(startTime)) return "Choose a start time.";
    const minutes = Number(duration);
    if (!Number.isInteger(minutes) || minutes < 30 || minutes > 480) return "Duration must be 30 to 480 minutes.";
    return null;
  }

  async function book() {
    setBusy(true);
    setError(null);
    try {
      const updated = await bookOrderVisit(order.id, {
        technician_id: technicianId as number,
        date,
        start_time: startTime,
        duration_minutes: Number(duration),
      });
      setConfirming(false);
      onBooked(updated);
    } catch (err) {
      setConfirming(false);
      setError(errorMessage(err));
      if (err instanceof ApiError && err.status === 409) {
        setVersion((v) => v + 1);
        onConflict();
      }
    } finally {
      setBusy(false);
    }
  }

  const rescheduling = order.status === "SCHEDULED";

  return (
    <Card>
      <CardHeader
        title={rescheduling ? "Reschedule or reassign" : "Technician & appointment"}
        description={`Customer asked for ${requestedWindowText(order)} (${order.timezone.replace("_", " ")} time).`}
      />
      <div className="space-y-5 px-5 py-5">
        {error ? <Alert>{error}</Alert> : null}
        {result?.error ? <Alert>{result.error}</Alert> : null}

        {loading ? (
          <p className="text-sm text-slate-500">Finding technicians who serve {order.city}, {order.state}...</p>
        ) : technicians.length === 0 ? (
          <Alert tone="info">
            No active technician serves {order.city}, {order.state} {order.zip_code}. Set service areas on the{" "}
            <Link href="/technicians" className="font-semibold underline">
              Technicians
            </Link>{" "}
            page.
          </Alert>
        ) : (
          <fieldset>
            <legend className="text-sm font-medium text-slate-700">Technician</legend>
            <ul className="mt-2 space-y-2">
              {technicians.map((tech) => (
                <li key={tech.id}>
                  <label
                    className={cx(
                      "flex cursor-pointer flex-col gap-1 rounded-lg border px-4 py-3 transition-colors sm:flex-row sm:items-center sm:justify-between",
                      technicianId === tech.id ? "border-brand-400 bg-brand-50/60" : "border-slate-200 hover:border-slate-300",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="order-technician"
                        className="h-4 w-4 accent-brand-600"
                        checked={technicianId === tech.id}
                        onChange={() => setTechnicianId(tech.id)}
                      />
                      <span>
                        <span className="block text-sm font-medium text-slate-900">
                          {tech.first_name} {tech.last_name}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {tech.service_states.join(", ")}
                          {tech.service_zip_prefixes.length ? ` · ZIP ${tech.service_zip_prefixes.join(", ")}` : ""}
                          {` · ${tech.open_jobs} open job${tech.open_jobs === 1 ? "" : "s"}`}
                        </span>
                      </span>
                    </span>
                    <span
                      className={cx(
                        "self-start rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset sm:self-auto",
                        tech.free_in_requested_window
                          ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                          : "bg-amber-50 text-amber-800 ring-amber-200",
                      )}
                    >
                      {tech.free_in_requested_window ? "Free in requested window" : "Busy in requested window"}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date (local)" htmlFor="ob-date">
            <Input id="ob-date" type="date" value={date} min={todayInZone(order.timezone)} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Start time (local)" htmlFor="ob-time">
            <Input id="ob-time" type="time" step={900} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
          <Field label="Duration (minutes)" htmlFor="ob-duration" hint={`Services take about ${formatDuration(order.total_duration_minutes)}.`}>
            <Input id="ob-duration" type="number" min={30} max={480} step={15} value={duration} onChange={(e) => setDuration(e.target.value)} />
          </Field>
        </div>

        <div className="flex justify-end">
          <Button
            disabled={busy || technicians.length === 0}
            onClick={() => {
              const problem = validate();
              if (problem) setError(problem);
              else {
                setError(null);
                setConfirming(true);
              }
            }}
          >
            {rescheduling ? "Book new time" : "Book visit"}
          </Button>
        </div>
      </div>

      {confirming && selected ? (
        <Modal
          title="Confirm the visit"
          description={
            rescheduling
              ? "The current booking will be cancelled and replaced with this one."
              : "The order moves to Scheduled and the technician sees it in their list."
          }
          onClose={closeConfirm}
        >
          <p className="text-sm text-slate-700">
            <strong>
              {selected.first_name} {selected.last_name}
            </strong>{" "}
            on <strong>{date}</strong> at <strong>{startTime}</strong> ({order.timezone.replace("_", " ")} time) for{" "}
            {duration} minutes, at {order.address}, {order.city}.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={closeConfirm}>
              Back
            </Button>
            <Button onClick={book} disabled={busy}>
              {busy ? "Booking..." : "Confirm booking"}
            </Button>
          </div>
        </Modal>
      ) : null}
    </Card>
  );
}
