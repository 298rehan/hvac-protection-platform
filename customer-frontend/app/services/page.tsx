"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Input } from "@/components/form";
import { ServiceCard } from "@/components/marketplace/service-card";
import { Alert, ButtonLink, EmptyState, PageLoader, SectionHeading, Skeleton } from "@/components/ui";
import { cx } from "@/lib/format";
import { useFetch } from "@/lib/use-fetch";
import { useServiceActions } from "@/lib/use-service-actions";
import { fetchCategories, fetchServices } from "@/services/marketplaceService";

function ServicesCatalog() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const category = searchParams.get("category") ?? "";
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  const categories = useFetch("categories", fetchCategories);
  const services = useFetch(`services|${category}|${query}`, () =>
    fetchServices({ category: category || undefined, q: query || undefined }),
  );
  const actions = useServiceActions();

  function selectCategory(slug: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (slug) params.set("category", slug);
    else params.delete("category");
    router.replace(`/services${params.toString() ? `?${params}` : ""}`, { scroll: false });
  }

  const list = services.data ?? services.staleData ?? [];

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <SectionHeading
          eyebrow="HVAC services"
          title="Book exactly the service you need"
          description="Choose one service, add several to your cart, or build a custom plan. Prices shown are set by our team and confirmed by the server at checkout."
        />
        <ButtonLink href="/dashboard/custom-plan" variant="secondary" className="shrink-0">
          Build a custom plan
        </ButtonLink>
      </div>

      <div className="mt-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          <CategoryChip label="All services" active={!category} onClick={() => selectCategory("")} />
          {(categories.data ?? []).map((item) => (
            <CategoryChip key={item.id} label={item.name} active={category === item.slug} onClick={() => selectCategory(item.slug)} />
          ))}
        </div>
        <form
          role="search"
          className="w-full md:w-72"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(search.trim());
          }}
        >
          <label htmlFor="service-search" className="sr-only">Search services</label>
          <Input
            id="service-search"
            type="search"
            placeholder="Search services…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              if (!event.target.value) setQuery("");
            }}
          />
        </form>
      </div>

      {actions.notice ? (
        <div className="mt-6">
          <Alert tone={actions.notice.tone}>
            {actions.notice.text}{" "}
            {actions.notice.tone === "success" ? (
              <Link href="/cart" className="font-semibold underline">View cart</Link>
            ) : null}
          </Alert>
        </div>
      ) : null}
      {services.error ? <div className="mt-6"><Alert>{services.error}</Alert></div> : null}

      <div className="mt-8">
        {services.loading && list.length === 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((n) => <Skeleton key={n} className="h-64 rounded-xl" />)}
          </div>
        ) : list.length === 0 && !services.loading ? (
          <EmptyState
            title="No services found"
            description={query ? `Nothing matches "${query}". Try another search or category.` : "There are no services in this category yet."}
          />
        ) : (
          <div className={cx("grid gap-5 sm:grid-cols-2 lg:grid-cols-3", services.loading && "opacity-60")}>
            {list.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                busy={actions.busyId === service.id}
                onAddToCart={() => actions.addServiceToCart(service)}
                onAddToPlan={() => actions.addServiceToPlan(service)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ring-inset transition-colors",
        active ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50",
      )}
    >
      {label}
    </button>
  );
}

export default function ServicesPage() {
  return (
    <Suspense fallback={<PageLoader label="Loading services" />}>
      <ServicesCatalog />
    </Suspense>
  );
}
