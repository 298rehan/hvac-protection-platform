import { ButtonLink, Card, CheckIcon } from "@/components/ui";
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
    <Card
      className={cx(
        "flex h-full flex-col p-6",
        featured && "border-brand-500 ring-1 ring-brand-500",
      )}
    >
      {featured ? (
        <span className="mb-4 inline-flex w-fit rounded-full bg-brand-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
          Most popular
        </span>
      ) : null}

      <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{plan.description}</p>

      <div className="mt-6 flex items-baseline gap-1.5">
        <span className="text-4xl font-bold tracking-tight text-slate-900">
          {formatMoney(plan.monthly_price)}
        </span>
        <span className="text-sm font-medium text-slate-500">/month</span>
      </div>
      {plan.annual_price ? (
        <p className="mt-1.5 text-sm text-slate-500">
          or {formatMoney(plan.annual_price)} billed annually
        </p>
      ) : null}
      <p className="mt-1 text-xs text-slate-500">
        Price shown for {plan.state_name}
      </p>

      <ul className="mt-6 flex-1 space-y-3 border-t border-slate-100 pt-6">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-2.5 text-sm text-slate-700">
            <CheckIcon className="text-brand-600" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-col gap-2">
        <ButtonLink
          href={`/plans/${plan.id}`}
          variant={featured ? "primary" : "secondary"}
          className="w-full"
        >
          View plan details
        </ButtonLink>
        <ButtonLink href={`/checkout/${plan.id}`} variant="subtle" className="w-full">
          Enroll in this plan
        </ButtonLink>
      </div>
    </Card>
  );
}
