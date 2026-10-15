"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { Field, Input, Select } from "@/components/form";
import { Modal } from "@/components/service-ui";
import { Alert, Button, Card, CardHeader, CheckIcon } from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api";
import { cx } from "@/lib/format";
import {
  formatInZone,
  formatPreferredWindow,
  formatVisit,
  formatWorkingHours,
  localDateTimeParts,
  todayInZone,
} from "@/lib/service-format";
import { confirmClaim, fetchEligibleTechnicians } from "@/services/serviceRequestService";
import type { EligibleTechnician, ServiceRequestDetail, TimeSlot } from "@/types";

const DURATIONS = [30, 60, 90, 120, 180, 240, 360, 480];
const DEFAULT_DURATION = 120;

/** Statuses where the admin can assign a technician and confirm in one step. */
export const CONFIRMABLE_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "ASSIGNED", "SCHEDULED"];

/**
 * One-step "Assign technician & confirm". The backend re-checks the technician's
 * service area, working hours and existing visits under a row lock; if anything
 * fails (409) the claim is left unchanged and the list is refreshed.
 */
export function ConfirmClaimPanel({
  request,
  onConfirmed,
  onStale,
}: {
  request: ServiceRequestDetail;
  onConfirmed: (updated: ServiceRequestDetail, message: string) => void;
  onStale: () => void;
}) {
  const tz = request.timezone;
  // `version` changes when the list must be re-fetched (after confirming or a 409).
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{ key: string; techs: EligibleTechnician[]; error: string | null } | null>(null);
  const loadKey = `${request.id}:${version}`;

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  const pick = useCallback(
    (tech: EligibleTechnician, slot: TimeSlot | null) => {
      setSelectedId(tech.id);
      setBookingError(null);
      if (slot) {
        const local = localDateTimeParts(slot.start_at, tz);
        setDate(local.date);
        setStartTime(local.time);
        const minutes = Math.round((Date.parse(slot.end_at) - Date.parse(slot.start_at)) / 60000);
        setDuration(DURATIONS.includes(minutes) ? minutes : DEFAULT_DURATION);
      }
    },
    [tz],
  );

  useEffect(() => {
    let cancelled = false;
    fetchEligibleTechnicians(request.id)
      .then((techs) => {
        if (cancelled) return;
        setResult({ key: loadKey, techs, error: null });
        // Preselect the best technician who is free at the customer's preferred time.
        const best = techs.find((t) => t.preferred_slot);
        if (best) pick(best, best.preferred_slot);
        else setSelectedId(null);
      })
      .catch((err) => {
        if (!cancelled) setResult({ key: loadKey, techs: [], error: errorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [request.id, loadKey, pick]);

  const loading = result?.key !== loadKey;
  const techs = result?.techs ?? [];
  const selected = techs.find((t) => t.id === selectedId) ?? null;
  const anyPreferred = techs.some((t) => t.preferred_slot);
  const rescheduling = request.status === "SCHEDULED";

  const closeConfirm = useCallback(() => setConfirming(false), []);

  async function submit() {
    if (!selected) return;
    setBusy(true);
    setBookingError(null);
    try {
      const updated = await confirmClaim(request.id, {
        technician_id: selected.id,
        date,
        start_time: startTime,
        duration_minutes: duration,
      });
      setConfirming(false);
      setVersion((v) => v + 1);
      onConfirmed(
        updated,
        rescheduling
          ? `Appointment updated: ${selected.first_name} ${selected.last_name}.`
          : `Claim confirmed and booked with ${selected.first_name} ${selected.last_name}.`,
      );
    } catch (err) {
      setConfirming(false);
      setBookingError(errorMessage(err));
      if (err instanceof ApiError && (err.status === 409 || err.status === 404)) {
        // Availability changed: refresh the technicians; the claim itself is unchanged.
        setVersion((v) => v + 1);
        onStale();
      }
    } finally {
      setBusy(false);
    }
  }

  const canConfirm = Boolean(selected && date && startTime && duration);

  return (
    <Card className="ring-1 ring-amber-200">
      <CardHeader
        title="Assign technician & confirm"
        description={
          rescheduling
            ? "Pick a new time or technician. The current visit is replaced."
            : "Choose an available technician and time, then confirm. The claim is approved and the visit booked in one step."
        }
      />
      <div className="space-y-4 px-5 py-5">
        {request.appointment ? (
          <p className="rounded-lg bg-teal-50 px-3 py-2.5 text-sm text-teal-900 ring-1 ring-teal-200">
            Current visit:{" "}
            <span className="font-semibold">
              {formatVisit(request.appointment.start_at, request.appointment.end_at, tz)}
            </span>{" "}
            with {request.appointment.technician.first_name} {request.appointment.technician.last_name}
          </p>
        ) : null}

        {request.preferred_windows.length ? (
          <p className="text-sm text-slate-600">
            Customer prefers:{" "}
            <span className="font-medium text-slate-800">
              {request.preferred_windows.map(formatPreferredWindow).join("; ")}
            </span>
          </p>
        ) : (
          <p className="text-sm text-slate-600">The customer did not choose a preferred time.</p>
        )}

        {bookingError ? <Alert>{bookingError}</Alert> : null}

        {loading ? (
          <p className="text-sm text-slate-500">Checking technicians for this location…</p>
        ) : result?.error ? (
          <Alert>{result.error}</Alert>
        ) : techs.length === 0 ? (
          <Alert tone="info">
            No active technician serves {request.ac_unit.city}, {request.ac_unit.state} {request.ac_unit.zip_code}.
            Set service areas on the{" "}
            <Link href="/technicians" className="font-semibold underline">
              Technicians
            </Link>{" "}
            page.
          </Alert>
        ) : (
          <>
            {!anyPreferred && request.preferred_windows.length ? (
              <Alert tone="info">
                No technician is free at the customer&apos;s preferred time. Pick one of the alternative times below or
                enter a time manually.
              </Alert>
            ) : null}
            <ul className="space-y-2" aria-label="Eligible technicians">
              {techs.map((tech) => (
                <TechnicianOption
                  key={tech.id}
                  tech={tech}
                  tz={tz}
                  active={tech.id === selectedId}
                  assigned={request.technician?.id === tech.id}
                  onPick={pick}
                />
              ))}
            </ul>
          </>
        )}

        {selected ? (
          <div className="space-y-4 border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-500">
              Appointment for <span className="font-medium text-slate-700">{selected.first_name} {selected.last_name}</span>.
              Times are in the property&apos;s time zone ({tz}).
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Date" htmlFor="appt-date">
                <Input id="appt-date" type="date" min={todayInZone(tz)} value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Start time" htmlFor="appt-time">
                <Input id="appt-time" type="time" step={900} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </Field>
              <Field label="Duration" htmlFor="appt-duration">
                <Select id="appt-duration" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                  {DURATIONS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes < 60 ? `${minutes} minutes` : `${minutes / 60} hour${minutes === 60 ? "" : "s"}`}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button className="w-full" disabled={!canConfirm || busy} onClick={() => setConfirming(true)}>
              <CheckIcon className="h-4 w-4" />
              {rescheduling ? "Update appointment" : "Confirm Claim"}
            </Button>
          </div>
        ) : null}
      </div>

      {confirming && selected ? (
        <Modal
          title={rescheduling ? "Update this appointment?" : `Confirm claim #${request.id}?`}
          description={
            rescheduling
              ? "The current visit is replaced. The customer and technician are emailed the new time."
              : "The claim is approved, the technician assigned and the visit booked. The customer and technician are emailed."
          }
          onClose={closeConfirm}
        >
          <dl className="space-y-1.5 text-sm text-slate-700">
            <div>
              <dt className="inline font-medium">Technician: </dt>
              <dd className="inline">
                {selected.first_name} {selected.last_name}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium">When: </dt>
              <dd className="inline">
                {date} at {startTime} for {duration} minutes ({tz})
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-slate-500">
            Availability is checked again when you confirm. If the time is no longer free, nothing is changed.
          </p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={closeConfirm} disabled={busy}>
              Back
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? "Confirming…" : rescheduling ? "Update appointment" : "Confirm Claim"}
            </Button>
          </div>
        </Modal>
      ) : null}
    </Card>
  );
}

function TechnicianOption({
  tech,
  tz,
  active,
  assigned,
  onPick,
}: {
  tech: EligibleTechnician;
  tz: string;
  active: boolean;
  assigned: boolean;
  onPick: (tech: EligibleTechnician, slot: TimeSlot | null) => void;
}) {
  return (
    <li
      className={cx(
        "rounded-lg border px-3.5 py-3 transition-colors",
        active ? "border-brand-400 bg-brand-50/60 ring-2 ring-brand-500/20" : "border-slate-200 bg-white hover:border-slate-300",
      )}
    >
      <button
        type="button"
        aria-pressed={active}
        onClick={() => onPick(tech, tech.preferred_slot ?? tech.suggested_slots[0] ?? null)}
        className="w-full rounded text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-slate-900">
            {tech.first_name} {tech.last_name}
            {assigned ? <span className="ml-2 text-xs font-medium text-slate-500">(assigned)</span> : null}
          </p>
          <span className="flex flex-wrap gap-1.5">
            {tech.preferred_slot ? <Badge tone="emerald">Available at preferred time</Badge> : null}
            <Badge tone="slate">
              {tech.open_jobs} open job{tech.open_jobs === 1 ? "" : "s"}
            </Badge>
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-600">
          Serves {tech.service_states.join(", ")}
          {tech.service_zip_prefixes.length ? ` · ${tech.service_zip_prefixes.length} ZIP prefix${tech.service_zip_prefixes.length === 1 ? "" : "es"}` : " (whole state)"}
          {" · "}
          Hours {formatWorkingHours(tech.work_days, tech.work_start, tech.work_end)}
        </p>
        {tech.preferred_slot ? (
          <p className="mt-1 text-xs font-medium text-emerald-800">
            Preferred time: {formatVisit(tech.preferred_slot.start_at, tech.preferred_slot.end_at, tz)}
          </p>
        ) : null}
      </button>
      {tech.suggested_slots.length ? (
        <div className="mt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {tech.preferred_slot ? "Other free times" : "Next free times"}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {tech.suggested_slots.map((slot) => (
              <button
                key={slot.start_at}
                type="button"
                onClick={() => onPick(tech, slot)}
                className="rounded-md bg-white px-2 py-1 text-xs text-slate-700 ring-1 ring-slate-200 hover:bg-brand-50 hover:ring-brand-300"
              >
                {formatInZone(slot.start_at, tz)}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-500">No free working-hour slots in the next 14 days.</p>
      )}
    </li>
  );
}

function Badge({ tone, children }: { tone: "emerald" | "slate"; children: ReactNode }) {
  return (
    <span
      className={cx(
        "whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        tone === "emerald" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-slate-100 text-slate-600 ring-slate-200",
      )}
    >
      {children}
    </span>
  );
}
