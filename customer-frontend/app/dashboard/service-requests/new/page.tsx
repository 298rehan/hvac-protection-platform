"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { Field, Input, Select, Textarea } from "@/components/form";
import { SnowflakeIcon } from "@/components/icons";
import { postToS3, validate as validatePhoto } from "@/components/photo-uploader";
import {
  Alert,
  BackLink,
  Button,
  ButtonLink,
  Card,
  DetailRow,
  EmptyState,
  PageHeader,
  PageLoader,
} from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { cx } from "@/lib/format";
import {
  AC_TYPE_LABELS,
  MAX_CLAIM_PHOTOS,
  MAX_PREFERRED_DAYS_AHEAD,
  MAX_PREFERRED_WINDOWS,
  PHOTO_RECOMMENDED,
  PREFERRED_WINDOW_LABELS,
  SERVICE_TYPE_LABELS,
  formatWindowDate,
} from "@/lib/service-labels";
import { confirmPhoto, fetchCoverage, fetchMyAcUnits, type Coverage } from "@/services/acUnitService";
import { createServiceRequest, requestServiceRequestPhotoUpload } from "@/services/serviceRequestService";
import type { AcUnit, PhotoContentType, PreferredWindow, PreferredWindowName, ServiceType } from "@/types";

const STEPS = ["Plan & property", "HVAC system", "Issue", "Photos", "Visit preferences", "Review"];
const ALL_SERVICE_TYPES = Object.keys(SERVICE_TYPE_LABELS) as ServiceType[];
const WINDOWS = Object.keys(PREFERRED_WINDOW_LABELS) as PreferredWindowName[];
const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 2000;

interface SelectedPhoto {
  key: string;
  file: File;
  preview: string;
  progress: number;
  status: "ready" | "uploading" | "done" | "error";
}

function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export default function NewClaimPage() {
  return (
    <Suspense fallback={<PageLoader label="Loading" />}>
      <NewClaim />
    </Suspense>
  );
}

