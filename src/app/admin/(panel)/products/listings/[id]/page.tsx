import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EntityEditForm, type FormSection } from "@/components/admin/entity-form";
import { FoxwayListingCard } from "@/components/admin/foxway-listing-card";
import { fmtCents, fmtCustomerPrice, fmtDateTime, toDisplay, toInput } from "@/components/admin/format";
import { ProvenanceCard } from "@/components/admin/provenance-card";
import { ShopVisibility } from "@/components/admin/shop-visibility";
import { listingProvenance, performanceKeys } from "@/domain/admin/provenance";
import { Badge, Card, DefinitionList, PageHeader, StatusBadge } from "@/components/admin/ui";
import { adminModelTitle, supplierLabel } from "@/domain/admin/display";
import { storefrontHref } from "@/domain/admin/visibility";
import { LISTING_ISSUES, listingIssuesOf } from "@/domain/admin/data-quality-rules";
import { CATALOG_STATUS_VALUES, STATUS_LABELS } from "@/domain/admin/product-edit";
import { KEYBOARD_REGISTRY } from "@/domain/catalog/keyboard";
import { CPU_FAMILIES } from "@/domain/catalog/types";
import { GRADE_CODES } from "@/domain/grade/grades";
import { updateListingAction } from "@/server/admin/products/actions";
import { getListingDetail } from "@/server/admin/products/queries";
import { uuidParam } from "@/server/admin/search-params";
import { describeVisibility } from "@/server/admin/sellable";
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
      { name: "keyboard", label: "Klaviatuur", type: "select", overridable: true, options: KEYBOARD_REGISTRY.map((k) => ({ value: k.code, label: k.label })) },
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
      {
        name: "qualityHold",
        label: "Kvaliteedi kinnipidamine",
        type: "select",
        overridable: true,
        options: [
          { value: "REVIEW", label: "Ülevaatus — poes ei kuvata" },
          { value: "BLOCKED", label: "Blokeeritud — ei müüda" },
        ],
        hint: "— Puudub — = poes nähtav. Tarnija (nt Foxway rikke) otsuse muutmine salvestub parandusena; sync seda üle ei kirjuta.",
      },
    ],
  },
  {
    title: "Hind ja nähtavus",
    description: "Müügihind ja staatus on admini väljad. Hinnastamise reeglid muudavad ainult ostuhinnast hinnastatavaid pakkumisi (Laptopid.ee, Techvision ja Foxway annavad hinna ise — neid Hinnastamine ei puuduta). Kliendile kuvatakse hind täiseurodes.",
    fields: [
      { name: "supplierPriceCents", label: "Ostuhind", type: "euro", overridable: true },
      { name: "salePriceCents", label: "Müügihind", type: "euro", hint: "Tühi = puudub (pakkumine ei jõua poodi)" },
      { name: "status", label: "Staatus", type: "select", required: true, options: CATALOG_STATUS_VALUES.map((s) => ({ value: s, label: STATUS_LABELS[s] })) },
    ],
  },
];

const EURO_FIELDS = new Set(["supplierPriceCents", "salePriceCents"]);

/**
 * Tarnija hinnaga pakkumine (price_source = SUPPLIER, nt Laptopid.ee): müügihind on tarnija väli ja admini hind
 * salvestub parandusena (sync uuendab tarnija hinda, parandus jääb kehtima kuni "Taasta").
 */
function sectionsFor(priceSource: string, costKnown: boolean): FormSection[] {
  if (priceSource !== "SUPPLIER") return SECTIONS;
  return SECTIONS.map((section) =>
    section.title !== "Hind ja nähtavus"
      ? section
      : {
          ...section,
          description: costKnown
            ? "Müügihind ja ostuhind tulevad tarnija andmetest. Sinu hind salvestub parandusena — järgmine sync uuendab ainult tarnija hinda."
            : "Müügihind tuleb tarnijalt. Sinu hind salvestub parandusena — järgmine sync uuendab ainult tarnija hinda. Ostuhinda tarnija ei anna (marginaal teadmata).",
          fields: section.fields.map((field) =>
            field.name === "salePriceCents" ? { ...field, overridable: true, hint: "Tarnija müügihind; muutmisel kehtib sinu hind" } : field,
          ),
        },
  );
}

