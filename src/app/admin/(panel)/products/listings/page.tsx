import type { Metadata } from "next";
import Link from "next/link";
import { BulkActionBar } from "@/components/admin/bulk-actions";
import { DataTable, type Column } from "@/components/admin/data-table";
import { FilterForm, SearchField, SelectFilter } from "@/components/admin/filters";
import { fmtCents, fmtCustomerPrice, fmtGb } from "@/components/admin/format";
import { ModelCombobox } from "@/components/admin/model-combobox";
import { Pagination } from "@/components/admin/pagination";
import { Badge, Missing, PageHeader } from "@/components/admin/ui";
import { LISTING_ISSUES, LISTING_ISSUE_SHORT, listingIssuesOf, performanceIssuesOf, type ListingIssue } from "@/domain/admin/data-quality-rules";
import { supplierLabel } from "@/domain/admin/display";
import { CATALOG_STATUS_VALUES } from "@/domain/admin/product-edit";
import { GRADE_CODES } from "@/domain/grade/grades";
import { bulkListingsAction } from "@/server/admin/products/actions";
import { listListings, listModelOptions } from "@/server/admin/products/queries";
import { oneOf, pageNumber, str, uuidParam } from "@/server/admin/search-params";
import { describeVisibility } from "@/server/admin/sellable";

/** Admin on alati päringupõhine (sessioon, värsked andmed) — eelrenderdust ega "instant" navigeerimist ei kasutata. */
export const instant = false;

export const metadata: Metadata = { title: "Konfiguratsioonid" };

type Row = Awaited<ReturnType<typeof listListings>>["rows"][number] & { poes: ReturnType<typeof describeVisibility> };

const columns: Column<Row>[] = [
  {
    key: "sku",
    header: "SKU / mudel",
    mobile: "title",
    cell: ({ effective, modelId, modelLabel }) => (
      <span className="flex min-w-36 flex-col">
        <Link href={`/admin/products/listings/${effective.id}`} className="font-medium text-primary hover:underline">
          {effective.sku}
        </Link>
        <Link href={`/admin/products/models/${modelId}`} className="text-xs text-muted hover:underline">
          {modelLabel}
        </Link>
      </span>
    ),
  },
  { key: "supplier", header: "Tarnija", cell: ({ raw }) => <span className="whitespace-nowrap">{supplierLabel(raw.supplier)}</span> },
  {
    key: "shop",
    header: "Poes",
    // Sama reegel mis pood (storefrontVisibility); põhjus lühidalt, täpsem selgitus konfiguratsiooni lehel
    cell: ({ raw, poes }) =>
      poes.visible ? (
        <Badge tone="success">✓ Nähtav</Badge>
      ) : (
        <span title={poes.reason?.detail}>
          <Badge tone={raw.status === "ACTIVE" ? "warning" : "neutral"}>✕ {poes.reason?.short}</Badge>
        </span>
      ),
  },
  { key: "cpu", header: "CPU", cell: ({ effective }) => effective.cpu ?? <Missing /> },
  { key: "ram", header: "RAM / SSD", cell: ({ effective }) => `${fmtGb(effective.ramGb) ?? "?"} / ${fmtGb(effective.storageGb) ?? "?"}` },
  { key: "grade", header: "Klass", cell: ({ effective }) => effective.grade ?? <Missing /> },
  { key: "stock", header: "Laos", align: "right", cell: ({ effective }) => effective.stock ?? (effective.available === true ? "saadaval" : effective.available === false ? "ei" : <Missing />) },
  { key: "cost", header: "Ostuhind", align: "right", mobile: "hidden", cell: ({ effective }) => fmtCents(effective.supplierPriceCents) ?? <Missing /> },
  { key: "price", header: "Kliendihind", align: "right", cell: ({ effective }) => fmtCustomerPrice(effective.salePriceCents) ?? <Missing /> },
  {
    key: "issues",
    header: "Probleemid",
    mobile: "hidden",
    cell: ({ effective, raw }) => {
      const issues = [...listingIssuesOf(effective), ...performanceIssuesOf(raw)];
      if (!issues.length) return <span className="text-muted">—</span>;
      return (
        <ul className="space-y-0.5 text-xs">
          {issues.slice(0, 2).map((issue) => (
            <li key={issue} className="whitespace-nowrap" title={LISTING_ISSUES[issue].label}>
              {LISTING_ISSUE_SHORT[issue]}
            </li>
          ))}
          {issues.length > 2 && (
            <li className="text-muted" title={issues.slice(2).map((issue) => LISTING_ISSUES[issue].label).join(", ")}>
              +{issues.length - 2} veel
            </li>
          )}
        </ul>
      );
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
    supplier: oneOf(sp.supplier, ["laptopid", "tech", "foxway", "mock"] as const),
    hold: oneOf(sp.hold, ["REVIEW", "BLOCKED", "none"] as const),
    scope: oneOf(sp.scope, ["sellable", "not-sellable"] as const),
    sort: oneOf(sp.sort, ["sku", "price-asc", "price-desc", "stock", "updated"] as const),
  };
  const page = pageNumber(sp.page);
  const [{ rows: listRows, total, pageCount }, models] = await Promise.all([listListings({ ...filters, page }), listModelOptions()]);
  const rows: Row[] = listRows.map((row) => ({ ...row, poes: describeVisibility(row.raw, { status: row.modelStatus }, row.visibility) }));

  return (
    <>
      <PageHeader
        title="Konfiguratsioonid"
        breadcrumbs={[{ label: "Kataloog" }, { label: "Konfiguratsioonid" }]}
        description="Tarnija pakkumised (konkreetne konfiguratsioon: CPU, RAM, SSD, seisukord, laoseis, hind). Veerg „Poes“ kasutab sama reeglit mis pood (aktiivne mudel ja pakkumine, saadaval, kvaliteedi kinnipidamiseta, kohustuslikud andmed). Kliendihind täiseurodes nagu poes."
      />
      {filters.issue && (
        <p className="mb-3 rounded-md bg-warning-soft px-3 py-2 text-sm">
          Filter: <strong>{LISTING_ISSUES[filters.issue].label}</strong>{filters.scope === "sellable" && " (ainult poes nähtavad)"} — {LISTING_ISSUES[filters.issue].description}
        </p>
      )}
      <FilterForm action="/admin/products/listings" resetHref="/admin/products/listings">
        <SearchField defaultValue={filters.q} placeholder="SKU, CPU, mudel…" />
        <SelectFilter name="status" label="Staatus" value={filters.status} options={[{ value: "ACTIVE", label: "Aktiivne" }, { value: "HIDDEN", label: "Peidetud" }, { value: "ARCHIVED", label: "Arhiveeritud" }]} />
        <SelectFilter name="grade" label="Seisukord" value={filters.grade} options={GRADE_CODES.map((g) => ({ value: g, label: g }))} />
        <ModelCombobox name="model" label="Mudel" value={filters.model} options={models} />
        <SelectFilter name="supplier" label="Tarnija" value={filters.supplier} options={(["laptopid", "tech", "foxway", "mock"] as const).map((code) => ({ value: code, label: supplierLabel(code) }))} />
        <SelectFilter name="scope" label="Poes" value={filters.scope} options={[{ value: "sellable", label: "Nähtav" }, { value: "not-sellable", label: "Ei kuvata" }]} />
        <SelectFilter name="hold" label="Avaldamine" value={filters.hold} options={[{ value: "none", label: "Avaldatav" }, { value: "REVIEW", label: "Ülevaatus" }, { value: "BLOCKED", label: "Blokeeritud" }]} />
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
