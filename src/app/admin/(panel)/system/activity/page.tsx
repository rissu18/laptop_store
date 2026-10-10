import type { Metadata } from "next";
import { DataTable } from "@/components/admin/data-table";
import { FilterForm, SelectFilter } from "@/components/admin/filters";
import { fmtDateTime } from "@/components/admin/format";
import { Pagination } from "@/components/admin/pagination";
import { Badge, Missing, PageHeader } from "@/components/admin/ui";
import { oneOf, pageNumber, str, uuidParam } from "@/server/admin/search-params";
import { listActivity } from "@/server/admin/system/queries";

/** Admin on alati päringupõhine (sessioon, värsked andmed) — eelrenderdust ega "instant" navigeerimist ei kasutata. */
export const instant = false;

export const metadata: Metadata = { title: "Tegevuslogi" };

const ENTITY_TYPES = ["ProductModel", "SupplierListing", "ProductImage", "PricingRules", "StoreSetting", "DiscountCode", "AdminUser"] as const;
const ENTITY_LABELS: Record<string, string> = {
  ProductModel: "Mudel",
  SupplierListing: "Konfiguratsioon",
  ProductImage: "Pilt",
  PricingRules: "Hinnareeglid",
  StoreSetting: "Seaded",
  DiscountCode: "Sooduskood",
  AdminUser: "Admin",
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

export default async function ActivityPage({ searchParams }: PageProps<"/admin/system/activity">) {
  const sp = await searchParams;
  const filters = { entity: uuidParam(sp.entity) ?? str(sp.entity, 40), entityType: oneOf(sp.entityType, ENTITY_TYPES), action: str(sp.action, 40) };
  const page = pageNumber(sp.page);
  const { rows, total, pageCount } = await listActivity({ ...filters, page });

  return (
    <>
      <PageHeader
        title="Tegevuslogi"
        breadcrumbs={[{ label: "Süsteem" }, { label: "Tegevuslogi" }]}
        description="Kes muutis mida ja millal (vana → uus väärtus). Logi kirjutatakse samas tehingus muudatusega."
      />
      <FilterForm action="/admin/system/activity" resetHref="/admin/system/activity">
        <SelectFilter name="entityType" label="Objekt" value={filters.entityType} options={ENTITY_TYPES.map((t) => ({ value: t, label: ENTITY_LABELS[t] }))} />
        <SelectFilter
          name="action"
          label="Tegevus"
          value={filters.action}
          options={[
            { value: "model.", label: "Mudeli muudatused" },
            { value: "listing.", label: "Konfiguratsiooni muudatused" },
            { value: "image.", label: "Pildid" },
            { value: "icecat.", label: "Icecat" },
            { value: "pricing.", label: "Hinnastamine" },
            { value: "settings.", label: "Seaded" },
            { value: "discount.", label: "Sooduskoodid" },
            { value: "auth.", label: "Sisse-/väljalogimine" },
          ]}
        />
        {filters.entity && <input type="hidden" name="entity" value={filters.entity} />}
      </FilterForm>
      {filters.entity && <p className="mb-3 text-sm text-muted">Näidatakse ühe objekti ajalugu.</p>}
      <DataTable
        rows={rows}
        rowKey={(row) => String(row.id)}
        caption="Tegevuslogi"
        empty={{ title: "Tegevusi pole" }}
        columns={[
          { key: "time", header: "Aeg", cell: (row) => <span className="whitespace-nowrap">{fmtDateTime(row.createdAt)}</span> },
          { key: "admin", header: "Admin", cell: (row) => row.adminEmail ?? <Missing label="süsteem/CLI" /> },
          { key: "action", header: "Tegevus", mobile: "title", cell: (row) => <code className="text-xs">{row.action}</code> },
          {
            key: "entity",
            header: "Objekt",
            cell: (row) => (
              <span className="flex flex-wrap items-center gap-1.5">
                <Badge>{ENTITY_LABELS[row.entityType] ?? row.entityType}</Badge>
                {row.entityLabel ?? row.entityId}
              </span>
            ),
          },
          {
            key: "changes",
            header: "Muudatused",
            cell: (row) =>
              row.changes ? (
                <ul className="space-y-0.5 text-xs">
                  {Object.entries(row.changes).map(([field, change]) => (
                    <li key={field} className="break-words">
                      <span className="font-medium">{field}</span>: <span className="text-muted line-through">{formatValue(change.from)}</span> → {formatValue(change.to)}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted">—</span>
              ),
          },
        ]}
      />
      <Pagination basePath="/admin/system/activity" params={{ ...filters }} page={Math.min(page, pageCount)} pageCount={pageCount} total={total} />
    </>
  );
}
