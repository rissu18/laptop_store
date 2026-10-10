import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DataTable, type Column } from "@/components/admin/data-table";
import { DiscountActions } from "@/components/admin/discount-actions";
import { FilterForm, SearchField, SelectFilter } from "@/components/admin/filters";
import { fmtDateTime } from "@/components/admin/format";
import { Pagination } from "@/components/admin/pagination";
import { PageHeader, StatusBadge } from "@/components/admin/ui";
import { ButtonLink } from "@/components/ui/button";
import { EFFECTIVE_DISCOUNT_STATUSES, formatDiscountValue } from "@/domain/discounts/discount-engine";
import { formatTallinnShortDate } from "@/domain/time/tallinn";
import { listDiscounts } from "@/server/admin/discounts/queries";
import { oneOf, pageNumber, str } from "@/server/admin/search-params";

/** Admin on alati päringupõhine (sessioon, värsked andmed) — eelrenderdust ega "instant" navigeerimist ei kasutata. */
export const instant = false;

export const metadata: Metadata = { title: "Sooduskoodid" };

type Row = Awaited<ReturnType<typeof listDiscounts>>["rows"][number];

const TYPE_LABELS: Record<string, string> = { PERCENTAGE: "Protsent", FIXED_AMOUNT: "Summa", FREE_SHIPPING: "Tasuta tarne" };
const STATUS_OPTIONS: Record<string, string> = { ACTIVE: "Aktiivne", SCHEDULED: "Ajastatud", EXPIRED: "Aegunud", DRAFT: "Mustand", DISABLED: "Välja lülitatud", ARCHIVED: "Arhiveeritud" };

function validity(row: Row["discount"]): string {
  const from = formatTallinnShortDate(row.startsAt);
  const to = formatTallinnShortDate(row.expiresAt);
  if (!from && !to) return "Tähtajatu";
  return `${from ?? "…"}–${to ?? "…"}`;
}

const columns: Column<Row>[] = [
  {
    key: "code",
    header: "Kood",
    mobile: "title",
    cell: ({ discount }) => (
      <span className="flex flex-col">
        <Link href={`/admin/discounts/${discount.id}`} className="font-mono font-semibold text-primary hover:underline">
          {discount.code}
        </Link>
        <span className="text-xs font-normal text-muted md:hidden">{discount.name}</span>
      </span>
    ),
  },
  { key: "name", header: "Nimi", mobile: "hidden", cell: ({ discount }) => discount.name },
  { key: "type", header: "Tüüp", cell: ({ discount }) => TYPE_LABELS[discount.type] },
  { key: "value", header: "Soodustus", cell: ({ discount }) => formatDiscountValue(discount) },
  { key: "validity", header: "Kehtivus", cell: ({ discount }) => validity(discount) },
  { key: "usage", header: "Kasutus", cell: ({ discount }) => `${discount.usageCount} / ${discount.usageLimit ?? "∞"}` },
  { key: "status", header: "Staatus", cell: ({ effectiveStatus }) => <StatusBadge status={effectiveStatus} /> },
  { key: "updated", header: "Muudetud", mobile: "hidden", cell: ({ discount }) => <span className="whitespace-nowrap">{fmtDateTime(discount.updatedAt)}</span> },
  { key: "actions", header: "Toimingud", cell: ({ discount }) => <DiscountActions id={discount.id} code={discount.code} status={discount.status} compact /> },
];

export default async function DiscountsPage({ searchParams }: PageProps<"/admin/discounts">) {
  const sp = await searchParams;
  const filters = {
    q: str(sp.q, 40),
    status: oneOf(sp.status, EFFECTIVE_DISCOUNT_STATUSES),
    type: oneOf(sp.type, ["PERCENTAGE", "FIXED_AMOUNT", "FREE_SHIPPING"] as const),
    sort: oneOf(sp.sort, ["updated", "created", "code", "expires"] as const),
  };
  const page = pageNumber(sp.page);
  const { rows, total, pageCount } = await listDiscounts({ ...filters, page });

  return (
    <>
      <PageHeader
        title="Sooduskoodid"
        breadcrumbs={[{ label: "Pood" }, { label: "Sooduskoodid" }]}
        description="Staatus on tegelik olek praegu: aktiivne kood, mille algus on tulevikus, on „Ajastatud“; möödunud lõpuga kood on „Aegunud“. Kasutus loetakse kinnitatud tellimustest (aktiveerub koos tellimuste süsteemiga)."
        actions={
          <ButtonLink href="/admin/discounts/new" size="sm">
            <Plus className="size-4" aria-hidden /> Uus sooduskood
          </ButtonLink>
        }
      />
      <FilterForm action="/admin/discounts" resetHref="/admin/discounts">
        <SearchField defaultValue={filters.q} placeholder="Otsi koodi või nime…" />
        <SelectFilter name="status" label="Staatus" value={filters.status} options={EFFECTIVE_DISCOUNT_STATUSES.map((s) => ({ value: s, label: STATUS_OPTIONS[s] }))} />
        <SelectFilter name="type" label="Tüüp" value={filters.type} options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
        <SelectFilter
          name="sort"
          label="Järjestus"
          value={filters.sort}
          options={[
            { value: "updated", label: "Viimati muudetud" },
            { value: "created", label: "Uusimad" },
            { value: "code", label: "Kood A–Z" },
            { value: "expires", label: "Lõpeb varem" },
          ]}
        />
      </FilterForm>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.discount.id}
        caption="Sooduskoodid"
        empty={{ title: "Sooduskoode pole", description: "Loo esimene kood nupuga „Uus sooduskood“." }}
      />
      <Pagination basePath="/admin/discounts" params={{ ...filters }} page={Math.min(page, pageCount)} pageCount={pageCount} total={total} />
    </>
  );
}
