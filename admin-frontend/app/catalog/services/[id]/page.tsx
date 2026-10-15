"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { ServiceForm } from "@/components/service-form";
import { Alert, BackLink, PageHeader, PageLoader, TogglePill } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { fetchAdminService } from "@/services/marketplaceService";
import type { CatalogService } from "@/types";

export default function EditServicePage() {
  return (
    <AdminShell>
      <EditService />
    </AdminShell>
  );
}

function EditService() {
  const params = useParams<{ id: string }>();
  const serviceId = Number(params.id);
  const validId = Number.isInteger(serviceId) && serviceId > 0;

  const [service, setService] = useState<CatalogService | null>(null);
  const [loading, setLoading] = useState(validId);
  const [error, setError] = useState<string | null>(validId ? null : "Invalid service id.");

  useEffect(() => {
    if (!validId) return;
    fetchAdminService(serviceId)
      .then((found) => {
        if (found) setService(found);
        else setError("Service not found.");
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [validId, serviceId]);

  if (loading) return <PageLoader label="Loading service" />;

  return (
    <div className="space-y-6">
      <BackLink href="/catalog">Back to services</BackLink>
      {service ? (
        <>
          <PageHeader
            title={
              <span className="flex flex-wrap items-center gap-3">
                {service.name}
                <TogglePill on={service.is_active} onLabel="Active" offLabel="Inactive" />
              </span>
            }
            description={`${service.category.name} · /${service.slug}`}
          />
          <ServiceForm key={service.id} service={service} />
        </>
      ) : (
        <Alert>{error ?? "Service not found."}</Alert>
      )}
    </div>
  );
}
