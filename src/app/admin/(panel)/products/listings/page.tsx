import type { Metadata } from "next";
import Link from "next/link";
import { BulkActionBar } from "@/components/admin/bulk-actions";
import { DataTable, type Column } from "@/components/admin/data-table";
import { FilterForm, SearchField, SelectFilter } from "@/components/admin/filters";
import { fmtCents, fmtGb } from "@/components/admin/format";
import { Pagination } from "@/components/admin/pagination";
import { Badge, Missing, PageHeader, StatusBadge } from "@/components/admin/ui";
import { LISTING_ISSUES, listingIssuesOf, type ListingIssue } from "@/domain/admin/data-quality-rules";
import { CATALOG_STATUS_VALUES } from "@/domain/admin/product-edit";
import { GRADE_CODES } from "@/domain/grade/grades";
import { bulkListingsAction } from "@/server/admin/products/actions";
import { listListings, listModelOptions } from "@/server/admin/products/queries";
import { oneOf, pageNumber, str, uuidParam } from "@/server/admin/search-params";

/** Admin on alati päringupõhine (sessioon, värsked andmed) — eelrenderdust ega "instant" navigeerimist ei kasutata. */
export const instant = false;

export const metadata: Metadata = { title: "Konfiguratsioonid" };

type Row = Awaited<ReturnType<typeof listListings>>["rows"][number];

const columns: Column<Row>[] = [
  {
    key: "sku",
    header: "SKU",
    mobile: "title",
    cell: ({ effective, modelLabel }) => (
      <span className="flex flex-col">
        <Link href={`/admin/products/listings/${effective.id}`} className="font-medium text-primary hover:underline">
          {effective.sku}
        </Link>
        <span className="text-xs text-muted md:hidden">{modelLabel}</span>
      </span>
    ),
  },
  {
    key: "model",
    header: "Mudel",
    mobile: "hidden",
    cell: ({ modelId, modelLabel }) => (
      <Link href={`/admin/products/models/${modelId}`} className="hover:underline">
        {modelLabel}
      </Link>
    ),
  },
  { key: "cpu", header: "CPU", cell: ({ effective }) => effective.cpu ?? <Missing /> },
  { key: "ram", header: "RAM / SSD", cell: ({ effective }) => `${fmtGb(effective.ramGb) ?? "?"} / ${fmtGb(effective.storageGb) ?? "?"}` },
  { key: "grade", header: "Seisukord", cell: ({ effective }) => effective.grade ?? <Missing /> },
  { key: "stock", header: "Laos", align: "right", cell: ({ effective }) => effective.stock ?? (effective.available === true ? "saadaval" : effective.available === false ? "ei" : <Missing />) },
  { key: "cost", header: "Ostuhind", align: "right", mobile: "hidden", cell: ({ effective }) => fmtCents(effective.supplierPriceCents) ?? <Missing /> },
  { key: "price", header: "Müügihind", align: "right", cell: ({ effective }) => fmtCents(effective.salePriceCents) ?? <Missing /> },
  { key: "status", header: "Staatus", cell: ({ effective }) => <StatusBadge status={effective.status} /> },
  {
    key: "issues",
    header: "Probleemid",
    mobile: "hidden",
    cell: ({ effective }) => {
      const issues = listingIssuesOf(effective);
      return issues.length ? <Badge tone="warning">{issues.length}</Badge> : <span className="text-muted">—</span>;
    },
  },
];

export default async function ListingsPage({ searchParams }: PageProps<"/admin/products/listings">) {
  const sp = await searchParams;
  const filters = {
    q: str(sp.q),
    status: oneOf(sp.status, CATALOG_STATUS_VALUES),
    grade: oneOf(sp.grade, GRADE_CODES),
    model: uuidParam(sp.model),
    issue: oneOf(sp.issue, Object.keys(LISTING_ISSUES) as ListingIssue[]),
    sort: oneOf(sp.sort, ["sku", "price-asc", "price-desc", "stock", "updated"] as const),
  };
  const page = pageNumber(sp.page);
  const [{ rows, total, pageCount }, models] = await Promise.all([listListings({ ...filters, page }), listModelOptions()]);

  return (
    <>
      <PageHeader
        title="Konfiguratsioonid"
        breadcrumbs={[{ label: "Kataloog" }, { label: "Konfiguratsioonid" }]}
        description="Tarnija pakkumised (konkreetne konfiguratsioon: CPU, RAM, SSD, seisukord, laoseis, hind). Poes on nähtavad ainult aktiivsed ja täielike andmetega pakkumised."
      />
      {filters.issue && (
        <p className="mb-3 rounded-md bg-warning-soft px-3 py-2 text-sm">
          Filter: <strong>{LISTING_ISSUES[filters.issue].label}</strong> — {LISTING_ISSUES[filters.issue].description}
        </p>
      )}
      <FilterForm action="/admin/products/listings" resetHref="/admin/products/listings">
        <SearchField defaultValue={filters.q} placeholder="SKU, CPU, mudel…" />
        <SelectFilter name="status" label="Staatus" value={filters.status} options={[{ value: "ACTIVE", label: "Aktiivne" }, { value: "HIDDEN", label: "Peidetud" }, { value: "ARCHIVED", label: "Arhiveeritud" }]} />
        <SelectFilter name="grade" label="Seisukord" value={filters.grade} options={GRADE_CODES.map((g) => ({ value: g, label: g }))} />
        <SelectFilter name="model" label="Mudel" value={filters.model} options={models.map((m) => ({ value: m.id, label: m.label }))} />
        <SelectFilter name="issue" label="Probleem" value={filters.issue} options={Object.entries(LISTING_ISSUES).map(([value, { label }]) => ({ value, label }))} />
        <SelectFilter
          name="sort"
          label="Järjestus"
          value={filters.sort}
          options={[
            { value: "sku", label: "SKU" },
            { value: "price-asc", label: "Hind ↑" },
            { value: "price-desc", label: "Hind ↓" },
            { value: "stock", label: "Laoseis" },
            { value: "updated", label: "Viimati muudetud" },
          ]}
        />
      </FilterForm>
      <div className="mb-3">
        <BulkActionBar
          formId="listings-bulk"
          entityLabel="konfiguratsiooni"
          action={bulkListingsAction}
          options={[
            { value: "activate", label: "Aktiveeri" },
            { value: "hide", label: "Peida poest" },
          ]}
        />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(row) => row.effective.id} caption="Konfiguratsioonid" selectionForm="listings-bulk" empty={{ title: "Konfiguratsioone ei leitud", description: "Muuda filtreid või otsingut." }} />
      <Pagination basePath="/admin/products/listings" params={{ ...filters }} page={Math.min(page, pageCount)} pageCount={pageCount} total={total} />
    </>
  );
}
