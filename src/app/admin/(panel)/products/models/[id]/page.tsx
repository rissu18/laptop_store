import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DataTable } from "@/components/admin/data-table";
import { EntityEditForm, type FormSection } from "@/components/admin/entity-form";
import { fmtCents, fmtDateTime, fmtGb, toDisplay, toInput } from "@/components/admin/format";
import { IcecatPanel } from "@/components/admin/icecat-panel";
import { Badge, Card, DefinitionList, Missing, PageHeader, StatusBadge } from "@/components/admin/ui";
import { LISTING_ISSUES, listingIssuesOf } from "@/domain/admin/data-quality-rules";
import { CATALOG_STATUS_VALUES, STATUS_LABELS } from "@/domain/admin/product-edit";
import { BRAND_CODES, BRAND_NAMES } from "@/domain/catalog/types";
import { updateModelAction } from "@/server/admin/products/actions";
import { getModelDetail } from "@/server/admin/products/queries";
import { uuidParam } from "@/server/admin/search-params";

/** Admin on alati päringupõhine (sessioon, värsked andmed) — eelrenderdust ega "instant" navigeerimist ei kasutata. */
export const instant = false;

export const metadata: Metadata = { title: "Mudel" };

const SECTIONS: FormSection[] = [
  {
    title: "Mudeli andmed",
    description: "Tarnija/normaliseerimise väljad — sinu muudatus salvestub parandusena ja tarnija sync seda üle ei kirjuta.",
    fields: [
      { name: "manufacturer", label: "Tootja", type: "select", required: true, overridable: true, options: BRAND_CODES.map((b) => ({ value: b, label: BRAND_NAMES[b] })) },
      { name: "family", label: "Seeria", type: "text", required: true, overridable: true },
      { name: "model", label: "Mudel", type: "text", required: true, overridable: true },
      { name: "generation", label: "Põlvkond", type: "text", overridable: true },
      { name: "screenSizeIn", label: "Ekraan (tolli)", type: "number", overridable: true },
      { name: "weightKg", label: "Kaal (kg)", type: "number", overridable: true },
    ],
  },
  {
    title: "Poes kuvamine",
    description: "Admini väljad — tarnija neid ei muuda.",
    fields: [
      { name: "status", label: "Staatus", type: "select", required: true, options: CATALOG_STATUS_VALUES.map((s) => ({ value: s, label: STATUS_LABELS[s] })) },
      { name: "featured", label: "Esiletõstetud", type: "checkbox", hint: "Näita avalehel ja parimate pakkumiste all" },
      { name: "description", label: "Kirjeldus", type: "textarea", wide: true, hint: "Valikuline. Ära kirjuta väiteid, mida tarnija andmed ei kinnita." },
    ],
  },
];

