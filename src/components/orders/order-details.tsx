import Image from "next/image";
import { CHECKOUT_COUNTRIES } from "@/domain/checkout/checkout-form";
import { formatEur } from "@/domain/money/money";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, type OrderStatus, type PaymentStatus } from "@/domain/orders/order-status";
import { formatTallinnDateTime } from "@/domain/time/tallinn";
import type { PublicOrderView } from "@/server/orders/public-order";

/** Tellimuse kuvamine kliendile (kinnitusleht ja tellimuse otsing). Ainult avalikud väljad. */
export function OrderDetails({ order }: { order: PublicOrderView }) {
  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-surface p-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted">Tellimuse number</dt>
          <dd className="font-mono font-semibold">{order.orderNumber}</dd>
        </div>
        <div>
          <dt className="text-muted">Kuupäev</dt>
          <dd>{formatTallinnDateTime(order.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-muted">Olek</dt>
          <dd>
            {order.isTest && <span className="mr-1 rounded bg-warning-soft px-1.5 py-0.5 text-xs font-semibold text-warning">TEST</span>}
            {ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Makse</dt>
          <dd>{order.isTest ? "Testtellimus — makset ei võeta" : (PAYMENT_STATUS_LABELS[order.paymentStatus as PaymentStatus] ?? order.paymentStatus)}</dd>
        </div>
      </dl>

      <section aria-labelledby="order-items" className="rounded-lg border border-border bg-surface p-4">
        <h2 id="order-items" className="font-semibold">
          Tooted
        </h2>
        <ul className="mt-2 divide-y divide-border">
          {order.items.map((item) => (
            <li key={item.sku} className="flex gap-3 py-3 text-sm">
              <span className="relative size-14 shrink-0 overflow-hidden rounded border border-border bg-white">
                {item.imagePath && <Image src={item.imagePath} alt="" fill sizes="56px" className="object-contain" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{item.title}</span>
                <span className="block text-xs text-muted">
                  {[item.cpu, item.ramGb ? `${item.ramGb} GB RAM` : null, item.storageGb ? `${item.storageGb} GB SSD` : null, item.grade ? `seisukord ${item.grade}` : null, item.keyboard ? `${item.keyboard} klaviatuur` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className="block text-xs text-muted">
                  {item.sku} · {item.quantity} × {formatEur(item.unitPriceCents)}
                  {item.discountCents > 0 && ` · soodustus −${formatEur(item.discountCents)}`}
                </span>
              </span>
              <span className="tabular shrink-0 font-semibold">{formatEur(item.lineTotalCents)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-2 space-y-1.5 border-t border-border pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Vahesumma</dt>
            <dd className="tabular">{formatEur(order.subtotalCents)}</dd>
          </div>
          {order.discountCode && (
            <div className="flex justify-between text-success">
              <dt>Sooduskood {order.discountCode}</dt>
              <dd className="tabular">−{formatEur(order.discountCents)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted">Tarne ({order.shippingMethodName})</dt>
            <dd className="tabular">{formatEur(order.shippingCents)}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
            <dt>Kokku</dt>
            <dd className="tabular">{formatEur(order.totalCents)}</dd>
          </div>
        </dl>
      </section>

      {order.contact && order.shippingAddress && (
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-lg border border-border bg-surface p-4 text-sm">
            <h2 className="font-semibold">Kontakt</h2>
            <p className="mt-2">{order.contact.name}</p>
            <p className="break-all">{order.contact.email}</p>
            <p>{order.contact.phone}</p>
            {order.contact.company && (
              <p className="mt-2">
                {order.contact.company}, reg. {order.contact.registryCode}
                {order.contact.vatNumber && `, KMKR ${order.contact.vatNumber}`}
              </p>
            )}
          </section>
          <section className="rounded-lg border border-border bg-surface p-4 text-sm">
            <h2 className="font-semibold">Tarne</h2>
            <p className="mt-2">{order.shippingMethodName}</p>
            <p>{order.shippingAddress.line1}</p>
            {order.shippingAddress.line2 && <p>{order.shippingAddress.line2}</p>}
            <p>
              {order.shippingAddress.postalCode} {order.shippingAddress.city}
            </p>
            <p>{CHECKOUT_COUNTRIES[order.shippingAddress.country as keyof typeof CHECKOUT_COUNTRIES] ?? order.shippingAddress.country}</p>
          </section>
        </div>
      )}
    </div>
  );
}
