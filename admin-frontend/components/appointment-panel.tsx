"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { Field, Input, Select } from "@/components/form";
import { Modal } from "@/components/service-ui";
import { Alert, Button, Card, CardHeader, CheckIcon } from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api";
import { cx } from "@/lib/format";
import {
  AC_TYPE_LABELS,
  formatPreferredWindow,
  formatVisit,
  PREFERRED_WINDOW_START,
  todayInZone,
} from "@/lib/service-format";
import { fetchEligibleTechnicians, scheduleAppointment } from "@/services/serviceRequestService";
import type { EligibleTechnician, ServiceRequestDetail } from "@/types";

const DURATIONS = [30, 60, 90, 120, 180, 240, 360, 480];

/**
 * Lists the technicians whose service area covers the claim's property (ranked
 * by the backend) and books a visit. The backend re-checks the area, the
 * claim status and conflicting visits; a 409 is shown and the list refreshed.
 */
export function AppointmentPanel({
  request,
  onScheduled,
  onStale,
}: {
  request: ServiceRequestDetail;
  onScheduled: (updated: ServiceRequestDetail, message: string) => void;
  onStale: () => void;
}) {
  const tz = request.timezone;
  // `version` changes when the list must be re-fetched (after booking or a 409).
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    techs: EligibleTechnician[];
    error: string | null;
  } | null>(null);
  const loadKey = `${request.id}:${version}`;

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState(120);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchEligibleTechnicians(request.id)
      .then((techs) => {
        if (!cancelled) setResult({ key: loadKey, techs, error: null });
      })
      .catch((err) => {
        if (!cancelled) setResult({ key: loadKey, techs: [], error: errorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [request.id, loadKey]);

  const loading = result?.key !== loadKey;
  const techs = result?.techs ?? [];
  const selected = techs.find((t) => t.id === selectedId) ?? null;

  function choose(tech: EligibleTechnician) {
    setSelectedId(tech.id);
    setBookingError(null);
    const window = tech.free_preferred_windows[0];
    if (window) {
      setDate(window.date);
      setStartTime(PREFERRED_WINDOW_START[window.window]);
    }
  }

  const closeConfirm = useCallback(() => setConfirming(false), []);

  async function book() {
    if (!selected) return;
    setBusy(true);
    setBookingError(null);
    try {
      const updated = await scheduleAppointment(request.id, {
        technician_id: selected.id,
        date,
        start_time: startTime,
        duration_minutes: duration,
      });
      setConfirming(false);
      setSelectedId(null);
      setVersion((v) => v + 1);
      onScheduled(updated, `Visit confirmed with ${selected.first_name} ${selected.last_name}.`);
    } catch (err) {
      setConfirming(false);
      setBookingError(errorMessage(err));
      if (err instanceof ApiError && (err.status === 409 || err.status === 404)) {
        setVersion((v) => v + 1);
        onStale();
      }
    } finally {
      setBusy(false);
    }
  }

  const canBook = Boolean(selected && date && startTime);
  const rescheduling = request.status === "SCHEDULED";

  return (
    <Card className="ring-1 ring-amber-200">
      <CardHeader
        title="Technician & appointment"
        description={
          rescheduling
            ? "Book a new time or a different technician. The current visit is replaced."
            : "Technicians whose service area covers this property, best match first."
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

        {bookingError ? <Alert>{bookingError}</Alert> : null}

        {loading ? (
          <p className="text-sm text-slate-500">Finding technicians for this location…</p>
        ) : result?.error ? (
          <Alert>{result.error}</Alert>
        ) : techs.length === 0 ? (
          <Alert tone="info">
            No active technician serves {request.ac_unit.city}, {request.ac_unit.state}{" "}
            {request.ac_unit.zip_code}. Set technician service areas on the{" "}
            <Link href="/technicians" className="font-semibold underline">
              Technicians
            </Link>{" "}
            page.
          </Alert>
        ) : (
          <ul className="space-y-2" role="radiogroup" aria-label="Eligible technicians">
            {techs.map((tech) => {
              const active = tech.id === selectedId;
              return (
                <li
                  key={tech.id}
                  className={cx(
                    "rounded-lg border px-3.5 py-3 transition-colors",
                    active
                      ? "border-brand-400 bg-brand-50/60 ring-2 ring-brand-500/20"
                      : "border-slate-200 bg-white hover:border-slate-300",
                  )}
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => choose(tech)}
                    className="w-full rounded text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900">
                        {tech.first_name} {tech.last_name}
                        {request.technician?.id === tech.id ? (
                          <span className="ml-2 text-xs font-medium text-slate-500">(assigned)</span>
                        ) : null}
                      </p>
                      <span className="flex flex-wrap gap-1.5">
                        {tech.specialty_match ? (
                          <Badge tone="emerald">Specialty match</Badge>
                        ) : null}
                        <Badge tone="slate">
                          {tech.open_jobs} open job{tech.open_jobs === 1 ? "" : "s"}
                        </Badge>
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      Serves {tech.service_states.join(", ")}
                      {tech.service_zip_prefixes.length
                        ? ` · ZIP ${tech.service_zip_prefixes.join(", ")}`
                        : " (whole state)"}
                      {" · "}
                      matched by {tech.area_match === "zip" ? "ZIP prefix" : "state"}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Specialties:{" "}
                      {tech.specialties.length
                        ? tech.specialties.map((s) => AC_TYPE_LABELS[s]).join(", ")
                        : "general HVAC"}
                    </p>
                    {request.preferred_windows.length ? (
                      <p className="mt-1.5 text-xs text-slate-700">
                        Free in {tech.free_preferred_windows.length} of{" "}
                        {request.preferred_windows.length} preferred window
                        {request.preferred_windows.length === 1 ? "" : "s"}
                        {tech.free_preferred_windows.length
                          ? `: ${tech.free_preferred_windows.map(formatPreferredWindow).join("; ")}`
                          : ""}
                      </p>
                    ) : null}
                  </button>
                  {tech.upcoming_appointments.length ? (
                      <details className="mt-1.5 text-xs text-slate-600">
                        <summary className="cursor-pointer select-none">
                          {tech.upcoming_appointments.length} confirmed visit
                          {tech.upcoming_appointments.length === 1 ? "" : "s"} in the next 14 days
                        </summary>
                        <ul className="mt-1 space-y-0.5 pl-4">
                          {tech.upcoming_appointments.map((slot) => (
                            <li key={slot.start_at}>{formatVisit(slot.start_at, slot.end_at, tz)}</li>
                          ))}
                        </ul>
                      </details>
                    ) : (
                      <p className="mt-1.5 text-xs text-slate-500">No confirmed visits in the next 14 days.</p>
                    )}
                </li>
              );
            })}
          </ul>
        )}

        {selected ? (
          <div className="space-y-4 border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-500">
              Times are in the property&apos;s time zone ({tz}).
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Date" htmlFor="appt-date">
                <Input
                  id="appt-date"
                  type="date"
                  min={todayInZone(tz)}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
              <Field label="Start time" htmlFor="appt-time">
                <Input
                  id="appt-time"
                  type="time"
                  step={900}
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Duration" htmlFor="appt-duration">
              <Select
                id="appt-duration"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                {DURATIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes < 60 ? `${minutes} minutes` : `${minutes / 60} hour${minutes === 60 ? "" : "s"}`}
                  </option>
                ))}
              </Select>
            </Field>
            <Button className="w-full" disabled={!canBook || busy} onClick={() => setConfirming(true)}>
              <CheckIcon className="h-4 w-4" />
              {rescheduling ? "Reschedule visit" : "Confirm appointment"}
            </Button>
          </div>
        ) : null}
      </div>

      {confirming && selected ? (
        <Modal
          title={rescheduling ? "Reschedule this visit?" : "Confirm this visit?"}
          description="The customer and the technician are emailed the confirmed time."
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
            {request.status === "APPROVED" ? (
              <p className="text-xs text-slate-500">This also assigns the technician to the claim.</p>
            ) : null}
          </dl>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={closeConfirm} disabled={busy}>
              Back
            </Button>
            <Button onClick={book} disabled={busy}>
              {busy ? "Booking…" : rescheduling ? "Reschedule" : "Confirm visit"}
            </Button>
          </div>
        </Modal>
      ) : null}
    </Card>
  );
}

function Badge({ tone, children }: { tone: "emerald" | "slate"; children: ReactNode }) {
  return (
    <span
      className={cx(
        "rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        tone === "emerald"
          ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
          : "bg-slate-100 text-slate-600 ring-slate-200",
      )}
    >
      {children}
    </span>
  );
}
