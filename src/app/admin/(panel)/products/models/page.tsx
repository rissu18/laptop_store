import type { Metadata } from "next";
import Link from "next/link";
import { BulkActionBar } from "@/components/admin/bulk-actions";
import { DataTable, type Column } from "@/components/admin/data-table";
import { FilterForm, SearchField, SelectFilter } from "@/components/admin/filters";
import { Pagination } from "@/components/admin/pagination";
import { Badge, Missing, PageHeader, StatusBadge } from "@/components/admin/ui";
import { MODEL_ISSUES, type ModelIssue } from "@/domain/admin/data-quality-rules";
import { CATALOG_STATUS_VALUES } from "@/domain/admin/product-edit";
import { BRAND_CODES, BRAND_NAMES, type BrandCode } from "@/domain/catalog/types";
import { formatEur } from "@/domain/money/money";
import { bulkModelsAction } from "@/server/admin/products/actions";
import { listModels } from "@/server/admin/products/queries";
import { oneOf, pageNumber, str } from "@/server/admin/search-params";

/** Admin on alati päringupõhine (sessioon, värsked andmed) — eelrenderdust ega "instant" navigeerimist ei kasutata. */
export const instant = false;

export const metadata: Metadata = { title: "Mudelid" };

type Row = Awaited<ReturnType<typeof listModels>>["rows"][number];

const columns: Column<Row>[] = [
  {
    key: "model",
    header: "Mudel",
    mobile: "title",
    cell: (row) => (
      <Link href={`/admin/products/models/${row.model.id}`} className="font-medium text-primary hover:underline">
        {row.model.family} {row.model.model}
      </Link>
    ),
  },
  { key: "brand", header: "Tootja", cell: (row) => BRAND_NAMES[row.model.manufacturer as BrandCode] ?? row.model.manufacturer },
  { key: "status", header: "Staatus", cell: (row) => <StatusBadge status={row.model.status} /> },
  { key: "featured", header: "Esiletõstetud", cell: (row) => (row.model.featured ? <Badge tone="primary">Jah</Badge> : <span className="text-muted">—</span>) },
  { key: "listings", header: "Konfiguratsioone", align: "right", cell: (row) => `${row.activeListingCount} / ${row.listingCount}` },
  { key: "images", header: "Pilte", align: "right", cell: (row) => (row.imageCount > 0 ? row.imageCount : <Badge tone="warning">0</Badge>) },
  { key: "icecat", header: "Icecat", cell: (row) => <StatusBadge status={row.icecatStatus} /> },
  { key: "price", header: "Alates", align: "right", cell: (row) => (row.minPrice !== null ? formatEur(row.minPrice) : <Missing />) },
];

export default async function ModelsPage({ searchParams }: PageProps<"/admin/products/models">) {
  const sp = await searchParams;
  const filters = {
    q: str(sp.q),
    status: oneOf(sp.status, CATALOG_STATUS_VALUES),
    brand: oneOf(sp.brand, BRAND_CODES),
    featured: oneOf(sp.featured, ["yes", "no"] as const),
    issue: oneOf(sp.issue, Object.keys(MODEL_ISSUES) as ModelIssue[]),
    sort: oneOf(sp.sort, ["name", "updated", "listings"] as const),
  };
  const page = pageNumber(sp.page);
  const { rows, total, pageCount } = await listModels({ ...filters, page });

  return (
    <>
      <PageHeader
        title="Mudelid"
        breadcrumbs={[{ label: "Kataloog" }, { label: "Mudelid" }]}
        description="Tootemudel (nt ThinkPad T14 Gen 3) koondab tarnija konfiguratsioonid ja pildid. Pildid ja kirjeldus on mudeli tasemel."
      />
      {filters.issue && (
        <p className="mb-3 rounded-md bg-warning-soft px-3 py-2 text-sm">
          Filter: <strong>{MODEL_ISSUES[filters.issue].label}</strong> — {MODEL_ISSUES[filters.issue].description}
        </p>
      )}
      <FilterForm action="/admin/products/models" resetHref="/admin/products/models">
        <SearchField defaultValue={filters.q} placeholder="Otsi mudelit…" />
        <SelectFilter name="status" label="Staatus" value={filters.status} options={[{ value: "ACTIVE", label: "Aktiivne" }, { value: "HIDDEN", label: "Peidetud" }, { value: "ARCHIVED", label: "Arhiveeritud" }]} />
        <SelectFilter name="brand" label="Tootja" value={filters.brand} options={BRAND_CODES.map((b) => ({ value: b, label: BRAND_NAMES[b] }))} />
        <SelectFilter name="featured" label="Esiletõstetud" value={filters.featured} options={[{ value: "yes", label: "Jah" }, { value: "no", label: "Ei" }]} />
        <SelectFilter name="issue" label="Probleem" value={filters.issue} options={Object.entries(MODEL_ISSUES).map(([value, { label }]) => ({ value, label }))} />
        <SelectFilter name="sort" label="Järjestus" value={filters.sort} options={[{ value: "name", label: "Nimi" }, { value: "listings", label: "Konfiguratsioone" }, { value: "updated", label: "Viimati muudetud" }]} />
      </FilterForm>
      <div className="mb-3">
        <BulkActionBar
          formId="models-bulk"
          entityLabel="mudeli"
          action={bulkModelsAction}
          options={[
            { value: "activate", label: "Aktiveeri" },
            { value: "hide", label: "Peida poest" },
            { value: "feature", label: "Tõsta esile" },
            { value: "unfeature", label: "Eemalda esiletõstmine" },
          ]}
        />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(row) => row.model.id} caption="Tootemudelid" selectionForm="models-bulk" empty={{ title: "Mudeleid ei leitud", description: "Muuda filtreid või otsingut." }} />
      <Pagination basePath="/admin/products/models" params={{ ...filters }} page={Math.min(page, pageCount)} pageCount={pageCount} total={total} />
    </>
  );
}
