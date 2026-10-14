import type { Metadata } from "next";

import { ContactForm } from "@/components/contact-form";
import { SectionHeading } from "@/components/ui";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Send Summit Air a question or complaint about your HVAC protection plan.",
};

export default function ContactPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-20">
      <SectionHeading
        eyebrow="Contact us"
        title="How can we help?"
        description="Questions about a plan, a service visit or a complaint - send us a message and our team will reply by email."
      />
      <div className="mt-10">
        <ContactForm />
      </div>
    </section>
  );
}
