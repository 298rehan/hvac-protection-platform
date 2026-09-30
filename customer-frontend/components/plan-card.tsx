import { ArrowRightIcon } from "@/components/icons";
import { ButtonLink, Card, CheckIcon, Skeleton } from "@/components/ui";
import { cx, formatMoney } from "@/lib/format";
import type { PublicPlan } from "@/types";

/**
 * One plan, already priced for a region by the backend.
 * Nothing here computes or hardcodes a price.
 */
export function PlanCard({
  plan,
  featured = false,
}: {
  plan: PublicPlan;
  featured?: boolean;
}) {
  return (
    <div
      className={cx(
        "relative flex h-full flex-col rounded-xl bg-white p-6 transition-shadow duration-200 sm:p-7",
        featured
          ? "border border-brand-500 shadow-lg shadow-brand-900/10 ring-1 ring-brand-500 lg:-my-3 lg:py-10"
          : "border border-slate-200/80 shadow-sm hover:shadow-md",
      )}
    >
      {featured ? (
        <span className="absolute -top-3 left-6 inline-flex rounded-full bg-brand-600 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-sm sm:left-7">
          Most popular
        </span>
      ) : null}

      <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{plan.description}</p>

      <div className="mt-6 rounded-lg bg-slate-50 px-4 py-4 ring-1 ring-slate-100">
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-bold tracking-tight text-slate-900 tabular-nums">
            {formatMoney(plan.monthly_price)}
          </span>
          <span className="text-sm font-medium text-slate-500">/month</span>
        </div>
        <p className="mt-1.5 text-sm text-slate-600">
          {plan.annual_price ? (
            <>
              or <span className="font-semibold tabular-nums">{formatMoney(plan.annual_price)}</span>{" "}
              billed annually
            </>
          ) : (
            "Monthly billing only"
          )}
        </p>
        <p className="mt-1 text-xs text-slate-500">Price shown for {plan.state_name}</p>
      </div>

      <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-slate-500">
        What&apos;s included
      </p>
      <ul className="mt-3 flex-1 space-y-2.5">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-2.5 text-sm text-slate-700">
            <CheckIcon className="mt-px h-4.5 w-4.5 text-brand-600" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-col gap-2">
        <ButtonLink
          href={`/checkout/${plan.id}`}
          variant={featured ? "primary" : "secondary"}
          className="w-full"
        >
          Enroll in this plan
          <ArrowRightIcon className="h-4 w-4" />
        </ButtonLink>
        <ButtonLink
          href={`/plans/${plan.id}`}
          variant="ghost"
          className="w-full"
        >
          View plan details
        </ButtonLink>
      </div>
    </div>
  );
}

/** Placeholder with the same footprint as a plan card while plans load. */
export function PlanCardSkeleton() {
  return (
    <Card className="flex h-full flex-col p-6 sm:p-7">
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-4/5" />
      <Skeleton className="mt-6 h-24 w-full rounded-lg" />
      <div className="mt-6 space-y-3">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-4 w-11/12" />
        ))}
      </div>
      <Skeleton className="mt-8 h-10 w-full rounded-lg" />
    </Card>
  );
}
