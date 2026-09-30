import type { Metadata } from "next";

import { ChevronDownIcon } from "@/components/icons";
import { PlanCatalogue } from "@/components/plan-catalogue";

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
      <section className="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-7xl px-4 py-14 text-center sm:px-6 lg:px-8 lg:py-20">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">
            Plans and pricing
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-balance text-slate-900 sm:text-5xl">
            HVAC protection plans
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-pretty text-slate-600 sm:text-lg">
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
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Common questions
          </h2>
          <div className="mt-10 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {FAQ.map((item, index) => (
              <details key={item.question} className="group" open={index === 0}>
                <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left text-base font-semibold text-slate-900 transition-colors hover:bg-slate-50 sm:px-6">
                  {item.question}
                  <ChevronDownIcon className="h-5 w-5 text-slate-400 transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <p className="px-5 pb-5 text-sm leading-relaxed text-slate-600 sm:px-6">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
