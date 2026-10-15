"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { Field, Input, Select, Textarea } from "@/components/form";
import { ShieldIcon } from "@/components/icons";
import { postToS3, validate as validatePhoto } from "@/components/photo-uploader";
import {
  Alert,
  BackLink,
  Button,
  ButtonLink,
  CheckIcon,
  Card,
  EmptyState,
  PageHeader,
  PageLoader,
} from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cx } from "@/lib/format";
import { MAX_CLAIM_PHOTOS, PREFERRED_WINDOW_LABELS, REQUEST_STATUS_LABELS } from "@/lib/service-labels";
import { confirmPhoto, fetchCoverage, fetchMyAcUnits, type Coverage } from "@/services/acUnitService";
import { fetchAvailability } from "@/services/marketplaceService";
import { fetchRegions } from "@/services/planService";
import { createServiceRequest, requestServiceRequestPhotoUpload } from "@/services/serviceRequestService";
import type { AcUnit, PhotoContentType, PreferredWindowName, Region, ServiceRequestDetail, ServiceType } from "@/types";

/** The issue choices shown to customers, mapped to the backend's service types. */
const ISSUES: { value: ServiceType; label: string }[] = [
  { value: "NOT_COOLING", label: "AC not cooling" },
  { value: "SYSTEM_NOT_STARTING", label: "AC not turning on" },
  { value: "NOT_HEATING", label: "Heating problem" },
  { value: "WATER_LEAK", label: "Water leakage" },
  { value: "STRANGE_NOISE", label: "Unusual noise" },
  { value: "ROUTINE_MAINTENANCE", label: "Maintenance / cleaning" },
  { value: "OTHER", label: "Other issue" },
];
const WINDOWS = Object.keys(PREFERRED_WINDOW_LABELS) as PreferredWindowName[];
const DESCRIPTION_MAX = 2000;
const OTHER_MIN = 10;
const NEW_ADDRESS = "new";

interface SelectedPhoto {
  key: string;
  file: File;
  preview: string;
  progress: number;
  status: "ready" | "uploading" | "done" | "error";
}

interface Address {
  address: string;
  city: string;
  state: string;
  zip_code: string;
}

function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return isoDate(d);
}

export default function NewClaimPage() {
  return (
    <Suspense fallback={<PageLoader label="Loading" />}>
      <NewClaim />
    </Suspense>
  );
}

