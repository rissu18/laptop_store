"use client";

import { GitCompareArrows, PackageSearch, ShoppingBag } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cartItemCount, useCart } from "@/client/cart-store";
import { useCompare } from "@/client/compare-store";
import { cx } from "@/components/ui/class-names";

function Action({ href, label, count, icon, hideLabelOnMobile = true }: { href: string; label: string; count?: number; icon: ReactNode; hideLabelOnMobile?: boolean }) {
  return (
    <Link
      href={href}
      className="relative flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-text hover:bg-surface-sunken lg:px-3"
      aria-label={count ? `${label} (${count})` : label}
    >
      <span className="relative">
        {icon}
        {count ? (
          <span className="tabular absolute -right-2 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-on-primary">
            {count}
          </span>
        ) : null}
      </span>
      <span className={cx(hideLabelOnMobile && "hidden xl:inline")}>{label}</span>
    </Link>
  );
}

export function HeaderActions() {
  const cart = useCart();
  const compare = useCompare();

  return (
    <nav aria-label="Kasutaja" className="flex items-center gap-0.5">
      <span className="hidden md:block">
        <Action href="/vordlus" label="Võrdlus" count={compare.length} icon={<GitCompareArrows className="size-5" aria-hidden />} />
      </span>
      <span className="hidden md:block">
        <Action href="/tellimus" label="Tellimuse otsing" icon={<PackageSearch className="size-5" aria-hidden />} />
      </span>
      <Action href="/ostukorv" label="Ostukorv" count={cartItemCount(cart)} icon={<ShoppingBag className="size-5" aria-hidden />} />
    </nav>
  );
}
