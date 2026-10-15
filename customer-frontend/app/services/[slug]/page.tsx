"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { ClockIcon } from "@/components/icons";
import { ItemOptions } from "@/components/marketplace/item-options";
import { QuoteSummary } from "@/components/marketplace/quote-summary";
import { ServiceIcon } from "@/components/marketplace/service-icon";
import { Alert, BackLink, Button, Card, PageLoader } from "@/components/ui";
import {
  FREQUENCY_LABELS,
  PRICING_LABELS,
  formatDuration,
  servicePriceLabel,
} from "@/lib/marketplace-format";
import { useFetch } from "@/lib/use-fetch";
import { useQuote } from "@/lib/use-quote";
import { defaultItem, useServiceActions } from "@/lib/use-service-actions";
import { fetchService } from "@/services/marketplaceService";
import type { CatalogService, SelectionItem } from "@/types/marketplace";

export default function ServiceDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const service = useFetch(`service|${slug}`, () => fetchService(slug));

  if (service.loading) return <PageLoader label="Loading service" />;
  if (service.error || !service.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <BackLink href="/services">All services</BackLink>
        <div className="mt-6"><Alert>{service.error ?? "Service not found."}</Alert></div>
      </div>
    );
  }
  return <ServiceDetail key={service.data.id} service={service.data} />;
}

function ServiceDetail({ service }: { service: CatalogService }) {
  const [item, setItem] = useState<SelectionItem>(() => defaultItem(service));
  const { quote, loading, error } = useQuote([item]);
  const actions = useServiceActions();
  const blocked = (quote?.problems.length ?? 0) > 0;

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <BackLink href="/services">All services</BackLink>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div>
          <div className="flex items-start gap-4">
            <ServiceIcon name={service.icon} className="h-14 w-14" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">{service.category.name}</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{service.name}</h1>
            </div>
          </div>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-600">{service.description}</p>

          <dl className="mt-8 grid gap-4 sm:grid-cols-3">
            <Fact label={PRICING_LABELS[service.pricing_type]} value={servicePriceLabel(service)} />
            <Fact label="Estimated duration" value={formatDuration(service.duration_minutes)} />
            <Fact
              label="Available as"
              value={service.allowed_frequencies.map((frequency) => FREQUENCY_LABELS[frequency]).join(", ")}
            />
          </dl>
          {service.requires_inspection ? (
            <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
              This is a starting price. The technician inspects your system first and confirms the final price before
              doing any work - you are never charged an amount you have not agreed to.
            </p>
          ) : null}
          {service.available_states ? (
            <p className="mt-3 text-sm text-slate-500">Offered in: {service.available_states.join(", ")}.</p>
          ) : null}
          {service.allowed_frequencies.some((f) => f !== "ONE_TIME") ? (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-slate-500">
              <ClockIcon className="h-4 w-4" />
              Recurring visits are priced per visit. Each visit is paid on the day - nothing is billed automatically.
            </p>
          ) : null}
        </div>

        <Card className="h-fit p-5 lg:sticky lg:top-24">
          <h2 className="text-base font-semibold text-slate-900">Choose options</h2>
          <div className="mt-4">
            <ItemOptions service={service} item={item} onChange={setItem} idPrefix="detail" />
          </div>
          <div className="mt-5 border-t border-slate-100 pt-4">
            <QuoteSummary quote={quote} loading={loading} error={error} showLines={false} />
          </div>
          {actions.notice ? (
            <div className="mt-4">
              <Alert tone={actions.notice.tone}>
                {actions.notice.text}{" "}
                {actions.notice.tone === "success" ? <Link href="/cart" className="font-semibold underline">View cart</Link> : null}
              </Alert>
            </div>
          ) : null}
          <div className="mt-5 grid gap-2">
            <Button onClick={() => actions.bookNow(item)} disabled={blocked}>Book this service</Button>
            <Button variant="secondary" onClick={() => actions.addServiceToCart(service, item)} disabled={blocked || actions.busyId === service.id}>
              {actions.busyId === service.id ? "Adding…" : "Add to cart"}
            </Button>
            <Button variant="ghost" onClick={() => actions.addServiceToPlan(service)}>Add to a custom plan</Button>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            Pay on service - nothing is charged online. Your total is recalculated by our server at checkout.
          </p>
        </Card>
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white px-4 py-3 ring-1 ring-slate-200">
      <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
