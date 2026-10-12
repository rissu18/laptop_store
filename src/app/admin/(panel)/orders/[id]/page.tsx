import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DataTable } from "@/components/admin/data-table";
import { fmtCents } from "@/components/admin/format";
import { CancelOrderButton, OrderNoteForm } from "@/components/admin/order-actions";
import { OrderUnits } from "@/components/admin/order-units";
import { Badge, Card, DefinitionList, Missing, PageHeader, StatusBadge } from "@/components/admin/ui";
import { CHECKOUT_COUNTRIES } from "@/domain/checkout/checkout-form";
import { formatDiscountValue } from "@/domain/discounts/discount-engine";
import { canTransition, type OrderStatus } from "@/domain/orders/order-status";
import { formatTallinnDateTime } from "@/domain/time/tallinn";
import { getOrderDetail } from "@/server/admin/orders/queries";
import { uuidParam } from "@/server/admin/search-params";

/** Admin on alati päringupõhine (sessioon, värsked andmed) — eelrenderdust ega "instant" navigeerimist ei kasutata. */
export const instant = false;

export const metadata: Metadata = { title: "Tellimus" };

const SOURCE_LABELS: Record<string, string> = { CHECKOUT: "Kassa", ADMIN: "Admin", SYSTEM: "Süsteem", PAYMENT: "Makse" };

