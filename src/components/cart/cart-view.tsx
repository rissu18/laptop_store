"use client";

import { Minus, Plus, ShieldCheck, ShoppingBag, Trash2, Truck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { removeFromCart, setAppliedDiscountCode, setCartQuantity, useAppliedDiscountCode, useCart } from "@/client/cart-store";
import { UNKNOWN_QUANTITY_LIMIT_MESSAGE } from "@/domain/catalog/availability";
import { formatDeliveryDays, formatSpecLine } from "@/domain/catalog/format";
import { productHref } from "@/domain/catalog/urls";
import { formatEur } from "@/domain/money/money";
import { resolveCart, type ResolvedCart } from "@/server/cart/cart-actions";
import { GradeBadge } from "@/components/product/grade-badge";
import { ProductImage } from "@/components/product/product-image";
import { ButtonLink } from "@/components/ui/button";
import { cx } from "@/components/ui/class-names";
import { DiscountCodeForm } from "./discount-code-form";

/**
 * Ostukorv. Brauseris on ainult ID-d, kogused ja sooduskoodi tekst; iga muudatuse järel küsitakse
 * serverist värsked hinnad, laoseis ja soodustus. Hinda ega soodustuse summat brauserist ei usaldata.
 */
export function CartView() {
  const refs = useCart();
  const appliedCode = useAppliedDiscountCode();
  const [cart, setCart] = useState<ResolvedCart | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  /** Read, mille juures näidata "täpne laokogus pole teada" teadet */
  const [limitNotices, setLimitNotices] = useState<ReadonlySet<string>>(new Set());
  const key = JSON.stringify([refs, appliedCode]);

  useEffect(() => {
    startTransition(async () => {
      const result = await resolveCart(refs, appliedCode ?? undefined);
      setCart(result);
      // Server piiras kogust, sest täpne laokogus pole teada → selgita kliendile
      const unknown = result.lines.filter((line) => line.quantityLimited && line.quantityUnknown).map((line) => line.item.variant.id);
      if (unknown.length) setLimitNotices((prev) => new Set([...prev, ...unknown]));
      // Salvestatud kood ei kehti enam (nt aegus või ostukorv muutus) → eemalda ja ütle miks
      if (appliedCode && result.discount && !result.discount.valid) {
        setAppliedDiscountCode(null);
        setDiscountError(`Sooduskood eemaldati: ${result.discount.message}`);
      }
    });
    // `key` muutub ainult siis, kui ostukorvi sisu tegelikult muutub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Eemalda korvist tooted, mida enam ei müüda; liiga suur kogus → server piiras, salvesta piiratud kogus
  useEffect(() => {
    cart?.unavailableIds.forEach(removeFromCart);
    const limited = cart?.lines.filter((line) => line.quantityLimited) ?? [];
    for (const line of limited) setCartQuantity(line.item.variant.id, line.maxQuantity);
  }, [cart]);

  function increase(line: ResolvedCart["lines"][number]) {
    if (line.quantity < line.maxQuantity) setCartQuantity(line.item.variant.id, line.quantity + 1);
    else if (line.quantityUnknown) setLimitNotices((prev) => new Set([...prev, line.item.variant.id]));
  }

  const applyDiscount = (code: string) =>
    startTransition(async () => {
      const result = await resolveCart(refs, code);
      if (result.discount?.valid) {
        setDiscountError(null);
        setCart(result);
        setAppliedDiscountCode(result.discount.code);
      } else {
        setDiscountError(result.discount?.message ?? "Sooduskoodi ei leitud.");
      }
    });

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
    <div className={cx("grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]", isPending && "opacity-70")}>
      <div>
        {cart.unavailableIds.length > 0 && (
          <p role="status" className="mb-4 rounded-md bg-warning-soft p-3 text-sm text-warning">
            Mõni toode eemaldati ostukorvist, sest see ei ole enam saadaval.
          </p>
        )}
        <ul className="divide-y divide-border border-y border-border">
          {cart.lines.map((line) => {
            const { item, quantity, maxQuantity, quantityUnknown, lineTotalCents } = line;
            return (
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
                      onClick={() => increase(line)}
                      // Teadmata laokoguse korral jääb nupp aktiivseks: klikk selgitab, miks rohkem ei saa
                      disabled={quantity >= maxQuantity && !quantityUnknown}
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
                {limitNotices.has(item.variant.id) && (
                  <p role="status" className="text-sm text-warning">
                    {UNKNOWN_QUANTITY_LIMIT_MESSAGE}
                  </p>
                )}
              </div>
            </li>
            );
          })}
        </ul>
      </div>

      <aside aria-label="Tellimuse kokkuvõte" className="h-fit rounded-lg border border-border bg-surface-alt p-5 lg:sticky lg:top-[124px]">
        <h2 className="text-lg font-semibold">Kokkuvõte</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Vahesumma</dt>
            <dd className="tabular font-medium">{formatEur(cart.subtotalCents)}</dd>
          </div>
          {cart.discount?.valid && cart.discountCents > 0 && (
            <div className="flex justify-between text-success">
              <dt>Sooduskood {cart.discount.code}</dt>
              <dd className="tabular font-medium">−{formatEur(cart.discountCents)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted">Transport</dt>
            <dd className="tabular font-medium">
              {cart.discount?.valid && cart.discount.freeShipping
                ? "tasuta"
                : cart.freeShippingFromCents !== null && cart.totalCents >= cart.freeShippingFromCents
                  ? "tasuta"
                  : cart.shippingFromCents !== null
                    ? formatEur(cart.shippingFromCents)
                    : "kassas"}
            </dd>
          </div>
        </dl>
        <div className="mt-4 border-t border-border pt-4">
          <DiscountCodeForm
            applied={appliedCode && cart.discount?.valid ? cart.discount : null}
            pending={isPending}
            error={discountError}
            onApply={applyDiscount}
            onRemove={() => {
              setDiscountError(null);
              setAppliedDiscountCode(null);
            }}
          />
        </div>
        <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
          <span className="font-semibold">Kokku</span>
          <span className="tabular text-2xl font-bold">{formatEur(cart.totalCents)}</span>
        </div>
        <p className="text-xs text-muted">+ tarne, arvutatakse kassas</p>

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

        {/* Kassas arvutatakse kõik serveris uuesti (hinnad, laoseis, sooduskood, tarne) */}
        <ButtonLink href="/kassa" fullWidth size="lg" className="mt-6" aria-disabled={cart.lines.length === 0}>
          Vormista tellimus
        </ButtonLink>
      </aside>
    </div>
  );
}
