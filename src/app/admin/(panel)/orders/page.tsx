import type { Metadata } from "next";
import Link from "next/link";
import { DataTable, type Column } from "@/components/admin/data-table";
import { FilterForm, SearchField, SelectFilter } from "@/components/admin/filters";
import { fmtCents } from "@/components/admin/format";
import { Pagination } from "@/components/admin/pagination";
import { Badge, PageHeader, StatusBadge } from "@/components/admin/ui";
import { ORDER_STATUS_LABELS, ORDER_STATUS_VALUES, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_VALUES } from "@/domain/orders/order-status";
import { formatTallinnDateTime } from "@/domain/time/tallinn";
import { listOrders } from "@/server/admin/orders/queries";
import { oneOf, pageNumber, str } from "@/server/admin/search-params";

/** Admin on alati päringupõhine (sessioon, värsked andmed) — eelrenderdust ega "instant" navigeerimist ei kasutata. */
export const instant = false;

export const metadata: Metadata = { title: "Tellimused" };

type Row = Awaited<ReturnType<typeof listOrders>>["rows"][number];

const columns: Column<Row>[] = [
  {
    key: "number",
    header: "Tellimuse nr",
    mobile: "title",
    cell: (row) => (
      <span className="flex flex-wrap items-center gap-1.5">
        <Link href={`/admin/orders/${row.id}`} className="font-mono font-semibold text-primary hover:underline">
          {row.orderNumber}
        </Link>
        {row.isTest && <Badge tone="warning">TEST</Badge>}
      </span>
    ),
  },
  { key: "date", header: "Kuupäev", cell: (row) => <span className="whitespace-nowrap">{formatTallinnDateTime(row.createdAt)}</span> },
  { key: "customer", header: "Klient", cell: (row) => <span>{row.customerName}{row.companyName && <span className="block text-xs text-muted">{row.companyName}</span>}</span> },
  { key: "email", header: "E-post", mobile: "hidden", cell: (row) => <span className="break-all">{row.customerEmail}</span> },
  { key: "items", header: "Tooteid", align: "right", cell: (row) => row.itemCount },
  { key: "subtotal", header: "Vahesumma", align: "right", mobile: "hidden", cell: (row) => fmtCents(row.subtotalCents) },
  { key: "discount", header: "Soodustus", align: "right", mobile: "hidden", cell: (row) => (row.discountCode ? `−${fmtCents(row.discountAmountCents)}` : "—") },
  { key: "total", header: "Kokku", align: "right", cell: (row) => <strong>{fmtCents(row.totalCents)}</strong> },
  { key: "status", header: "Olek", cell: (row) => <StatusBadge status={row.status} /> },
  { key: "payment", header: "Makse", cell: (row) => (row.isTest ? <Badge>Testtellimus</Badge> : <StatusBadge status={row.paymentStatus} />) },
  { key: "kind", header: "Test/Päris", mobile: "hidden", cell: (row) => (row.isTest ? <Badge tone="warning">TEST</Badge> : <Badge tone="primary">Päris</Badge>) },
];

export default async function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const sp = await searchParams;
  const dateParam = (v: unknown) => {
    const s = str(v as string | undefined, 10);
    return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
  };
  const filters = {
    q: str(sp.q, 60),
    status: oneOf(sp.status, ORDER_STATUS_VALUES),
    payment: oneOf(sp.payment, PAYMENT_STATUS_VALUES),
    kind: oneOf(sp.kind, ["test", "real"] as const),
    from: dateParam(sp.from),
    to: dateParam(sp.to),
    coupon: oneOf(sp.coupon, ["yes", "no"] as const),
    sort: oneOf(sp.sort, ["newest", "oldest", "total-desc", "total-asc"] as const),
  };
  const page = pageNumber(sp.page);
  const { rows, total, pageCount } = await listOrders({ ...filters, page });
  const allTest = rows.length > 0 && rows.every((r) => r.isTest);

  return (
    <>
      <PageHeader
        title="Tellimused"
        breadcrumbs={[{ label: "Tellimused" }]}
        description="Prototüübis on kõik tellimused TESTtellimused: makset ei võeta, tarnijale ei saadeta ja laoseisu ei vähendata. Testtellimusi ei loeta müügiks."
      />
      {allTest && <p className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">Kõik kuvatud tellimused on testtellimused — need ei ole päris müük.</p>}
      <FilterForm action="/admin/orders" resetHref="/admin/orders">
        <SearchField defaultValue={filters.q} placeholder="Tellimuse nr, e-post, nimi…" />
        <SelectFilter name="kind" label="Test/Päris" value={filters.kind} options={[{ value: "test", label: "Testtellimused" }, { value: "real", label: "Päris tellimused" }]} />
        <SelectFilter name="status" label="Olek" value={filters.status} options={ORDER_STATUS_VALUES.map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s] }))} />
        <SelectFilter name="payment" label="Makse" value={filters.payment} options={PAYMENT_STATUS_VALUES.map((s) => ({ value: s, label: PAYMENT_STATUS_LABELS[s] }))} />
        <SelectFilter name="coupon" label="Sooduskood" value={filters.coupon} options={[{ value: "yes", label: "Kasutatud" }, { value: "no", label: "Pole" }]} />
        <label className="flex flex-col gap-1 text-xs text-muted">
          Alates
          <input type="date" name="from" defaultValue={filters.from} className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm text-text" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Kuni
          <input type="date" name="to" defaultValue={filters.to} className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm text-text" />
        </label>
        <SelectFilter
          name="sort"
          label="Järjestus"
          value={filters.sort}
          options={[
            { value: "newest", label: "Uusimad" },
            { value: "oldest", label: "Vanimad" },
            { value: "total-desc", label: "Summa ↓" },
            { value: "total-asc", label: "Summa ↑" },
          ]}
        />
      </FilterForm>
      <DataTable rows={rows} columns={columns} rowKey={(row) => row.id} caption="Tellimused" empty={{ title: "Tellimusi pole", description: "Testtellimus tekib, kui keegi esitab poe kassas tellimuse." }} />
      <Pagination basePath="/admin/orders" params={{ ...filters }} page={Math.min(page, pageCount)} pageCount={pageCount} total={total} />
    </>
  );
}