export default async function OrderDetailPage({ params }: PageProps<"/admin/orders/[id]">) {
  const id = uuidParam((await params).id);
  if (!id) notFound();
  const data = await getOrderDetail(id);
  if (!data) notFound();
  const { order, items, history, notes, units } = data;

  return (
    <>
      <PageHeader
        title={order.orderNumber}
        breadcrumbs={[{ label: "Tellimused", href: "/admin/orders" }, { label: order.orderNumber }]}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {order.isTest && <Badge tone="warning">TEST</Badge>}
            <StatusBadge status={order.status} />
            {order.isTest ? <Badge>Testtellimus — makset ei võeta</Badge> : <StatusBadge status={order.paymentStatus} />}
            <span>{formatTallinnDateTime(order.createdAt)}</span>
          </span>
        }
        actions={canTransition(order.status as OrderStatus, "CANCELLED", "ADMIN") ? <CancelOrderButton id={order.id} orderNumber={order.orderNumber} isTest={order.isTest} /> : undefined}
      />
      {order.isTest && (
        <p className="mb-6 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          Prototüübi testtellimus: makset ei võetud, tarnijale ei saadetud, laoseisu ei vähendatud ja sooduskoodi kasutust ei arvestatud.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title={`Tooted (${items.length})`} description="Snapshot ostu hetkest — ei muutu, kui toodet kataloogis hiljem muudetakse.">
            <DataTable
              rows={items}
              rowKey={(row) => row.id}
              caption="Tellimuse read"
              columns={[
                {
                  key: "title",
                  header: "Toode",
                  mobile: "title",
                  cell: (row) => (
                    <span className="flex flex-col">
                      {row.supplierListingId ? (
                        <Link href={`/admin/products/listings/${row.supplierListingId}`} className="font-medium text-primary hover:underline">
                          {row.title}
                        </Link>
                      ) : (
                        <span className="font-medium">{row.title}</span>
                      )}
                      <span className="text-xs text-muted">{row.sku}</span>
                    </span>
                  ),
                },
                { key: "cpu", header: "CPU", cell: (row) => row.cpu ?? <Missing /> },
                { key: "ram", header: "RAM / SSD", cell: (row) => `${row.ramGb ?? "?"} GB / ${row.storageGb ?? "?"} GB` },
                { key: "grade", header: "Seisukord", cell: (row) => row.grade ?? <Missing /> },
                { key: "qty", header: "Kogus", align: "right", cell: (row) => row.quantity },
                { key: "unit", header: "Ühikuhind", align: "right", cell: (row) => fmtCents(row.unitPriceCents) },
                { key: "discount", header: "Soodustus", align: "right", cell: (row) => (row.discountAmountCents ? `−${fmtCents(row.discountAmountCents)}` : "—") },
                { key: "total", header: "Rida kokku", align: "right", cell: (row) => <strong>{fmtCents(row.lineTotalCents)}</strong> },
              ]}
            />
          </Card>

          {units.length > 0 && (
            <Card
              title="Seerianumbrid (tarnija seadmed)"
              description={`Ainult adminile — kliendile ei näidata. Märge ei reserveeri ega müü seadet${order.isTest ? " (testtellimus ei kuluta laoseisu)" : ""}; reserveerimine seotakse makse faasis.`}
            >
              <OrderUnits orderId={order.id} rows={units} />
            </Card>
          )}

          <Card title="Ajalugu">
            <ol className="space-y-2 text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-xs text-muted">{formatTallinnDateTime(h.createdAt)}</span>
                  <Badge>{h.kind === "PAYMENT" ? "Makse" : "Tellimus"}</Badge>
                  <span>
                    {h.fromStatus ? <StatusBadge status={h.fromStatus} /> : <span className="text-muted">—</span>} → <StatusBadge status={h.toStatus} />
                  </span>
                  <span className="text-xs text-muted">
                    {SOURCE_LABELS[h.source] ?? h.source}
                    {h.adminEmail && ` · ${h.adminEmail}`}
                  </span>
                  {h.note && <span className="w-full text-xs text-muted">„{h.note}“</span>}
                </li>
              ))}
            </ol>
          </Card>

          <Card title="Sisemärkmed" description="Ainult adminile — kliendi tellimuse otsingus ei näidata.">
            <OrderNoteForm id={order.id} />
            {notes.length > 0 && (
              <ul className="mt-4 divide-y divide-border border-t border-border">
                {notes.map((n) => (
                  <li key={n.id} className="py-3 text-sm">
                    <p className="whitespace-pre-wrap">{n.note}</p>
                    <p className="mt-1 text-xs text-muted">
                      {n.adminEmail ?? "—"} · {formatTallinnDateTime(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Card title="Summad">
            <DefinitionList
              items={[
                { label: "Vahesumma", value: fmtCents(order.subtotalCents) },
                { label: "Soodustus", value: order.discountAmountCents ? `−${fmtCents(order.discountAmountCents)}` : "—" },
                { label: `Tarne (${order.shippingMethodName})`, value: fmtCents(order.shippingAmountCents) },
                { label: "Kokku", value: <strong>{fmtCents(order.totalCents)}</strong> },
              ]}
            />
          </Card>
          <Card title="Klient">
            <DefinitionList
              items={[
                { label: "Nimi", value: `${order.customerFirstName} ${order.customerLastName}` },
                { label: "E-post", value: order.customerEmail },
                { label: "Telefon", value: order.customerPhone },
                ...(order.companyName
                  ? [
                      { label: "Ettevõte", value: order.companyName },
                      { label: "Registrikood", value: order.companyRegistryCode },
                      { label: "KMKR", value: order.companyVatNumber },
                    ]
                  : []),
              ]}
            />
            {order.customerNote && (
              <div className="mt-3 rounded-md bg-surface-alt p-3 text-sm">
                <p className="text-xs text-muted">Kliendi märkus</p>
                <p className="whitespace-pre-wrap">{order.customerNote}</p>
              </div>
            )}
          </Card>
          <Card title="Tarne">
            <DefinitionList
              items={[
                { label: "Tarneviis", value: `${order.shippingMethodName} (${order.shippingMethodCode})` },
                { label: "Aadress", value: [order.shippingAddressLine1, order.shippingAddressLine2].filter(Boolean).join(", ") },
                { label: "Linn / indeks", value: `${order.shippingPostalCode} ${order.shippingCity}` },
                { label: "Riik", value: CHECKOUT_COUNTRIES[order.shippingCountry as keyof typeof CHECKOUT_COUNTRIES] ?? order.shippingCountry },
              ]}
            />
          </Card>
          <Card title="Sooduskood">
            {order.discountCode && order.discountType ? (
              <DefinitionList
                items={[
                  { label: "Kood", value: order.discountCodeId ? <Link href={`/admin/discounts/${order.discountCodeId}`} className="text-primary hover:underline">{order.discountCode}</Link> : order.discountCode },
                  { label: "Tüüp ja väärtus (tellimuse hetkel)", value: formatDiscountValue({ type: order.discountType, value: order.discountValue ?? 0, maximumDiscountCents: null }) },
                  { label: "Rakendatud summa", value: `−${fmtCents(order.discountAmountCents)}` },
                ]}
              />
            ) : (
              <Missing label="Sooduskoodi ei kasutatud" />
            )}
          </Card>
          <Link href={`/admin/system/activity?entity=${order.id}`} className="text-sm text-primary hover:underline">
            Tegevuslogi →
          </Link>
        </aside>
      </div>
    </>
  );
}
