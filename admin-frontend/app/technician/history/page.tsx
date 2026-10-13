"use client";

import { TechnicianShell } from "@/components/admin-shell";
import { TechnicianJobs } from "@/components/technician-jobs";

export default function TechnicianHistoryPage() {
  return (
    <TechnicianShell>
      <TechnicianJobs closed />
    </TechnicianShell>
  );
}