export default async function ModelDetailPage({ params }: PageProps<"/admin/products/models/[id]">) {
  const id = uuidParam((await params).id);
  if (!id) notFound();
  const data = await getModelDetail(id);
  if (!data) notFound();
  const { effective: model, supplier, overrides, identifiers, icecat, listings, images } = data;
  const title = `${model.family} ${model.model}`;
  const visibleImages = images.filter((image) => !image.isHidden);

  const defaults = Object.fromEntries(SECTIONS.flatMap((s) => s.fields).map((f) => [f.name, toInput((model as Record<string, unknown>)[f.name])]));
  const supplierDisplay = Object.fromEntries(SECTIONS[0].fields.map((f) => [f.name, toDisplay((supplier as Record<string, unknown>)[f.name])]));
  const issues = [
    ...(visibleImages.length === 0 ? ["Mudelil pole ühtegi nähtavat pilti"] : []),
    ...(icecat?.status === "NOT_FOUND" ? ["Icecatist ei leitud vastet"] : []),
    ...(icecat?.status === "NEEDS_REVIEW" ? ["Icecati vaste vajab ülevaatust"] : []),
    ...listings.flatMap(({ effective }) => listingIssuesOf(effective).map((issue) => `${effective.sku}: ${LISTING_ISSUES[issue].label.toLowerCase()}`)),
  ];

  return (
    <>
      <PageHeader
        title={title}
        breadcrumbs={[{ label: "Mudelid", href: "/admin/products/models" }, { label: title }]}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={model.status} />
            {model.featured && <Badge tone="primary">Esiletõstetud</Badge>}
            <span>Slug: {model.slug}</span>
            {model.status === "ACTIVE" && (
              <Link href={`/toode/${model.slug}`} target="_blank" rel="noopener" className="text-primary hover:underline">
                Vaata poes ↗
              </Link>
            )}
          </span>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <EntityEditForm
            key={model.updatedAt.toISOString()}
            entity="model"
            id={model.id}
            sections={SECTIONS}
            defaults={defaults}
            supplier={supplierDisplay}
            overridden={Object.keys(overrides)}
            action={updateModelAction.bind(null, model.id)}
          />

          <Card
            title={`Konfiguratsioonid (${listings.length})`}
            actions={
              <Link href={`/admin/products/listings?model=${model.id}`} className="text-sm text-primary hover:underline">
                Ava nimekirjas
              </Link>
            }
          >
            <DataTable
              rows={listings}
              rowKey={(row) => row.raw.id}
              caption="Mudeli konfiguratsioonid"
              empty={{ title: "Konfiguratsioone pole" }}
              columns={[
                {
                  key: "sku",
                  header: "SKU",
                  mobile: "title",
                  cell: ({ effective }) => (
                    <Link href={`/admin/products/listings/${effective.id}`} className="font-medium text-primary hover:underline">
                      {effective.sku}
                    </Link>
                  ),
                },
                { key: "cpu", header: "CPU", cell: ({ effective }) => effective.cpu ?? <Missing /> },
                { key: "ram", header: "RAM / SSD", cell: ({ effective }) => `${fmtGb(effective.ramGb) ?? "?"} / ${fmtGb(effective.storageGb) ?? "?"}` },
                { key: "grade", header: "Seisukord", cell: ({ effective }) => effective.grade ?? <Missing /> },
                { key: "stock", header: "Laos", align: "right", cell: ({ effective }) => effective.stock ?? (effective.available === true ? "saadaval" : effective.available === false ? "ei" : <Missing />) },
                { key: "price", header: "Hind", align: "right", cell: ({ effective }) => fmtCents(effective.salePriceCents) ?? <Missing /> },
                { key: "status", header: "Staatus", cell: ({ effective }) => <StatusBadge status={effective.status} /> },
              ]}
            />
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Card title="Andmekvaliteet">
            {issues.length === 0 ? (
              <p className="text-sm text-success">Probleeme ei leitud.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title={`Pildid (${visibleImages.length}/${images.length})`}
            actions={
              <Link href={`/admin/images/${model.id}`} className="text-sm text-primary hover:underline">
                Halda pilte
              </Link>
            }
          >
            {images.length === 0 ? (
              <Missing label="Pilte pole — poes kuvatakse placeholder" />
            ) : (
              <ul className="grid grid-cols-4 gap-2">
                {images.slice(0, 8).map((image) => (
                  <li key={image.id} className="relative aspect-square overflow-hidden rounded border border-border bg-white">
                    <Image src={image.thumbnailPath} alt={image.alt} fill sizes="80px" className={image.isHidden ? "object-contain opacity-30" : "object-contain"} />
                    {image.isMain && <span className="absolute top-0.5 left-0.5 rounded bg-primary px-1 text-[10px] font-semibold text-on-primary">Põhi</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Piltide päritolu" description="Rikastus: meie andmed → Laptopid.ee → Icecat">
            <DefinitionList
              items={[
                { label: "Mudelipildid", value: Object.entries(visibleImages.reduce<Record<string, number>>((acc, image) => ({ ...acc, [image.source]: (acc[image.source] ?? 0) + 1 }), {})).map(([source, n]) => `${source} ${n}`).join(", ") || "puuduvad" },
                ...(supplier.enrichment?.images
                  ? [
                      { label: "Rikastuse otsus", value: supplier.enrichment.images.status },
                      ...(supplier.enrichment.images.matchedModelSlug ? [{ label: "Laptopid.ee vaste", value: supplier.enrichment.images.matchedModelSlug }] : []),
                      ...(supplier.enrichment.images.matchedBy ? [{ label: "Vaste alus", value: supplier.enrichment.images.matchedBy }] : []),
                      ...(supplier.enrichment.images.candidates?.length ? [{ label: "Kandidaadid (ülevaatus)", value: supplier.enrichment.images.candidates.join(", ") }] : []),
                      ...(supplier.enrichment.images.icecat ? [{ label: "Icecat", value: supplier.enrichment.images.icecat }] : []),
                    ]
                  : []),
              ]}
            />
          </Card>

          <IcecatPanel modelId={model.id} icecat={icecat} downloadEnabled={!process.env.VERCEL} />

          <Card title="Identifikaatorid">
            {identifiers.length === 0 ? (
              <Missing />
            ) : (
              <ul className="space-y-1.5 text-sm">
                {identifiers.map((identifier) => (
                  <li key={identifier.id} className="flex flex-wrap items-center gap-2">
                    <Badge>{identifier.kind}</Badge>
                    <code className="break-all">{identifier.value}</code>
                    <span className="text-xs text-muted">{identifier.source}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Ajalugu">
            <DefinitionList
              items={[
                { label: "Loodud", value: fmtDateTime(model.createdAt) },
                { label: "Muudetud", value: fmtDateTime(model.updatedAt) },
              ]}
            />
            <Link href={`/admin/system/activity?entity=${model.id}`} className="mt-3 inline-block text-sm text-primary hover:underline">
              Muudatuste ajalugu →
            </Link>
          </Card>
        </aside>
      </div>
    </>
  );
}
