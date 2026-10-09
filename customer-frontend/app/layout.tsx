import type { Metadata } from "next";
import type { ReactNode } from "react";

import { CursorTrail } from "@/components/cursor-trail";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Summit Air | HVAC Protection Plans",
    template: "%s | Summit Air",
  },
  description:
    "Residential HVAC maintenance and protection plans with regional pricing for Florida, Texas, Arizona and California.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col bg-white font-sans text-slate-800 antialiased">
        <AuthProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </AuthProvider>
        <CursorTrail />
      </body>
    </html>
  );
}
