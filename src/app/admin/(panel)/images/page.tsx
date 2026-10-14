import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { DataTable, type Column } from "@/components/admin/data-table";
import { FilterForm, SelectFilter } from "@/components/admin/filters";
import { Pagination } from "@/components/admin/pagination";
import { Badge, Missing, PageHeader } from "@/components/admin/ui";
import { adminModelTitle } from "@/domain/admin/display";
import { IMAGE_STATES } from "@/domain/admin/image-state";
import { listModelImageSummaries } from "@/server/admin/images/queries";
import { oneOf, pageNumber } from "@/server/admin/search-params";

/** Admin on alati päringupõhine (sessioon, värsked andmed) — eelrenderdust ega "instant" navigeerimist ei kasutata. */
export const instant = false;

export const metadata: Metadata = { title: "Pildid" };

type Row = Awaited<ReturnType<typeof listModelImageSummaries>>["rows"][number];

const columns: Column<Row>[] = [
  {
    key: "thumb",
    header: "Põhipilt",
    mobile: "hidden",
    cell: (row) =>
      row.mainThumb ? (
        <span className="relative block size-12 overflow-hidden rounded border border-border bg-white">
          <Image src={row.mainThumb} alt="" fill sizes="48px" className="object-contain" />
        </span>
      ) : (
        <span className="flex size-12 items-center justify-center rounded border border-dashed border-border-strong text-[10px] text-subtle">puudub</span>
      ),
  },
  {
    key: "model",
    header: "Mudel",
    mobile: "title",
    cell: (row) => (
      <Link href={`/admin/images/${row.model.id}`} className="font-medium text-primary hover:underline">
        {adminModelTitle(row.model)}
      </Link>
    ),
  },
  { key: "visible", header: "Nähtavaid pilte", align: "right", cell: (row) => (row.visible > 0 ? row.visible : <Badge tone="warning">0</Badge>) },
  { key: "hidden", header: "Peidetud", align: "right", cell: (row) => row.hidden },
  { key: "state", header: "Olek", cell: (row) => <Badge tone={IMAGE_STATES[row.state].tone}>{IMAGE_STATES[row.state].label}</Badge> },
  { key: "icecatId", header: "Icecat ID", cell: (row) => row.icecatId ?? <Missing /> },
];

export default async function ImagesPage({ searchParams }: PageProps<"/admin/images">) {
  const sp = await searchParams;
  const filters = {
    coverage: oneOf(sp.coverage, ["with", "without", "single"] as const),
    icecat: oneOf(sp.icecat, ["MATCHED", "NEEDS_REVIEW", "NOT_FOUND", "ERROR", "REJECTED"] as const),
  };
  const page = pageNumber(sp.page);
  const { rows, total, pageCount } = await listModelImageSummaries({ ...filters, page });

  return (
    <>
      <PageHeader
        title="Pildid"
        breadcrumbs={[{ label: "Kataloog" }, { label: "Pildid" }]}
        description="Mudeli pildid (Icecat, Laptopid.ee koopiad, admin). Poes kuvatakse mudeli koondgalerii: need pildid + müügis Laptopid.ee pakkumiste fotod (duplikaadid eemaldatakse). Siin saab valida põhipildi, muuta järjekorda ja peita eksitavaid pilte."
        actions={
          <Link href="/admin/images/review" className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-semibold text-on-primary hover:bg-primary-hover">
            Icecati ülevaatus →
          </Link>
        }
      />
      <div className="mb-4 rounded-md border border-border bg-surface px-4 py-3 text-sm">
        <p className="font-medium">
          Käsitsi üleslaadimine <Badge>Tulekul</Badge>
        </p>
        <p className="mt-1 text-muted">
          Vajab püsivat failisalvestust (nt S3-ühilduv objektisalvestus). Vercelis ei ole failisüsteem püsiv, seega üleslaaditud fail kaoks — funktsioon on seni välja lülitatud.
        </p>
      </div>
      <FilterForm action="/admin/images" resetHref="/admin/images">
        <SelectFilter
          name="coverage"
          label="Pildid"
          value={filters.coverage}
          options={[
            { value: "with", label: "Pildiga" },
            { value: "without", label: "Ilma pildita" },
            { value: "single", label: "Ainult üks pilt" },
          ]}
        />
        <SelectFilter
          name="icecat"
          label="Icecat"
          value={filters.icecat}
          options={[
            { value: "MATCHED", label: "Leitud" },
            { value: "NEEDS_REVIEW", label: "Vajab ülevaatust" },
            { value: "NOT_FOUND", label: "Ei leitud" },
            { value: "ERROR", label: "Viga" },
            { value: "REJECTED", label: "Tagasi lükatud" },
          ]}
        />
      </FilterForm>
      <DataTable rows={rows} columns={columns} rowKey={(row) => row.model.id} caption="Mudelite pildid" empty={{ title: "Mudeleid ei leitud" }} />
      <Pagination basePath="/admin/images" params={{ ...filters }} page={Math.min(page, pageCount)} pageCount={pageCount} total={total} />
    </>
  );
}
