"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AcUnitForm } from "@/components/ac-unit-form";
import { PhotoGallery } from "@/components/photo-gallery";
import { PhotoUploader } from "@/components/photo-uploader";
import {
  Alert,
  BackLink,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  DetailRow,
  PageHeader,
  PageLoader,
} from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { AC_TYPE_LABELS, CONDITION_LABELS } from "@/lib/service-labels";
import {
  attachAcUnitToCurrentPlan,
  deleteAcUnit,
  fetchAcUnit,
  fetchCoverage,
  requestAcUnitPhotoUpload,
  updateAcUnit,
  type Coverage,
} from "@/services/acUnitService";
import type { AcUnit } from "@/types";

export default function AcUnitDetailPage() {
  const params = useParams<{ id: string }>();
  const unitId = Number(params.id);
  const router = useRouter();

  const [unit, setUnit] = useState<AcUnit | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    return fetchAcUnit(unitId)
      .then(setUnit)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setError(errorMessage(err));
      });
  }, [unitId]);

  useEffect(() => {
    void reload();
    fetchCoverage()
      .then(setCoverage)
      .catch(() => setCoverage({ purchase: null, maxUnits: null }));
  }, [reload]);

  // Shown once after registration (read from the URL without useSearchParams).
  useEffect(() => {
    if (window.location.search.includes("registered=1")) {
      const id = window.setTimeout(
        () => setNotice("AC unit registered. You can add condition photos below - they are optional."),
        0,
      );
      return () => window.clearTimeout(id);
    }
  }, []);

  if (notFound) {
    return (
      <div className="space-y-6">
        <BackLink href="/dashboard/ac-units">My AC Units</BackLink>
        <Alert>This AC unit was not found.</Alert>
      </div>
    );
  }
  if (!unit) return error ? <Alert>{error}</Alert> : <PageLoader label="Loading AC unit" />;

  const purchase = coverage?.purchase ?? null;
  const onCurrentPlan = purchase !== null && unit.purchase_id === purchase.id;

  async function attach() {
    setBusy(true);
    setError(null);
    try {
      setUnit(await attachAcUnitToCurrentPlan(unitId));
      setNotice("This unit is now covered by your current plan.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Remove this AC unit? Its photos will be deleted too.")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAcUnit(unitId);
      router.push("/dashboard/ac-units");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <BackLink href="/dashboard/ac-units">My AC Units</BackLink>
      <PageHeader
        title={`${unit.brand} ${unit.model_number}`}
        description={AC_TYPE_LABELS[unit.ac_type]}
        actions={
          onCurrentPlan && !unit.has_open_request ? (
            <ButtonLink href={`/dashboard/service-requests/new?ac=${unit.id}`}>Request service</ButtonLink>
          ) : unit.has_open_request ? (
            <ButtonLink href="/dashboard/service-requests" variant="secondary">
              View open request
            </ButtonLink>
          ) : null
        }
      />

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}

      {purchase && !onCurrentPlan ? (
        <Alert tone="info">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              This unit is not covered by your current plan ({purchase.plan.name}). Attach it to request
              service.
            </span>
            <Button size="sm" onClick={() => void attach()} disabled={busy}>
              Attach to current plan
            </Button>
          </div>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          {editing ? (
            <Card className="p-5 sm:p-8">
              <AcUnitForm
                initial={unit}
                submitLabel="Save changes"
                onSubmit={async (payload) => {
                  setUnit(await updateAcUnit(unitId, payload));
                  setEditing(false);
                  setNotice("Changes saved.");
                }}
                onCancel={() => setEditing(false)}
              />
            </Card>
          ) : (
            <Card>
              <CardHeader
                title="Unit details"
                action={
                  <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                    Edit
                  </Button>
                }
              />
              <dl className="px-5 py-2 sm:px-6">
                <DetailRow label="Brand">{unit.brand}</DetailRow>
                <DetailRow label="Model number">{unit.model_number}</DetailRow>
                <DetailRow label="Serial number">{unit.serial_number ?? "—"}</DetailRow>
                <DetailRow label="System type">{AC_TYPE_LABELS[unit.ac_type]}</DetailRow>
                <DetailRow label="Installed">{formatDate(unit.installation_date)}</DetailRow>
                <DetailRow label="Reported condition">{CONDITION_LABELS[unit.reported_condition]}</DetailRow>
                <DetailRow label="Address">
                  {unit.address}, {unit.city}, {unit.state} {unit.zip_code}
                </DetailRow>
                <DetailRow label="Plan">{unit.plan_name ?? "Not on a plan"}</DetailRow>
              </dl>
              {unit.notes ? (
                <p className="mx-5 mb-5 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-100 sm:mx-6">
                  {unit.notes}
                </p>
              ) : null}
            </Card>
          )}

          <Card>
            <CardHeader
              title="Condition photos"
              description="Visible condition when you registered the unit."
            />
            <div className="space-y-6 px-5 py-5 sm:px-6">
              <PhotoGallery
                photos={unit.photos}
                onRefresh={() => void reload()}
                deletableCategories={["INITIAL"]}
                emptyText="No condition photos yet."
              />
              <div className="border-t border-slate-100 pt-5">
                <PhotoUploader
                  title="Add condition photos"
                  requestUpload={(file) => requestAcUnitPhotoUpload(unitId, file)}
                  onUploaded={() => void reload()}
                />
              </div>
            </div>
          </Card>
        </div>

        <Card className="h-fit p-5 sm:p-6">
          <p className="text-sm font-semibold text-slate-900">Remove this unit</p>
          <p className="mt-1 text-sm text-slate-500">
            Units with service history are kept as a record and cannot be removed.
          </p>
          <Button variant="danger" size="sm" className="mt-4" onClick={() => void remove()} disabled={busy}>
            Remove unit
          </Button>
        </Card>
      </div>
    </div>
  );
}
