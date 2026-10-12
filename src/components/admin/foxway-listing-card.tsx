import { fmtCents, fmtDateTime } from "@/components/admin/format";
import { Badge, Card, DefinitionList } from "@/components/admin/ui";
import { FAULT_SEVERITY_LABELS, type FaultSeverity } from "@/integrations/foxway/foxway-faults";
import { foxwayMetaOf } from "@/integrations/foxway/foxway-meta";

/**
 * Admin → konfiguratsioon → Foxway andmed: tarnija toorväärtused (Appearance, Functionality, rikked, Boxed, aku …),
 * hinnaarvutus, laadija lisatasu põhjus ja avaldamise otsus. Ainult adminile.
 */
export function FoxwayListingCard({
  rawData,
  qualityHold,
  qualityHoldReason,
  effectiveHold,
  supplierVatMargin,
  stock,
  lastSyncedAt,
}: {
  rawData: unknown;
  qualityHold: string | null;
  qualityHoldReason: string | null;
  effectiveHold: string | null;
  supplierVatMargin: boolean | null;
  stock: number | null;
  lastSyncedAt: Date | null;
}) {
  const meta = foxwayMetaOf(rawData);
  if (!meta) return null;
  const p = meta.pricing;
  const severity = meta.faultSeverity as FaultSeverity | null | undefined;
  const decision =
    effectiveHold === null
      ? qualityHold
        ? <Badge tone="warning">Avaldatud admini otsusega (tarnija: {qualityHold})</Badge>
        : <Badge tone="success">Avaldatud</Badge>
      : effectiveHold === "BLOCKED"
        ? <Badge tone="danger">Blokeeritud — ei müüda</Badge>
        : <Badge tone="warning">Ülevaatus — poes ei kuvata</Badge>;

  return (
    <Card title="Foxway" description="Tarnija andmed (ainult admin). Storefront ei loe toorandmeid — kliendile kuvatakse normaliseeritud väärtused.">
      <DefinitionList
        items={[
          { label: "Avaldamine", value: decision },
          ...(qualityHoldReason ? [{ label: "Põhjus", value: qualityHoldReason }] : []),
          { label: "Foxway SKU", value: <span className="font-mono">{meta.sku}</span> },
          { label: "ItemVariantId", value: meta.itemVariantId ? <span className="font-mono">{meta.itemVariantId}</span> : null },
          { label: "ProductName (algne)", value: meta.productName },
          { label: "Kataloog(id)", value: meta.catalogs?.length ? `${meta.catalogs.join(" + ")}${meta.catalogs.length > 1 ? ` (kogus: ${meta.canonicalCatalog})` : ""}` : null },
          { label: "Quantity (täpne)", value: stock === null ? null : `${stock} tk` },
          { label: "Foxway hind (neto)", value: meta.sourcePriceCents != null ? `${fmtCents(meta.sourcePriceCents)} ${meta.currency && meta.currency !== "EUR" ? meta.currency : ""}` : null },
          {
            label: "Müügihinna arvutus",
            value: p ? `${fmtCents(p.supplierPriceCents)} + KM ${p.vatRateBps / 100}% ${fmtCents(p.vatCents)} + ${fmtCents(p.markupCents)} + laadija ${fmtCents(p.chargerCents)} = ${fmtCents(p.salePriceCents)}` : "Puudub (mitte-EUR — vajab äriotsust)",
          },
          { label: "IsVatMargin", value: supplierVatMargin === null ? null : supplierVatMargin ? "Jah (marginaalskeem)" : "Ei" },
          { label: "Appearance", value: meta.appearance },
          { label: "Functionality", value: meta.functionality },
          { label: "Rike (primaarne)", value: meta.faultPrimary },
          { label: "Rike (lisa)", value: meta.faultAdditional },
          { label: "Rikke klass", value: severity ? FAULT_SEVERITY_LABELS[severity] : "Rikkeid pole" },
          ...(meta.faults?.some((f) => !f.known) ? [{ label: "Tundmatu rike", value: <Badge tone="warning">{meta.faults.filter((f) => !f.known).map((f) => f.raw).join(", ")}</Badge> }] : []),
          { label: "Boxed", value: meta.boxed },
          { label: "Laadija lisatasu", value: meta.charger ? `${fmtCents(meta.charger.surchargeCents)} (${meta.charger.profile}) — ${meta.charger.reason}` : null },
          { label: "Keyboard (algne)", value: meta.keyboard },
          { label: "Battery status (tarnija)", value: meta.batteryStatus ? `${meta.batteryStatus} — kliendile ei kuvata (aku tööaeg mudeli järgi, aku garantii 6 kuud)` : null },
          { label: "LCD", value: meta.lcd },
          { label: "GPU", value: meta.gpu },
          { label: "Drive", value: meta.drive },
          { label: "COA", value: meta.coa },
          { label: "Värv", value: meta.color },
          { label: "MPN", value: meta.mpn },
          { label: "Viimane sync", value: fmtDateTime(lastSyncedAt) },
        ]}
      />
    </Card>
  );
}
