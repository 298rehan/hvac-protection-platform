import { HomePlanPreview } from "@/components/home-plan-preview";
import {
  ArrowRightIcon,
  BoltIcon,
  MapPinIcon,
  ShieldIcon,
  WrenchIcon,
} from "@/components/icons";
import { ButtonLink, Card, CheckIcon, SectionHeading } from "@/components/ui";

const VALUE_PROPS = [
  {
    title: "Licensed local technicians",
    body: "Every visit is performed by a background-checked technician licensed in your state, using parts rated for your climate.",
    icon: WrenchIcon,
  },
  {
    title: "Priority when it matters",
    body: "Members move to the front of the schedule during the first heat wave and the first cold snap, when call volume peaks.",
    icon: BoltIcon,
  },
  {
    title: "Regional pricing",
    body: "Service and operating costs differ by state, so your plan is priced for where you actually live rather than a national average.",
    icon: MapPinIcon,
  },
];

const STEPS = [
  {
    step: "1",
    title: "Tell us your region",
    body: "Create an account with your service address. Your state determines which plans are offered and what they cost.",
  },
  {
    step: "2",
    title: "Choose your coverage",
    body: "Compare Basic, Premium and Complete side by side with the exact price for your region, then enroll online.",
  },
  {
    step: "3",
    title: "We activate your plan",
    body: "Our service team reviews the enrollment and activates your coverage. You will see the status change in your dashboard.",
  },
];

const INCLUDED = [
  "Annual inspection by a licensed technician",
  "Seasonal maintenance and system tune-up",
  "Filter replacement on every visit",
  "Priority scheduling ahead of non-members",
  "No hidden trip charges for covered visits",
];

const HIGHLIGHTS = [
  { label: "Service states", value: "FL · TX · AZ · CA" },
  { label: "Emergency line", value: "24/7 on Complete" },
  { label: "Due at enrollment", value: "$0 today" },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-brand-950">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(72,148,197,0.22),transparent_55%)]"
        />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-16 lg:px-8 lg:py-28">
          <div className="animate-fade-in">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-100 ring-1 ring-white/15">
              <ShieldIcon className="h-4 w-4 text-brand-300" />
              Residential HVAC protection
            </p>
            <h1 className="mt-6 text-4xl font-bold leading-[1.1] tracking-tight text-balance text-white sm:text-5xl lg:text-[3.4rem]">
              HVAC protection plans built around your climate <span className="mt-2 block text-sm font-medium tracking-normal text-brand-300">CI/CD Deployment Test</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-brand-100/90">
              Year-round maintenance, priority scheduling and emergency coverage for your
              heating and cooling system. Plans and pricing are set by service region, so
              you only pay what makes sense where you live.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/plans" size="lg" variant="inverse">
                View plans and pricing
                <ArrowRightIcon className="h-4.5 w-4.5" />
              </ButtonLink>
              <ButtonLink
                href="/register"
                size="lg"
                variant="outline-inverse"
              >
                Create an account
              </ButtonLink>
            </div>

            <dl className="mt-12 grid max-w-xl grid-cols-1 gap-4 border-t border-white/10 pt-8 sm:grid-cols-3">
              {HIGHLIGHTS.map((item) => (
                <div key={item.label}>
                  <dt className="text-xs font-medium uppercase tracking-wider text-brand-300">
                    {item.label}
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-white">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20 sm:p-8">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/20 text-brand-200 ring-1 ring-brand-400/30">
                  <ShieldIcon />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">What every plan includes</p>
                  <p className="text-xs text-brand-200">Included at every coverage level</p>
                </div>
              </div>
              <ul className="mt-6 divide-y divide-white/10">
                {INCLUDED.map((item) => (
                  <li key={item} className="flex gap-3 py-3.5 text-sm text-brand-50">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/15">
                      <CheckIcon className="h-3.5 w-3.5 text-emerald-300" />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-brand-300">
                Demonstration project. Summit Air is a fictional company and no payment is
                ever processed.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <SectionHeading
          eyebrow="Why members stay"
          title="Maintenance that keeps working when the weather does not"
          description="A protection plan is really about two things: catching small problems during a scheduled visit, and getting a technician quickly when something fails."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {VALUE_PROPS.map((item) => (
            <Card key={item.title} className="hover-lift spotlight p-6 sm:p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                <item.icon />
              </span>
              <h3 className="mt-5 text-base font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Live plan preview - fetched from the API */}
      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <SectionHeading
            eyebrow="Plans and pricing"
            title="Priced for your service region"
            description="Choose your state to see the plans we currently offer there and what they cost."
            center
          />
          <div className="mt-10">
            <HomePlanPreview />
          </div>
          <div className="mt-10 text-center">
            <ButtonLink href="/plans" variant="secondary">
              Compare all plans
              <ArrowRightIcon className="h-4 w-4" />
            </ButtonLink>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <SectionHeading
          eyebrow="How it works"
          title="Three steps to coverage"
          center
        />
        <ol className="relative mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          <span
            aria-hidden
            className="absolute top-5 right-[16.66%] left-[16.66%] hidden h-px bg-slate-200 md:block"
          />
          {STEPS.map((item) => (
            <li key={item.step} className="relative text-center">
              <span className="relative mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white text-sm font-bold text-brand-700 ring-1 ring-brand-200 shadow-sm">
                {item.step}
              </span>
              <h3 className="mt-5 text-base font-semibold text-slate-900">{item.title}</h3>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-600">
                {item.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* CTA */}
      <section className="px-4 pb-16 sm:px-6 lg:px-8 lg:pb-24">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 rounded-2xl bg-brand-900 px-6 py-10 sm:px-10 sm:py-12 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Ready to protect your system?
            </h2>
            <p className="mt-3 max-w-xl text-brand-100/90">
              Create an account with your service address and we will show you the plans
              available in your region.
            </p>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-3 sm:w-auto sm:flex-row">
            <ButtonLink href="/register" size="lg" variant="inverse">
              Get started
              <ArrowRightIcon className="h-4.5 w-4.5" />
            </ButtonLink>
            <ButtonLink
              href="/plans"
              size="lg"
              variant="outline-inverse"
            >
              Browse plans
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
