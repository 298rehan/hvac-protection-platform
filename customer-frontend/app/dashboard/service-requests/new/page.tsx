"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";

import { Field, Select, Textarea } from "@/components/form";
import { SnowflakeIcon } from "@/components/icons";
import {
  Alert,
  BackLink,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  PageLoader,
} from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { PHOTO_RECOMMENDED, SERVICE_TYPE_LABELS } from "@/lib/service-labels";
import { fetchCoverage, fetchMyAcUnits, type Coverage } from "@/services/acUnitService";
import { createServiceRequest } from "@/services/serviceRequestService";
import type { AcUnit, ServiceType } from "@/types";

const SERVICE_TYPES = Object.keys(SERVICE_TYPE_LABELS) as ServiceType[];

export default function NewServiceRequestPage() {
  return (
    <Suspense fallback={<PageLoader label="Loading" />}>
      <NewServiceRequest />
    </Suspense>
  );
}

function NewServiceRequest() {
  const router = useRouter();
  const preselected = useSearchParams().get("ac");

  const [units, setUnits] = useState<AcUnit[] | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [unitId, setUnitId] = useState(preselected ?? "");
  const [serviceType, setServiceType] = useState<ServiceType>("NOT_COOLING");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchMyAcUnits(), fetchCoverage()])
      .then(([list, cov]) => {
        setUnits(list);
        setCoverage(cov);
      })
      .catch((err) => setLoadError(errorMessage(err)));
  }, []);

  if (loadError) return <Alert>{loadError}</Alert>;
  if (!units || !coverage) return <PageLoader label="Loading your AC units" />;

  const purchase = coverage.purchase;
  // Only units on the active plan without an open request can be serviced.
  const eligible = units.filter(
    (u) => purchase && purchase.status === "ACTIVE" && u.purchase_id === purchase.id && !u.has_open_request,
  );
  const selectedId = eligible.some((u) => String(u.id) === unitId) ? unitId : String(eligible[0]?.id ?? "");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (description.trim().length < 10) {
      setError("Please describe the issue in at least 10 characters.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createServiceRequest({
        ac_unit_id: Number(selectedId),
        service_type: serviceType,
        description: description.trim(),
      });
      router.push(`/dashboard/service-requests/${created.id}?created=1`);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  const header = (
    <>
      <BackLink href="/dashboard/service-requests">Service Requests</BackLink>
      <PageHeader
        title="Request service"
        description="Tell us what is wrong. You can attach photos on the next screen."
      />
    </>
  );

  if (!purchase || purchase.status !== "ACTIVE") {
    return (
      <div className="space-y-6">
        {header}
        <Alert tone="info">
          Service requests need an active protection plan.{" "}
          {purchase ? "Your plan is still awaiting approval." : <Link href="/plans" className="font-semibold underline">Browse plans</Link>}
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
          title="No AC unit available for a new request"
          description={
            units.length === 0
              ? "Register an AC unit under your plan first."
              : "Each unit can have one open request at a time, and it must be covered by your active plan."
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

  return (
    <div className="space-y-6">
      {header}
      <Card className="p-5 sm:p-8">
        <form onSubmit={submit} className="space-y-5">
          {error ? <Alert>{error}</Alert> : null}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="AC unit" htmlFor="ac_unit">
              <Select id="ac_unit" value={selectedId} onChange={(e) => setUnitId(e.target.value)}>
                {eligible.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.brand} {unit.model_number} - {unit.address}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="What do you need?" htmlFor="service_type">
              <Select
                id="service_type"
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value as ServiceType)}
              >
                {SERVICE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {SERVICE_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {PHOTO_RECOMMENDED.includes(serviceType) ? (
            <Alert tone="info">
              Photos of the {serviceType === "WATER_LEAK" ? "leak and where the water collects" : "damage"} help
              our team judge urgency and send a technician with the right parts. You can add them after
              submitting. Photos cannot show internal faults, so a technician will still inspect the unit.
            </Alert>
          ) : null}

          <Field
            label="Describe the issue"
            htmlFor="description"
            hint="When did it start? Any noises, smells, error codes or water?"
          >
            <Textarea
              id="description"
              required
              minLength={10}
              maxLength={2000}
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-5">
            <ButtonLink href="/dashboard/service-requests" variant="ghost">
              Cancel
            </ButtonLink>
            <Button type="submit" disabled={saving}>
              {saving ? "Submitting..." : "Submit request"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
