import Link from "next/link";

import { ClockIcon } from "@/components/icons";
import { ServiceIcon } from "@/components/marketplace/service-icon";
import { Button, Card } from "@/components/ui";
import { formatDuration, formatPrice, servicePriceLabel } from "@/lib/marketplace-format";
import type { CatalogService } from "@/types/marketplace";

/** One service in the catalog grid or the plan builder. */
export function ServiceCard({
  service,
  onAddToCart,
  onAddToPlan,
  inPlan = false,
  busy = false,
}: {
  service: CatalogService;
  onAddToCart?: () => void;
  onAddToPlan?: () => void;
  inPlan?: boolean;
  busy?: boolean;
}) {
  const addons = service.addons.filter((addon) => addon.is_active);
  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-start gap-3.5">
        <ServiceIcon name={service.icon} />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">{service.category.name}</p>
          <h3 className="mt-0.5 text-base font-semibold text-slate-900">
            <Link href={`/services/${service.slug}`} className="hover:text-brand-700 hover:underline">
              {service.name}
            </Link>
          </h3>
        </div>
      </div>

      <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-600">{service.description}</p>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-lg font-bold text-slate-900">{servicePriceLabel(service)}</p>
          {service.requires_inspection ? (
            <p className="text-xs text-amber-700">Final price confirmed after inspection</p>
          ) : null}
        </div>
        <p className="flex items-center gap-1 text-xs text-slate-500">
          <ClockIcon className="h-4 w-4" />
          {formatDuration(service.duration_minutes)}
        </p>
      </div>

      {addons.length > 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          Options: {addons.map((addon) => `${addon.name} (+${formatPrice(addon.price)})`).join(", ")}
        </p>
      ) : null}
      {service.allowed_frequencies.length > 1 ? (
        <p className="mt-1 text-xs text-slate-500">Can be booked one-time or on a regular schedule.</p>
      ) : null}

      {onAddToCart || onAddToPlan ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {onAddToPlan ? (
            <Button
              variant={inPlan ? "secondary" : "primary"}
              size="sm"
              onClick={onAddToPlan}
              disabled={busy || inPlan}
              aria-label={inPlan ? `${service.name} is in your plan` : `Add ${service.name} to plan`}
            >
              {inPlan ? "In your plan" : "Add to plan"}
            </Button>
          ) : null}
          {onAddToCart ? (
            <Button variant="secondary" size="sm" onClick={onAddToCart} disabled={busy} aria-label={`Add ${service.name} to cart`}>
              Add to cart
            </Button>
          ) : null}
          <Link href={`/services/${service.slug}`} className="inline-flex h-8 items-center px-2 text-xs font-semibold text-brand-700 hover:underline">
            Details
          </Link>
        </div>
      ) : null}
    </Card>
  );
}
