import type { Metadata } from "next";
import type { ReactNode } from "react";

import { CursorGlow } from "@/components/cursor-glow";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Summit Air Admin",
    template: "%s | Summit Air Admin",
  },
  description:
    "Administration panel for HVAC protection plans, regional pricing, customers and enrollments.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-slate-100 font-sans text-slate-800 antialiased">
        <AuthProvider>{children}</AuthProvider>
        <CursorGlow />
      </body>
    </html>
  );
}
