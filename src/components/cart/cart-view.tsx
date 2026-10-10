"use client";

import { Minus, Plus, ShieldCheck, ShoppingBag, Trash2, Truck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { removeFromCart, setCartQuantity, useCart } from "@/client/cart-store";
import { formatDeliveryDays, formatSpecLine } from "@/domain/catalog/format";
import { productHref } from "@/domain/catalog/urls";
import { formatEur } from "@/domain/money/money";
import { resolveCart, type ResolvedCart } from "@/server/cart/cart-actions";
import { GradeBadge } from "@/components/product/grade-badge";
import { ProductImage } from "@/components/product/product-image";
import { Button, ButtonLink } from "@/components/ui/button";
import { cx } from "@/components/ui/class-names";

/**
 * Ostukorv. Brauseris on ainult ID-d ja kogused; iga muudatuse järel küsitakse serverist
 * värsked hinnad ja laoseis. Hinda brauserist ei usaldata.
 */
export function CartView() {
  const refs = useCart();
  const [cart, setCart] = useState<ResolvedCart | null>(null);
  const [isPending, startTransition] = useTransition();
  const key = JSON.stringify(refs);

  useEffect(() => {
    startTransition(async () => {
      setCart(await resolveCart(refs));
    });
    // `key` muutub ainult siis, kui ostukorvi sisu tegelikult muutub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Eemalda korvist tooted, mida enam ei müüda
  useEffect(() => {
    cart?.unavailableIds.forEach(removeFromCart);
  }, [cart]);

  if (!cart) {
    return <div className="h-64 animate-pulse rounded-lg bg-surface-sunken" aria-label="Laen ostukorvi" />;
  }

  if (cart.lines.length === 0 && refs.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-lg border border-dashed border-border-strong px-6 py-16 text-center">
        <ShoppingBag className="size-10 text-muted" aria-hidden />
        <h2 className="mt-4 text-lg font-semibold">Ostukorv on tühi</h2>
        <p className="mt-1 text-sm text-muted">Leia endale sobiv sülearvuti meie valikust.</p>
        <ButtonLink href="/sulearvutid" className="mt-6">
          Vaata sülearvuteid
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className={cx("grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]", isPending && "opacity-70")}>
      <div>
        {cart.unavailableIds.length > 0 && (
          <p role="status" className="mb-4 rounded-md bg-warning-soft p-3 text-sm text-warning">
            Mõni toode eemaldati ostukorvist, sest see ei ole enam saadaval.
          </p>
        )}
        <ul className="divide-y divide-border border-y border-border">
          {cart.lines.map(({ item, quantity, maxQuantity, lineTotalCents }) => (
            <li key={item.variant.id} className="flex gap-4 py-5">
              <Link href={productHref(item)} className="w-24 shrink-0 overflow-hidden rounded-md sm:w-32">
                <ProductImage item={item} sizes="128px" />
              </Link>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex justify-between gap-4">
                  <div className="min-w-0">
                    <Link href={productHref(item)} className="font-semibold hover:text-primary">
                      {item.product.title}
                    </Link>
                    <p className="text-sm text-muted">{formatSpecLine(item)}</p>
                  </div>
                  <p className="tabular shrink-0 font-bold">{formatEur(lineTotalCents)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <GradeBadge grade={item.variant.grade} size="sm" />
                  {item.variant.keyboardLayout && <span className="text-xs text-muted">{item.variant.keyboardLayout} klaviatuur</span>}
                  {item.variant.warrantyMonths && <span className="text-xs text-muted">Garantii {item.variant.warrantyMonths} kuud</span>}
                </div>
                <div className="mt-auto flex items-center justify-between gap-4">
                  <div className="flex items-center rounded-md border border-border-strong" role="group" aria-label={`Kogus: ${item.product.title}`}>
                    <button
                      type="button"
                      onClick={() => setCartQuantity(item.variant.id, quantity - 1)}
                      className="flex size-9 items-center justify-center hover:bg-surface-sunken"
                      aria-label="Vähenda kogust"
                    >
                      <Minus className="size-4" aria-hidden />
                    </button>
                    <span className="tabular w-8 text-center text-sm font-semibold" aria-live="polite">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCartQuantity(item.variant.id, quantity + 1)}
                      disabled={quantity >= maxQuantity}
                      className="flex size-9 items-center justify-center hover:bg-surface-sunken disabled:opacity-40"
                      aria-label="Suurenda kogust"
                    >
                      <Plus className="size-4" aria-hidden />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFromCart(item.variant.id)}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-surface-sunken hover:text-danger"
                  >
                    <Trash2 className="size-4" aria-hidden />
                    Eemalda
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <aside aria-label="Tellimuse kokkuvõte" className="h-fit rounded-lg border border-border bg-surface-alt p-5 lg:sticky lg:top-[124px]">
        <h2 className="text-lg font-semibold">Kokkuvõte</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Tooted</dt>
            <dd className="tabular font-medium">{formatEur(cart.subtotalCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Transport</dt>
            <dd className="tabular font-medium">{cart.shippingFromCents !== null ? `alates ${formatEur(cart.shippingFromCents)}` : "kassas"}</dd>
          </div>
        </dl>
        <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
          <span className="font-semibold">Kokku</span>
          <span className="tabular text-2xl font-bold">{formatEur(cart.subtotalCents)}</span>
        </div>
        <p className="text-xs text-muted">+ transport, valitakse kassas</p>

        <ul className="mt-5 space-y-2 text-sm">
          {cart.delivery && (
            <li className="flex items-center gap-2">
              <Truck className="size-4 text-primary" aria-hidden />
              Eeldatav tarne {formatDeliveryDays(cart.delivery.minDays, cart.delivery.maxDays)}
            </li>
          )}
          <li className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            14-päevane taganemisõigus
          </li>
        </ul>

        {/* Phase 5: guest checkout. Enne makset kontrollitakse hinda ja laoseisu tarnijalt uuesti. */}
        <Button fullWidth size="lg" className="mt-6" disabled>
          Vormista tellimus
        </Button>
        <p className="mt-2 text-center text-xs text-muted">Tellimuse vormistamine lisandub järgmises etapis.</p>
      </aside>
    </div>
  );
}
