import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EntityEditForm, type FormSection } from "@/components/admin/entity-form";
import { fmtCents, fmtDateTime, toDisplay, toInput } from "@/components/admin/format";
import { Card, DefinitionList, PageHeader, StatusBadge } from "@/components/admin/ui";
import { LISTING_ISSUES, listingIssuesOf } from "@/domain/admin/data-quality-rules";
import { CATALOG_STATUS_VALUES, STATUS_LABELS } from "@/domain/admin/product-edit";
import { CPU_FAMILIES, KEYBOARD_LAYOUTS } from "@/domain/catalog/types";
import { GRADE_CODES } from "@/domain/grade/grades";
import { updateListingAction } from "@/server/admin/products/actions";
import { getListingDetail } from "@/server/admin/products/queries";
import { uuidParam } from "@/server/admin/search-params";
import { publicListingId } from "@/server/db/seed/seed-catalog";

/** Admin on alati päringupõhine (sessioon, värsked andmed) — eelrenderdust ega "instant" navigeerimist ei kasutata. */
export const instant = false;

export const metadata: Metadata = { title: "Konfiguratsioon" };

const SECTIONS: FormSection[] = [
  {
    title: "Riistvara",
    description: "Tarnija väljad — sinu muudatus salvestub parandusena (tarnija väärtus jääb alles ja sync ei kirjuta parandust üle).",
    fields: [
      { name: "cpu", label: "Protsessor", type: "text", overridable: true },
      { name: "cpuFamily", label: "CPU pere", type: "select", overridable: true, options: CPU_FAMILIES.map((f) => ({ value: f, label: f })) },
      { name: "cpuGeneration", label: "CPU põlvkond", type: "text", overridable: true, hint: "nt intel-12, amd-6000" },
      { name: "ramGb", label: "RAM (GB)", type: "number", overridable: true },
      { name: "ramType", label: "RAM tüüp", type: "text", overridable: true },
      { name: "storageGb", label: "SSD (GB)", type: "number", overridable: true },
      { name: "gpu", label: "Graafika", type: "text", overridable: true },
      { name: "gpuDedicated", label: "Eraldi graafikakaart", type: "tri", overridable: true },
      { name: "screenSizeIn", label: "Ekraan (tolli)", type: "number", overridable: true },
      { name: "resolution", label: "Resolutsioon", type: "text", overridable: true, hint: "nt 1920x1080" },
      { name: "resolutionLabel", label: "Resolutsiooni nimi", type: "text", overridable: true },
      { name: "panel", label: "Paneel", type: "text", overridable: true },
      { name: "touchscreen", label: "Puuteekraan", type: "tri", overridable: true },
      { name: "keyboard", label: "Klaviatuur", type: "select", overridable: true, options: KEYBOARD_LAYOUTS.map((k) => ({ value: k, label: k })) },
      { name: "operatingSystem", label: "Operatsioonisüsteem", type: "text", overridable: true },
    ],
  },
  {
    title: "Seisukord, garantii ja ladu",
    fields: [
      { name: "grade", label: "Seisukord", type: "select", overridable: true, options: GRADE_CODES.map((g) => ({ value: g, label: g })) },
      { name: "batteryHealthPct", label: "Aku seisukord (%)", type: "number", overridable: true },
      { name: "chargerIncluded", label: "Laadija kaasas", type: "tri", overridable: true },
      { name: "warrantyMonths", label: "Garantii (kuud)", type: "number", overridable: true },
      { name: "stock", label: "Laoseis", type: "number", overridable: true },
    ],
  },
  {
    title: "Hind ja nähtavus",
    description: "Müügihind ja staatus on admini väljad. Hinnareeglite rakendamine (Hinnastamine) võib müügihinda muuta.",
    fields: [
      { name: "supplierPriceCents", label: "Ostuhind", type: "euro", overridable: true },
      { name: "salePriceCents", label: "Müügihind", type: "euro", hint: "Tühi = puudub (pakkumine ei jõua poodi)" },
      { name: "status", label: "Staatus", type: "select", required: true, options: CATALOG_STATUS_VALUES.map((s) => ({ value: s, label: STATUS_LABELS[s] })) },
    ],
  },
];

const EURO_FIELDS = new Set(["supplierPriceCents", "salePriceCents"]);

export default async function ListingDetailPage({ params }: PageProps<"/admin/products/listings/[id]">) {
  const id = uuidParam((await params).id);
  if (!id) notFound();
  const data = await getListingDetail(id);
  if (!data) notFound();
  const { effective: listing, supplier, overrides, model } = data;
  const fields = SECTIONS.flatMap((s) => s.fields);
  const defaults = Object.fromEntries(fields.map((f) => [f.name, toInput((listing as Record<string, unknown>)[f.name], EURO_FIELDS.has(f.name) ? "euro" : undefined)]));
  const supplierDisplay = Object.fromEntries(fields.filter((f) => f.overridable).map((f) => [f.name, toDisplay((supplier as Record<string, unknown>)[f.name], EURO_FIELDS.has(f.name) ? "euro" : undefined)]));
  const issues = listingIssuesOf(listing);
  const margin = listing.salePriceCents !== null && listing.supplierPriceCents !== null ? listing.salePriceCents - listing.supplierPriceCents : null;

  return (
    <>
      <PageHeader
        title={listing.sku}
        breadcrumbs={[{ label: "Konfiguratsioonid", href: "/admin/products/listings" }, { label: listing.sku }]}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={listing.status} />
            <Link href={`/admin/products/models/${model.id}`} className="text-primary hover:underline">
              {model.family} {model.model}
            </Link>
            {listing.status === "ACTIVE" && model.status === "ACTIVE" && (
              <Link href={`/toode/${model.slug}?konfiguratsioon=${publicListingId(listing.supplier, listing.supplierProductId)}`} target="_blank" rel="noopener" className="text-primary hover:underline">
                Vaata poes ↗
              </Link>
            )}
          </span>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <EntityEditForm
          key={listing.updatedAt.toISOString()}
          entity="listing"
          id={listing.id}
          sections={SECTIONS}
          defaults={defaults}
          supplier={supplierDisplay}
          overridden={Object.keys(overrides)}
          action={updateListingAction.bind(null, listing.id)}
        />
        <aside className="flex min-w-0 flex-col gap-6">
          <Card title="Andmekvaliteet">
            {issues.length === 0 ? (
              <p className="text-sm text-success">Probleeme ei leitud.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {issues.map((issue) => (
                  <li key={issue}>
                    {LISTING_ISSUES[issue].label} — <span className="text-muted">{LISTING_ISSUES[issue].description}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Tarnija">
            <DefinitionList
              items={[
                { label: "Tarnija", value: listing.supplier },
                { label: "Tarnija SKU", value: listing.supplierSku },
                { label: "Käibemaksu režiim", value: listing.vatScheme },
                { label: "Tarneaeg", value: listing.deliveryMinDays !== null ? `${listing.deliveryMinDays}–${listing.deliveryMaxDays} päeva` : null },
                { label: "Marginaal (müük − ost)", value: fmtCents(margin) },
                { label: "Esimest korda nähtud", value: fmtDateTime(listing.firstSeenAt) },
                { label: "Viimane sync", value: fmtDateTime(listing.lastSyncedAt) },
                { label: "Muudetud", value: fmtDateTime(listing.updatedAt) },
              ]}
            />
            <Link href={`/admin/system/activity?entity=${listing.id}`} className="mt-3 inline-block text-sm text-primary hover:underline">
              Muudatuste ajalugu →
            </Link>
          </Card>
        </aside>
      </div>
    </>
  );
}
