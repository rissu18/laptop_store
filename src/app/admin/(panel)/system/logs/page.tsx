import type { Metadata } from "next";
import { DataTable } from "@/components/admin/data-table";
import { FilterForm, SearchField, SelectFilter } from "@/components/admin/filters";
import { fmtDateTime } from "@/components/admin/format";
import { Pagination } from "@/components/admin/pagination";
import { PageHeader, StatusBadge } from "@/components/admin/ui";
import { oneOf, pageNumber, str } from "@/server/admin/search-params";
import { TIME_RANGES, listSystemLogs, type TimeRange } from "@/server/admin/system/queries";
import { LOG_LEVELS, LOG_SOURCES } from "@/server/db/schema";

/** Admin on alati päringupõhine (sessioon, värsked andmed) — eelrenderdust ega "instant" navigeerimist ei kasutata. */
export const instant = false;

export const metadata: Metadata = { title: "Logid" };

const SOURCE_LABELS: Record<string, string> = { APPLICATION: "Rakendus", DATABASE: "Andmebaas", ADMIN: "Admin", AUTH: "Autentimine", ICECAT: "Icecat" };

export default async function LogsPage({ searchParams }: PageProps<"/admin/system/logs">) {
  const sp = await searchParams;
  const filters = {
    level: oneOf(sp.level, LOG_LEVELS),
    source: oneOf(sp.source, LOG_SOURCES),
    range: oneOf(sp.range, Object.keys(TIME_RANGES) as TimeRange[]),
    q: str(sp.q),
  };
  const page = pageNumber(sp.page);
  const { rows, total, pageCount } = await listSystemLogs({ ...filters, page });

  return (
    <>
      <PageHeader
        title="Logid"
        breadcrumbs={[{ label: "Süsteem" }, { label: "Logid" }]}
        description="Rakenduse, andmebaasi, admini, autentimise ja Icecati sündmused. Saladusi (paroolid, tokenid, ühendusstringid) ei logita. Tarnija sünkroniseerimise logid lisanduvad koos tarnija ühendamisega."
      />
      <FilterForm action="/admin/system/logs" resetHref="/admin/system/logs">
        <SearchField defaultValue={filters.q} placeholder="Sõnum või vea ID…" />
        <SelectFilter name="level" label="Tase" value={filters.level} options={LOG_LEVELS.map((l) => ({ value: l, label: l }))} />
        <SelectFilter name="source" label="Allikas" value={filters.source} options={LOG_SOURCES.map((s) => ({ value: s, label: SOURCE_LABELS[s] ?? s }))} />
        <SelectFilter
          name="range"
          label="Aeg"
          value={filters.range}
          options={[
            { value: "1h", label: "Viimane tund" },
            { value: "24h", label: "24 tundi" },
            { value: "7d", label: "7 päeva" },
            { value: "30d", label: "30 päeva" },
          ]}
        />
      </FilterForm>
      <DataTable
        rows={rows}
        rowKey={(row) => String(row.id)}
        caption="Süsteemilogi"
        empty={{ title: "Logikirjeid pole", description: "Valitud filtritega sündmusi ei leitud." }}
        columns={[
          { key: "time", header: "Aeg", cell: (row) => <span className="whitespace-nowrap">{fmtDateTime(row.createdAt)}</span> },
          { key: "level", header: "Tase", cell: (row) => <StatusBadge status={row.level} /> },
          { key: "source", header: "Allikas", cell: (row) => SOURCE_LABELS[row.source] ?? row.source },
          {
            key: "message",
            header: "Sõnum",
            mobile: "title",
            cell: (row) => (
              <span className="block">
                {row.message}
                {row.errorId && <span className="ml-2 text-xs text-muted">ID {row.errorId}</span>}
                {row.details ? (
                  <details className="mt-1 text-xs text-muted">
                    <summary className="cursor-pointer">Detailid</summary>
                    <pre className="mt-1 max-w-xl overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(row.details, null, 2)}</pre>
                  </details>
                ) : null}
              </span>
            ),
          },
        ]}
      />
      <Pagination basePath="/admin/system/logs" params={{ ...filters }} page={Math.min(page, pageCount)} pageCount={pageCount} total={total} />
    </>
  );
}