function NewClaim() {
  const { user } = useAuth();

  const [units, setUnits] = useState<AcUnit[] | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [locationId, setLocationId] = useState<string>("");
  const [newAddress, setNewAddress] = useState<Address>({ address: "", city: "", state: "", zip_code: "" });
  const [serviceType, setServiceType] = useState<ServiceType | "">("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [photoErrors, setPhotoErrors] = useState<string[]>([]);
  const [visitDate, setVisitDate] = useState("");
  const [visitWindow, setVisitWindow] = useState<PreferredWindowName | "">("");
  const [availability, setAvailability] = useState<Record<string, boolean>>({});

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<ServiceRequestDetail | null>(null);
  const [failedUploads, setFailedUploads] = useState(0);
  const inFlight = useRef(false);
  const photosRef = useRef<SelectedPhoto[]>([]);

  useEffect(() => {
    Promise.all([fetchMyAcUnits(), fetchCoverage(), fetchRegions()])
      .then(([unitList, cov, regionList]) => {
        setUnits(unitList);
        setCoverage(cov);
        setRegions(regionList);
        const purchaseId = cov.purchase?.id;
        const covered = unitList.filter((u) => u.purchase_id === purchaseId && !u.has_open_request);
        setLocationId(covered.length ? String(covered[0].id) : NEW_ADDRESS);
      })
      .catch((err) => setLoadError(errorMessage(err)));
  }, []);

  // Prefill the "different address" fields from the profile once it's known.
  const profileAddress = useMemo<Address>(
    () => ({
      address: user?.address ?? "",
      city: user?.city ?? "",
      state: user?.state ?? "",
      zip_code: user?.zip_code ?? "",
    }),
    [user],
  );
  const [prefilled, setPrefilled] = useState(false);
  if (!prefilled && user) {
    setPrefilled(true);
    setNewAddress(profileAddress);
  }

  // Revoke preview URLs when leaving the page.
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), []);

  const purchase = coverage?.purchase ?? null;
  const savedLocations = (units ?? []).filter((u) => u.purchase_id === purchase?.id);
  const selectedUnit = savedLocations.find((u) => String(u.id) === locationId) ?? null;
  const location: Address | null = selectedUnit
    ? { address: selectedUnit.address, city: selectedUnit.city, state: selectedUnit.state, zip_code: selectedUnit.zip_code }
    : locationId === NEW_ADDRESS
      ? newAddress
      : null;
  const locationComplete = Boolean(
    location && location.address.trim() && location.city.trim() && location.state && location.zip_code.trim(),
  );

  // Availability hints for the chosen address (a preference is allowed either way).
  const availabilityKey = locationComplete && location ? `${location.state}|${location.zip_code.trim()}` : "";
  useEffect(() => {
    if (!availabilityKey) return;
    const [state, zip] = availabilityKey.split("|");
    let cancelled = false;
    fetchAvailability(state, zip, 30)
      .then((slots) => {
        if (cancelled) return;
        const map: Record<string, boolean> = {};
        for (const slot of slots) map[`${slot.date}|${slot.window}`] = slot.available;
        setAvailability(map);
      })
      .catch(() => {
        if (!cancelled) setAvailability({});
      });
    return () => {
      cancelled = true;
    };
  }, [availabilityKey]);

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const problems: string[] = [];
    const next = [...photos];
    for (const file of Array.from(files)) {
      if (next.length >= MAX_CLAIM_PHOTOS) {
        problems.push(`You can attach up to ${MAX_CLAIM_PHOTOS} photos.`);
        break;
      }
      const problem = validatePhoto(file);
      if (problem) {
        problems.push(`${file.name}: ${problem}`);
        continue;
      }
      next.push({
        key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        file,
        preview: URL.createObjectURL(file),
        progress: 0,
        status: "ready",
      });
    }
    setPhotos(next);
    setPhotoErrors(problems);
  }

  function removePhoto(key: string) {
    setPhotos((current) => {
      const photo = current.find((p) => p.key === key);
      if (photo) URL.revokeObjectURL(photo.preview);
      return current.filter((p) => p.key !== key);
    });
  }

  function updatePhoto(key: string, changes: Partial<SelectedPhoto>) {
    setPhotos((current) => current.map((p) => (p.key === key ? { ...p, ...changes } : p)));
  }

  function validateForm(): Record<string, string> {
    const problems: Record<string, string> = {};
    if (!locationComplete) problems.location = "Choose a saved location or enter the full service address.";
    if (!serviceType) problems.serviceType = "Choose the type of issue.";
    if (serviceType === "OTHER" && description.trim().length < OTHER_MIN)
      problems.description = `Please describe the issue in at least ${OTHER_MIN} characters.`;
    if (!visitDate) problems.visitDate = "Choose a preferred date.";
    else if (visitDate < tomorrow()) problems.visitDate = "Choose a date from tomorrow onwards.";
    if (!visitWindow) problems.visitWindow = "Choose a preferred time window.";
    return problems;
  }

  async function uploadAll(claimId: number): Promise<number> {
    let failed = 0;
    for (const photo of photos) {
      updatePhoto(photo.key, { status: "uploading", progress: 0 });
      try {
        const ticket = await requestServiceRequestPhotoUpload(claimId, "CUSTOMER", {
          filename: photo.file.name,
          content_type: photo.file.type as PhotoContentType,
          size_bytes: photo.file.size,
        });
        await postToS3(ticket.upload, photo.file, (progress) => updatePhoto(photo.key, { progress }));
        await confirmPhoto(ticket.photo_id);
        updatePhoto(photo.key, { status: "done", progress: 100 });
      } catch {
        failed += 1;
        updatePhoto(photo.key, { status: "error" });
      }
    }
    return failed;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    setSubmitError(null);
    const problems = validateForm();
    setErrors(problems);
    if (Object.keys(problems).length > 0 || !location || !serviceType || !visitWindow) return;

    inFlight.current = true;
    setSubmitting(true);
    try {
      const where = selectedUnit
        ? { ac_unit_id: selectedUnit.id }
        : {
            address: location.address.trim(),
            city: location.city.trim(),
            state: location.state,
            zip_code: location.zip_code.trim(),
          };
      const claim = await createServiceRequest({
        ...where,
        service_type: serviceType,
        description: description.trim(),
        preferred_windows: [{ date: visitDate, window: visitWindow }],
      });
      const failed = photos.length ? await uploadAll(claim.id) : 0;
      setFailedUploads(failed);
      setCreated(claim);
    } catch (err) {
      setSubmitError(errorMessage(err));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  if (loadError) return <Alert>{loadError}</Alert>;
  if (units === null || coverage === null) return <PageLoader label="Loading your plan" />;

  if (!purchase || purchase.status !== "ACTIVE") {
    return (
      <div className="space-y-6">
        <BackLink href="/dashboard/service-requests">Back to claims</BackLink>
        <EmptyState
          icon={<ShieldIcon />}
          title={purchase ? "Your plan isn't active yet" : "No active protection plan"}
          description={
            purchase
              ? "You can open a claim as soon as our team activates your plan."
              : "Claims are available once you have an active protection plan."
          }
          action={
            <ButtonLink href={purchase ? "/dashboard/my-plan" : "/plans"}>
              {purchase ? "View my plan" : "Browse plans"}
            </ButtonLink>
          }
        />
      </div>
    );
  }

  if (created) {
    return (
      <Card className="mx-auto max-w-xl p-8 text-center" role="status">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
          <CheckIcon className="h-6 w-6" />
        </span>
        <h2 className="mt-5 text-xl font-semibold text-slate-900">Claim submitted</h2>
        <p className="mt-2 text-sm text-slate-600">
          Reference <span className="font-semibold text-slate-900">#{created.id}</span> - status:{" "}
          <span className="font-semibold text-slate-900">{REQUEST_STATUS_LABELS[created.status]}</span>
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          Our team will review it and confirm your appointment once a technician is scheduled.
        </p>
        {failedUploads > 0 ? (
          <div className="mt-4 text-left">
            <Alert tone="info">
              {failedUploads} photo{failedUploads === 1 ? "" : "s"} could not be uploaded. You can add
              {failedUploads === 1 ? " it" : " them"} again from the claim page.
            </Alert>
          </div>
        ) : null}
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink href={`/dashboard/service-requests/${created.id}`}>View claim</ButtonLink>
          <ButtonLink href="/dashboard" variant="secondary">
            Back to dashboard
          </ButtonLink>
        </div>
      </Card>
    );
  }

  const today = tomorrow();
  return (
    <div className="space-y-6">
      <BackLink href="/dashboard/service-requests">Back to claims</BackLink>
      <PageHeader
        title="Open a claim"
        description={`Covered by your ${purchase.plan.name} plan. Tell us where and what the problem is.`}
      />

      <Card className="p-5 sm:p-7">
        <form onSubmit={handleSubmit} noValidate className="space-y-7">
          {submitError ? <Alert>{submitError}</Alert> : null}

          {/* 1. Service location */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">Service location</h2>
            {savedLocations.length ? (
              <div className="grid gap-2">
                {savedLocations.map((unit) => (
                  <label
                    key={unit.id}
                    className={cx(
                      "flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 text-sm",
                      locationId === String(unit.id) ? "border-brand-500 bg-brand-50/60" : "border-slate-200",
                      unit.has_open_request && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <input
                      type="radio"
                      name="location"
                      className="mt-1"
                      disabled={unit.has_open_request}
                      checked={locationId === String(unit.id)}
                      onChange={() => setLocationId(String(unit.id))}
                    />
                    <span>
                      <span className="block font-medium text-slate-900">{unit.address}</span>
                      <span className="text-slate-500">
                        {unit.city}, {unit.state} {unit.zip_code}
                        {unit.has_open_request ? " - already has an open claim" : ""}
                      </span>
                    </span>
                  </label>
                ))}
                <label
                  className={cx(
                    "flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm",
                    locationId === NEW_ADDRESS ? "border-brand-500 bg-brand-50/60" : "border-slate-200",
                  )}
                >
                  <input
                    type="radio"
                    name="location"
                    checked={locationId === NEW_ADDRESS}
                    onChange={() => setLocationId(NEW_ADDRESS)}
                  />
                  <span className="font-medium text-slate-900">Use a different address</span>
                </label>
              </div>
            ) : null}

            {locationId === NEW_ADDRESS ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Street address" htmlFor="claim-address" className="sm:col-span-2">
                  <Input
                    id="claim-address"
                    autoComplete="street-address"
                    value={newAddress.address}
                    onChange={(e) => setNewAddress({ ...newAddress, address: e.target.value })}
                  />
                </Field>
                <Field label="City" htmlFor="claim-city">
                  <Input
                    id="claim-city"
                    autoComplete="address-level2"
                    value={newAddress.city}
                    onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="State" htmlFor="claim-state">
                    <Select
                      id="claim-state"
                      value={newAddress.state}
                      onChange={(e) => setNewAddress({ ...newAddress, state: e.target.value })}
                    >
                      <option value="">Select</option>
                      {regions.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.code}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="ZIP code" htmlFor="claim-zip">
                    <Input
                      id="claim-zip"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      value={newAddress.zip_code}
                      onChange={(e) => setNewAddress({ ...newAddress, zip_code: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
            ) : null}

            {locationComplete && location ? (
              <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-100">
                <span className="font-medium text-slate-900">Technician visits: </span>
                {location.address}, {location.city}, {location.state} {location.zip_code}
              </p>
            ) : null}
            {errors.location ? <p className="text-xs font-medium text-rose-600">{errors.location}</p> : null}
          </section>

          {/* 2. Issue type */}
          <section className="space-y-3">
            <Field label="Issue type" htmlFor="claim-issue" error={errors.serviceType}>
              <Select
                id="claim-issue"
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value as ServiceType)}
              >
                <option value="">Choose an issue</option>
                {ISSUES.map((issue) => (
                  <option key={issue.value} value={issue.value}>
                    {issue.label}
                  </option>
                ))}
              </Select>
            </Field>
          </section>

          {/* 3. Photos */}
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Photos (optional)</h2>
              <p className="mt-1 text-xs text-slate-500">
                JPEG, PNG or WebP, up to 10 MB each, {MAX_CLAIM_PHOTOS} photos max.
              </p>
            </div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => {
                addPhotos(e.target.files);
                e.target.value = "";
              }}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
            />
            {photoErrors.map((problem) => (
              <p key={problem} className="text-xs font-medium text-rose-600">
                {problem}
              </p>
            ))}
            {photos.length ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {photos.map((photo) => (
                  <li key={photo.key} className="overflow-hidden rounded-lg ring-1 ring-slate-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.preview} alt={photo.file.name} className="h-28 w-full object-cover" />
                    <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs">
                      <span className="truncate text-slate-600">
                        {photo.status === "uploading"
                          ? `${photo.progress}%`
                          : photo.status === "done"
                            ? "Uploaded"
                            : photo.status === "error"
                              ? "Failed"
                              : photo.file.name}
                      </span>
                      {photo.status === "ready" ? (
                        <button
                          type="button"
                          onClick={() => removePhoto(photo.key)}
                          className="shrink-0 font-semibold text-rose-600 hover:text-rose-700"
                          aria-label={`Remove ${photo.file.name}`}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          {/* 4. Preferred appointment */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">Preferred appointment</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date" htmlFor="claim-date" error={errors.visitDate}>
                <Input
                  id="claim-date"
                  type="date"
                  min={today}
                  value={visitDate}
                  onChange={(e) => setVisitDate(e.target.value)}
                />
              </Field>
              <Field label="Time window" htmlFor="claim-window" error={errors.visitWindow}>
                <Select
                  id="claim-window"
                  value={visitWindow}
                  onChange={(e) => setVisitWindow(e.target.value as PreferredWindowName)}
                >
                  <option value="">Choose a time</option>
                  {WINDOWS.map((w) => {
                    const known = visitDate ? availability[`${visitDate}|${w}`] : undefined;
                    return (
                      <option key={w} value={w}>
                        {PREFERRED_WINDOW_LABELS[w]}
                        {known === true ? " - technician available" : known === false ? " - limited availability" : ""}
                      </option>
                    );
                  })}
                </Select>
              </Field>
            </div>
            <p className="text-xs text-slate-500">
              This is a preferred time. Your appointment is confirmed once we accept the claim and
              schedule a technician.
            </p>
          </section>

          {/* 5. Description */}
          <Field
            label={serviceType === "OTHER" ? "Describe the issue" : "Description (optional)"}
            htmlFor="claim-description"
            hint={`${description.trim().length} / ${DESCRIPTION_MAX}`}
            error={errors.description}
          >
            <Textarea
              id="claim-description"
              rows={4}
              maxLength={DESCRIPTION_MAX}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Anything that helps the technician, e.g. when it started or error codes."
            />
          </Field>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <Link href="/dashboard/service-requests" className="text-sm font-medium text-slate-500 hover:text-slate-800">
              Cancel
            </Link>
            <Button type="submit" disabled={submitting} className="sm:min-w-40">
              {submitting ? (photos.some((p) => p.status === "uploading") ? "Uploading photos..." : "Submitting...") : "Submit Claim"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
