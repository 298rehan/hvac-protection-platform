"use client";

import { TechnicianShell } from "@/components/admin-shell";
import { TechnicianJobs } from "@/components/technician-jobs";

export default function TechnicianJobsPage() {
  return (
    <TechnicianShell>
      <TechnicianJobs closed={false} />
    </TechnicianShell>
  );
}
