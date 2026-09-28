import type { Metadata } from "next";

import { PlanCatalogue } from "@/components/plan-catalogue";
import { Card } from "@/components/ui";

export const metadata: Metadata = {
  title: "HVAC Protection Plans",
  description:
    "Compare Summit Air protection plans and see pricing for your service region.",
};

const FAQ = [
  {
    question: "Why does the price change by state?",
    answer:
      "Labor rates, licensing, parts availability and how hard a system works all differ by region. Pricing each state separately keeps plans fair rather than averaging costs across the country.",
  },
  {
    question: "When does my coverage start?",
    answer:
      "After you enroll, your plan sits in a Pending state while our service team reviews it. Once it is approved the status changes to Active and you will receive a confirmation email.",
  },
  {
    question: "Can I change plans later?",
    answer:
      "Yes. Cancel your current plan from the My Plan page and enroll in a different one. You can hold one active plan at a time.",
  },
];

export default function PlansPage() {
  return (
    <>
      <section className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            HVAC protection plans
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
            Every plan covers scheduled maintenance and priority service. The difference
            is how often we visit and how much of a failure is covered. Prices below come
            straight from our service region pricing.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <PlanCatalogue />
      </section>

      <section className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Common questions
          </h2>
          <div className="mt-8 space-y-4">
            {FAQ.map((item) => (
              <Card key={item.question} className="p-6">
                <h3 className="text-base font-semibold text-slate-900">
                  {item.question}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {item.answer}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
