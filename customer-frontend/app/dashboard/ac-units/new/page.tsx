"use client";

import { useRouter } from "next/navigation";

import { AcUnitForm } from "@/components/ac-unit-form";
import { BackLink, Card, PageHeader } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { createAcUnit } from "@/services/acUnitService";

export default function NewAcUnitPage() {
  const router = useRouter();
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <BackLink href="/dashboard/ac-units">My AC Units</BackLink>
      <PageHeader
        title="Register an AC unit"
        description="Add the equipment covered by your plan. You can add condition photos on the next screen."
      />
      <Card className="p-5 sm:p-8">
        <AcUnitForm
          initial={{
            address: user?.address ?? "",
            city: user?.city ?? "",
            state: user?.state ?? "",
            zip_code: user?.zip_code ?? "",
          }}
          submitLabel="Register unit"
          onSubmit={async (payload) => {
            const unit = await createAcUnit(payload);
            router.push(`/dashboard/ac-units/${unit.id}?registered=1`);
          }}
          onCancel={() => router.push("/dashboard/ac-units")}
        />
      </Card>
    </div>
  );
}
