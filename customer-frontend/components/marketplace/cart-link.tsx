"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { CartIcon } from "@/components/icons";
import { useFetch } from "@/lib/use-fetch";
import { CART_EVENT, fetchCart } from "@/services/marketplaceService";

/** Header cart link with the number of services in the signed-in customer's cart. */
export function CartLink({ userId }: { userId: number }) {
  const cart = useFetch(`cart-count-${userId}`, fetchCart);
  const [liveCount, setLiveCount] = useState<number | null>(null);

  useEffect(() => {
    function onUpdate(event: Event) {
      setLiveCount((event as CustomEvent<number>).detail);
    }
    window.addEventListener(CART_EVENT, onUpdate);
    return () => window.removeEventListener(CART_EVENT, onUpdate);
  }, []);

  const count = liveCount ?? cart.data?.items.length ?? 0;
  return (
    <Link
      href="/cart"
      className="relative rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
      aria-label={`Cart, ${count} service${count === 1 ? "" : "s"}`}
    >
      <CartIcon />
      {count > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
          {count}
        </span>
      ) : null}
    </Link>
  );
}
