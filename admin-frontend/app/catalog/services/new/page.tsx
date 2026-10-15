"use client";

import { AdminShell } from "@/components/admin-shell";
import { ServiceForm } from "@/components/service-form";
import { BackLink, PageHeader } from "@/components/ui";

export default function NewServicePage() {
  return (
    <AdminShell>
      <div className="space-y-6">
        <BackLink href="/catalog">Back to services</BackLink>
        <PageHeader title="New service" description="Add a service customers can book on its own or as part of a custom plan." />
        <ServiceForm service={null} />
      </div>
    </AdminShell>
  );
}
