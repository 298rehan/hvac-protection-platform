import { ButtonLink, Card, CheckIcon, SectionHeading } from "@/components/ui";
import { HomePlanPreview } from "@/components/home-plan-preview";

const VALUE_PROPS = [
  {
    title: "Licensed local technicians",
    body: "Every visit is performed by a background-checked technician licensed in your state, using parts rated for your climate.",
  },
  {
    title: "Priority when it matters",
    body: "Members move to the front of the schedule during the first heat wave and the first cold snap, when call volume peaks.",
  },
  {
    title: "Regional pricing",
    body: "Service and operating costs differ by state, so your plan is priced for where you actually live rather than a national average.",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Tell us your region",
    body: "Create an account with your service address. Your state determines which plans are offered and what they cost.",
  },
  {
    step: "02",
    title: "Choose your coverage",
    body: "Compare Basic, Premium and Complete side by side with the exact price for your region, then enroll online.",
  },
  {
    step: "03",
    title: "We activate your plan",
    body: "Our service team reviews the enrollment and activates your coverage. You will see the status change in your dashboard.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-brand-900">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-24 lg:px-8">
          <div>
            <p className="inline-flex items-center rounded-full bg-brand-800 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-100 ring-1 ring-brand-700">
              Serving FL &middot; TX &middot; AZ &middot; CA
            </p>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
              HVAC protection plans built around your climate
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-brand-100">
              Year-round maintenance, priority scheduling and emergency coverage for your
              heating and cooling system. Plans and pricing are set by service region, so
              you only pay what makes sense where you live.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/plans" size="lg">
                View plans and pricing
              </ButtonLink>
              <ButtonLink
                href="/register"
                size="lg"
                variant="secondary"
                className="bg-transparent text-white ring-brand-600 hover:bg-brand-800"
              >
                Create an account
              </ButtonLink>
            </div>
            <p className="mt-6 text-xs text-brand-200">
              Demonstration project. Summit Air is a fictional company and no payment is
              ever processed.
            </p>
          </div>

          <Card className="border-brand-700 bg-brand-800/60 p-6 shadow-none ring-1 ring-brand-700">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-200">
              What every plan includes
            </p>
            <ul className="mt-5 space-y-4">
              {[
                "Annual inspection by a licensed technician",
                "Seasonal maintenance and system tune-up",
                "Filter replacement on every visit",
                "Priority scheduling ahead of non-members",
                "No hidden trip charges for covered visits",
              ].map((item) => (
                <li key={item} className="flex gap-3 text-sm text-brand-50">
                  <CheckIcon className="text-brand-300" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      {/* Value props */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <SectionHeading
          eyebrow="Why members stay"
          title="Maintenance that keeps working when the weather does not"
          description="A protection plan is really about two things: catching small problems during a scheduled visit, and getting a technician quickly when something fails."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {VALUE_PROPS.map((item) => (
            <Card key={item.title} className="p-6">
              <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-600">{item.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Live plan preview - fetched from the API */}
      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <SectionHeading
            eyebrow="Plans and pricing"
            title="Priced for your service region"
            description="Choose your state to see the plans we currently offer there and what they cost."
            center
          />
          <div className="mt-12">
            <HomePlanPreview />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <SectionHeading eyebrow="How it works" title="Three steps to coverage" />
        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {STEPS.map((item) => (
            <li key={item.step}>
              <Card className="h-full p-6">
                <span className="text-sm font-bold tracking-widest text-brand-500">
                  {item.step}
                </span>
                <h3 className="mt-3 text-base font-semibold text-slate-900">
                  {item.title}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-600">
                  {item.body}
                </p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {/* CTA */}
      <section className="bg-brand-900">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 py-14 sm:px-6 lg:flex-row lg:items-center lg:px-8">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Ready to protect your system?
            </h2>
            <p className="mt-2 max-w-xl text-brand-100">
              Create an account with your service address and we will show you the plans
              available in your region.
            </p>
          </div>
          <ButtonLink href="/register" size="lg" className="shrink-0">
            Get started
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