function NewClaim() {
  const router = useRouter();
  const preselected = useSearchParams().get("ac");

  const [units, setUnits] = useState<AcUnit[] | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [step, setStep] = useState(0);
  const [unitId, setUnitId] = useState(preselected ?? "");
  const [serviceType, setServiceType] = useState<ServiceType | "">("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [photoErrors, setPhotoErrors] = useState<string[]>([]);
  const [windows, setWindows] = useState<PreferredWindow[]>([]);
  const [windowDate, setWindowDate] = useState("");
  const [windowName, setWindowName] = useState<PreferredWindowName>("MORNING");
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // Revoke preview URLs when the page unmounts.
  const photosRef = useRef<SelectedPhoto[]>([]);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), []);

  useEffect(() => {
    Promise.all([fetchMyAcUnits(), fetchCoverage()])
      .then(([list, cov]) => {
        setUnits(list);
        setCoverage(cov);
      })
      .catch((err) => setLoadError(errorMessage(err)));
  }, []);

  if (loadError) return <Alert>{loadError}</Alert>;
  if (!units || !coverage) return <PageLoader label="Loading your plan and AC units" />;

  const purchase = coverage.purchase;
  const plan = purchase?.plan;
  const active = purchase?.status === "ACTIVE";
  const eligible = units.filter((u) => active && u.purchase_id === purchase?.id && !u.has_open_request);
  const selected = eligible.find((u) => String(u.id) === unitId) ?? eligible[0];
  const equipmentCovered =
    !plan?.covered_ac_types || (selected ? plan.covered_ac_types.includes(selected.ac_type) : false);
  const issueOptions = plan?.covered_service_types
    ? ALL_SERVICE_TYPES.filter((t) => plan.covered_service_types?.includes(t))
    : ALL_SERVICE_TYPES;
  const today = new Date();
  const minDate = isoDate(today);
  const maxDate = isoDate(new Date(today.getTime() + MAX_PREFERRED_DAYS_AHEAD * 86_400_000));

  const header = (
    <>
      <BackLink href="/dashboard/service-requests">Claims</BackLink>
      <PageHeader
        title="File a claim"
        description="Tell us about the problem. Our team reviews every claim before a technician visit is booked."
      />
    </>
  );

  if (!purchase || !active) {
    return (
      <div className="space-y-6">
        {header}
        <Alert tone="info">
          Claims can only be filed against an <strong>active</strong> protection plan.{" "}
          {purchase ? (
            <>
              Your plan is still awaiting approval - <Link href="/dashboard/my-plan" className="font-semibold underline">view my plan</Link>.
            </>
          ) : (
            <Link href="/plans" className="font-semibold underline">Browse plans</Link>
          )}
        </Alert>
      </div>
    );
  }

  if (eligible.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={<SnowflakeIcon />}
          title="No covered AC unit available for a new claim"
          description={
            units.length === 0
              ? "Register the HVAC equipment covered by your plan first."
              : "Each unit can have one open claim at a time, and it must be covered by your active plan."
          }
          action={
            <ButtonLink href={units.length === 0 ? "/dashboard/ac-units/new" : "/dashboard/ac-units"}>
              {units.length === 0 ? "Register an AC unit" : "View AC units"}
            </ButtonLink>
          }
        />
      </div>
    );
  }

  function next() {
    setStepError(null);
    if (step === 1 && !equipmentCovered) {
      setStepError(`Your ${plan?.name} plan does not cover this type of equipment.`);
      return;
    }
    if (step === 2) {
      if (!serviceType) return setStepError("Choose the type of issue.");
      if (description.trim().length < DESCRIPTION_MIN)
        return setStepError(`Please describe the issue in at least ${DESCRIPTION_MIN} characters.`);
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setStepError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const errors: string[] = [];
    const added: SelectedPhoto[] = [];
    for (const file of Array.from(files)) {
      if (photos.length + added.length >= MAX_CLAIM_PHOTOS) {
        errors.push(`You can attach up to ${MAX_CLAIM_PHOTOS} photos.`);
        break;
      }
      const problem = validatePhoto(file);
      if (problem) {
        errors.push(`${file.name}: ${problem}`);
        continue;
      }
      added.push({
        key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        file,
        preview: URL.createObjectURL(file),
        progress: 0,
        status: "ready",
      });
    }
    setPhotos((current) => [...current, ...added]);
    setPhotoErrors(errors);
  }

  function removePhoto(key: string) {
    setPhotos((current) => {
      const photo = current.find((p) => p.key === key);
      if (photo) URL.revokeObjectURL(photo.preview);
      return current.filter((p) => p.key !== key);
    });
  }

  function addWindow() {
    setStepError(null);
    if (!windowDate) return setStepError("Choose a date.");
    if (windowDate < minDate || windowDate > maxDate)
      return setStepError(`Choose a date between today and ${formatWindowDate(maxDate)}.`);
    if (windows.some((w) => w.date === windowDate && w.window === windowName))
      return setStepError("That date and time window is already on your list.");
    if (windows.length >= MAX_PREFERRED_WINDOWS)
      return setStepError(`You can choose up to ${MAX_PREFERRED_WINDOWS} preferred windows.`);
    setWindows((current) =>
      [...current, { date: windowDate, window: windowName }].sort(
        (a, b) => a.date.localeCompare(b.date) || WINDOWS.indexOf(a.window) - WINDOWS.indexOf(b.window),
      ),
    );
  }

  function patchPhoto(key: string, changes: Partial<SelectedPhoto>) {
    setPhotos((current) => current.map((p) => (p.key === key ? { ...p, ...changes } : p)));
  }

  async function submit() {
    if (submittingRef.current || !selected || !serviceType) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);

    let claimId: number;
    try {
      const created = await createServiceRequest({
        ac_unit_id: selected.id,
        service_type: serviceType,
        description: description.trim(),
        preferred_windows: windows,
      });
      claimId = created.id;
    } catch (err) {
      setSubmitError(errorMessage(err));
      submittingRef.current = false;
      setSubmitting(false);
      return;
    }

    // The claim exists now; upload photos one by one. Failures don't undo the claim.
    let failed = 0;
    for (const photo of photos) {
      patchPhoto(photo.key, { status: "uploading", progress: 0 });
      try {
        const grant = await requestServiceRequestPhotoUpload(claimId, "CUSTOMER", {
          filename: photo.file.name,
          content_type: photo.file.type as PhotoContentType,
          size_bytes: photo.file.size,
        });
        await postToS3(grant.upload, photo.file, (progress) => patchPhoto(photo.key, { progress }));
        await confirmPhoto(grant.photo_id);
        patchPhoto(photo.key, { status: "done", progress: 100 });
      } catch {
        failed += 1;
        patchPhoto(photo.key, { status: "error" });
      }
    }
    router.push(`/dashboard/service-requests/${claimId}?created=1${failed ? `&photos_failed=${failed}` : ""}`);
  }

  return (
    <div className="space-y-6">
      {header}

      <ol className="flex flex-wrap gap-2" aria-label="Claim steps">
        {STEPS.map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? "step" : undefined}
            className={cx(
              "rounded-full px-3 py-1 text-xs font-semibold ring-1",
              index === step && "bg-brand-600 text-white ring-brand-600",
              index < step && "bg-brand-50 text-brand-700 ring-brand-200",
              index > step && "bg-white text-slate-400 ring-slate-200",
            )}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      <Card className="space-y-5 p-5 sm:p-8">
        {stepError ? <Alert>{stepError}</Alert> : null}

        {step === 0 ? (
          <>
            <div className="rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-900 ring-1 ring-brand-100">
              Plan: <strong>{plan?.name}</strong> &middot; active
            </div>
            <Field label="Covered property and equipment" htmlFor="ac_unit">
              <Select id="ac_unit" value={selected ? String(selected.id) : ""} onChange={(e) => setUnitId(e.target.value)}>
                {eligible.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.brand} {unit.model_number} - {unit.address}, {unit.city}
                  </option>
                ))}
              </Select>
            </Field>
            {selected ? (
              <dl className="rounded-lg ring-1 ring-slate-200">
                <div className="px-4">
                  <DetailRow label="Address">{selected.address}</DetailRow>
                  <DetailRow label="City">{selected.city}</DetailRow>
                  <DetailRow label="State / ZIP">
                    {selected.state} {selected.zip_code}
                  </DetailRow>
                  <DetailRow label="Country">United States</DetailRow>
                </div>
              </dl>
            ) : null}
            <p className="text-sm text-slate-500">
              Property not listed?{" "}
              <Link href="/dashboard/ac-units/new" className="font-semibold text-brand-700 hover:underline">
                Register the equipment
              </Link>{" "}
              under your plan first.
            </p>
          </>
        ) : null}

        {step === 1 && selected ? (
          <>
            <dl className="rounded-lg ring-1 ring-slate-200">
              <div className="px-4">
                <DetailRow label="System type">{AC_TYPE_LABELS[selected.ac_type]}</DetailRow>
                <DetailRow label="Brand / model">
                  {selected.brand} {selected.model_number}
                </DetailRow>
                <DetailRow label="Serial number">{selected.serial_number ?? "Not provided"}</DetailRow>
              </div>
            </dl>
            {equipmentCovered ? (
              <p className="text-sm text-slate-600">
                {plan?.covered_ac_types
                  ? "This type of equipment is covered by your plan."
                  : "Your plan does not restrict equipment types."}{" "}
                Wrong type?{" "}
                <Link href={`/dashboard/ac-units/${selected.id}`} className="font-semibold text-brand-700 hover:underline">
                  Edit the unit
                </Link>
                .
              </p>
            ) : (
              <Alert>
                Your {plan?.name} plan does not cover {AC_TYPE_LABELS[selected.ac_type].toLowerCase()} equipment, so a
                claim can&apos;t be filed for this unit. Covered types:{" "}
                {plan?.covered_ac_types?.map((t) => AC_TYPE_LABELS[t]).join(", ")}.
              </Alert>
            )}
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Field label="Type of issue" htmlFor="service_type">
              <Select id="service_type" value={serviceType} onChange={(e) => setServiceType(e.target.value as ServiceType)}>
                <option value="" disabled>
                  Choose one
                </option>
                {issueOptions.map((type) => (
                  <option key={type} value={type}>
                    {SERVICE_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </Field>
            {plan?.covered_service_types ? (
              <p className="-mt-3 text-xs text-slate-500">Only issue types covered by your plan are listed.</p>
            ) : null}
            <Field
              label="Describe the issue"
              htmlFor="description"
              hint={`${description.trim().length} / ${DESCRIPTION_MAX} - when did it start? Any noises, smells, error codes or water?`}
            >
              <Textarea
                id="description"
                rows={5}
                maxLength={DESCRIPTION_MAX}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <p className="text-sm text-slate-600">
              Reference photos are optional but help our team review the claim.
              {serviceType && PHOTO_RECOMMENDED.includes(serviceType)
                ? " For leaks and visible damage they are especially useful."
                : ""}{" "}
              Photos can&apos;t show internal faults, so a technician will still inspect the system.
            </p>
            <label className="block cursor-pointer rounded-lg border-2 border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-600 hover:border-brand-400">
              <span className="font-semibold text-brand-700">Choose photos</span> - JPEG, PNG or WebP, up to 10 MB each,{" "}
              {MAX_CLAIM_PHOTOS} max
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                onChange={(e) => {
                  addPhotos(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            {photoErrors.length ? (
              <Alert>
                {photoErrors.map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </Alert>
            ) : null}
            {photos.length ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {photos.map((photo) => (
                  <li key={photo.key} className="overflow-hidden rounded-lg ring-1 ring-slate-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.preview} alt={photo.file.name} className="h-28 w-full object-cover" />
                    <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                      <span className="truncate text-xs text-slate-600">{photo.file.name}</span>
                      <button
                        type="button"
                        onClick={() => removePhoto(photo.key)}
                        className="text-xs font-semibold text-rose-600 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}

        {step === 4 ? (
          <>
            <Alert tone="info">
              These are your <strong>preferences</strong>, not a booking. Our team confirms the actual visit time with a
              technician who serves your area. Times are local to the property.
            </Alert>
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Field label="Date" htmlFor="window-date">
                <Input id="window-date" type="date" min={minDate} max={maxDate} value={windowDate} onChange={(e) => setWindowDate(e.target.value)} />
              </Field>
              <Field label="Time window" htmlFor="window-name">
                <Select id="window-name" value={windowName} onChange={(e) => setWindowName(e.target.value as PreferredWindowName)}>
                  {WINDOWS.map((w) => (
                    <option key={w} value={w}>
                      {PREFERRED_WINDOW_LABELS[w]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="button" variant="secondary" onClick={addWindow} disabled={windows.length >= MAX_PREFERRED_WINDOWS}>
                Add
              </Button>
            </div>
            {windows.length ? (
              <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
                {windows.map((w) => (
                  <li key={`${w.date}-${w.window}`} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span>
                      {formatWindowDate(w.date)} &middot; {PREFERRED_WINDOW_LABELS[w.window]}
                    </span>
                    <button
                      type="button"
                      className="text-xs font-semibold text-rose-600 hover:underline"
                      onClick={() => setWindows((current) => current.filter((x) => x !== w))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">
                Optional - add up to {MAX_PREFERRED_WINDOWS} windows in the next {MAX_PREFERRED_DAYS_AHEAD} days.
              </p>
            )}
          </>
        ) : null}

        {step === 5 && selected && serviceType ? (
          <>
            {submitError ? <Alert>{submitError}</Alert> : null}
            <dl className="rounded-lg ring-1 ring-slate-200">
              <div className="px-4">
                <DetailRow label="Plan">{plan?.name}</DetailRow>
                <DetailRow label="Property">
                  {selected.address}, {selected.city}, {selected.state} {selected.zip_code}, United States
                </DetailRow>
                <DetailRow label="System">
                  {AC_TYPE_LABELS[selected.ac_type]} &middot; {selected.brand} {selected.model_number}
                </DetailRow>
                <DetailRow label="Issue">{SERVICE_TYPE_LABELS[serviceType]}</DetailRow>
                <DetailRow label="Photos">{photos.length || "None"}</DetailRow>
                <DetailRow label="Preferred visits">
                  {windows.length
                    ? windows.map((w) => `${formatWindowDate(w.date)} ${w.window.toLowerCase()}`).join(", ")
                    : "No preference"}
                </DetailRow>
              </div>
            </dl>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Description</p>
              <p className="mt-1 text-sm whitespace-pre-line text-slate-700">{description.trim()}</p>
            </div>
            {submitting && photos.length ? (
              <ul className="space-y-2">
                {photos.map((photo) => (
                  <li key={photo.key} className="text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span className="truncate">{photo.file.name}</span>
                      <span>
                        {photo.status === "done" ? "Uploaded" : photo.status === "error" ? "Failed" : `${photo.progress}%`}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                      <div
                        className={cx("h-1.5 rounded-full", photo.status === "error" ? "bg-rose-500" : "bg-brand-500")}
                        style={{ width: `${photo.status === "error" ? 100 : photo.progress}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}

        <div className="flex justify-between gap-2 border-t border-slate-100 pt-5">
          {step === 0 ? (
            <ButtonLink href="/dashboard/service-requests" variant="ghost">
              Cancel
            </ButtonLink>
          ) : (
            <Button variant="ghost" onClick={back} disabled={submitting}>
              Back
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button onClick={next} disabled={step === 1 && !equipmentCovered}>
              Continue
            </Button>
          ) : (
            <Button onClick={() => void submit()} disabled={submitting}>
              {submitting ? "Submitting..." : "Submit claim"}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