export default async function ListingDetailPage({ params }: PageProps<"/admin/products/listings/[id]">) {
  const id = uuidParam((await params).id);
  if (!id) notFound();
  const data = await getListingDetail(id);
  if (!data) notFound();
  const { effective: listing, supplier, overrides, model, units, visibility } = data;
  const poes = describeVisibility(supplier, model, visibility);
  const shopHref = storefrontHref({ visible: poes.visible, modelSlug: model.slug, publicListingId: publicListingId(listing.supplier, listing.supplierProductId) });
  const techKeyboardUnknown = listing.supplier === "tech" && !listing.keyboard;
  const sections = sectionsFor(listing.priceSource, supplier.supplierPriceCents !== null);
  const sourcePriceCents = typeof listing.details?.sourcePriceCents === "number" ? listing.details.sourcePriceCents : null;
  const activeUnits = units.filter((u) => u.available);
  const fields = sections.flatMap((s) => s.fields);
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
            <Badge>{supplierLabel(listing.supplier)}</Badge>
            <Link href={`/admin/products/models/${model.id}`} className="text-primary hover:underline">
              {adminModelTitle(model)}
            </Link>
            {shopHref ? (
              <Link href={shopHref} target="_blank" rel="noopener" className="text-primary hover:underline">
                Vaata poes ↗
              </Link>
            ) : (
              <span className="text-muted">Poes ei kuvata</span>
            )}
          </span>
        }
      />
      <ShopVisibility
        visible={poes.visible}
        checks={poes.checks}
        reason={poes.reason}
        deliveryLabel={poes.deliveryLabel}
        quantityUnknown={poes.quantityUnknown}
        customerPrice={fmtCustomerPrice(listing.salePriceCents)}
        shopHref={shopHref}
      />
      {techKeyboardUnknown && (
        <p className="mb-6 rounded-md border border-border bg-surface px-4 py-3 text-sm">
          <strong>Klaviatuur teadmata:</strong> Techvisioni hinnakirjas klaviatuuripaigutuse andmed puuduvad. Paigutust ei arvata — kui seade on kontrollitud, saab selle allpool parandusena määrata.
        </p>
      )}
      <div className="mb-6">
        <ProvenanceCard listingId={listing.id} rows={listingProvenance(supplier, model)} keys={performanceKeys(visibility.listing)} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <EntityEditForm
          key={listing.updatedAt.toISOString()}
          entity="listing"
          id={listing.id}
          sections={sections}
          defaults={defaults}
          supplier={supplierDisplay}
          overridden={Object.keys(overrides)}
          action={updateListingAction.bind(null, listing.id)}
        />
        <aside className="flex min-w-0 flex-col gap-6">
          {listing.supplier === "foxway" && (
            <FoxwayListingCard
              rawData={supplier.rawData}
              qualityHold={supplier.qualityHold}
              qualityHoldReason={supplier.qualityHoldReason}
              effectiveHold={listing.qualityHold}
              supplierVatMargin={supplier.supplierVatMargin}
              stock={listing.stock}
              lastSyncedAt={listing.lastSyncedAt}
            />
          )}
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
          {(sourcePriceCents !== null || units.length > 0) && (
            <Card title={listing.supplier === "tech" ? "Techvisioni hinnakiri" : "Tarnija seadmed"} description="Ainult adminile — seerianumbreid kliendile ei näidata.">
              <DefinitionList
                items={[
                  { label: "Tarnija", value: supplierLabel(listing.supplier) },
                  ...(sourcePriceCents !== null
                    ? [
                        { label: "Hinnakirja hind (M)", value: fmtCents(sourcePriceCents) },
                        { label: "Ostuhind (M − 20 €)", value: fmtCents(supplier.supplierPriceCents) },
                        { label: "Müügihind (M + 60 €)", value: fmtCents(supplier.salePriceCents) },
                        { label: "Kehtiv müügihind", value: overrides.salePriceCents !== undefined ? `${fmtCents(listing.salePriceCents)} (admini parandus)` : fmtCents(listing.salePriceCents) },
                        { label: "Kliendihind (poes)", value: fmtCustomerPrice(listing.salePriceCents) },
                      ]
                    : []),
                  { label: "Laoseis (täpne)", value: listing.stock === null ? null : `${listing.stock} tk` },
                  { label: "Seisukord", value: listing.grade },
                  { label: "Tarne", value: listing.deliveryMinDays !== null ? `${listing.deliveryMinDays}–${listing.deliveryMaxDays} tööpäeva` : null },
                  { label: "Müügis seadmeid", value: `${activeUnits.length} (kokku seotud ${units.length})` },
                  { label: "Näidis seerianumber", value: activeUnits[0]?.serialNumber ?? units[0]?.serialNumber ?? null },
                ]}
              />
              {units.length > 0 && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-primary">Seadmed ({units.length})</summary>
                  <ul className="mt-2 divide-y divide-border">
                    {units.map((u) => (
                      <li key={u.id} className="py-1.5">
                        <span className="font-mono">{u.serialNumber ?? "—"}</span> <span className="text-xs text-muted">Tech ID {u.externalUnitId}</span>{" "}
                        {u.available ? <span className="text-xs text-success">müügis</span> : <span className="text-xs text-warning">{u.excludedReason ?? u.status}</span>}
                        {u.sourceSheet && <span className="block text-xs text-muted">{u.sourceSheet.trim()} rida {u.sourceRow}</span>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </Card>
          )}
          <Card title="Tarnija">
            <DefinitionList
              items={[
                { label: "Tarnija", value: supplierLabel(listing.supplier) },
                { label: "Tarnija SKU", value: listing.supplierSku },
                { label: "Seisukord (tarnija algne)", value: listing.details?.sourceGrade ?? null },
                { label: "Saadavus", value: listing.available === null ? null : listing.available ? (listing.stock === null ? (poes.deliveryLabel === "Poes kohapeal" ? "Poes kohapeal — täpne kogus teadmata" : "Saadaval (kogus teadmata)") : "Saadaval") : "Ei ole saadaval (puudus tarnija nimekirjast)" },
                { label: "Hinna allikas", value: listing.priceSource === "SUPPLIER" ? "Tarnija müügihind" : "Hinnastamine (ostuhinnast)" },
                { label: "Viimati tarnija nimekirjas", value: fmtDateTime(listing.lastSeenAt) },
                { label: "Käibemaksu režiim", value: listing.vatScheme },
                { label: "Tarneaeg", value: listing.deliveryMinDays !== null ? `${listing.deliveryMinDays}–${listing.deliveryMaxDays} päeva` : null },
                { label: "Brutovahe (müük − ost)", value: margin === null ? null : <span>{fmtCents(margin)} <span className="block text-xs text-muted">Ei ole netomarginaal: käibemaks ja kulud on arvestamata.</span></span> },
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
