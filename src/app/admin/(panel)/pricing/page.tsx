import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/admin/data-table";
import { fmtCents, toInput } from "@/components/admin/format";
import { ApplyPricingButton, PricingRulesForm } from "@/components/admin/pricing-forms";
import { Card, Missing, PageHeader } from "@/components/admin/ui";
import { cx } from "@/components/ui/class-names";
import { changedRows } from "@/domain/admin/pricing-admin";
import { getPricingOverview } from "@/server/admin/pricing/service";
import { oneOf } from "@/server/admin/search-params";

/** Admin on alati päringupõhine (sessioon, värsked andmed) — eelrenderdust ega "instant" navigeerimist ei kasutata. */
export const instant = false;

export const metadata: Metadata = { title: "Hinnastamine" };

const pct = (bps: number) => String(bps / 100).replace(".", ",");

export default async function PricingPage({ searchParams }: PageProps<"/admin/pricing">) {
  const show = oneOf((await searchParams).show, ["changed", "all"] as const) ?? "changed";
  const { settings, bands, preview } = await getPricingOverview();
  const changed = changedRows(preview);
  const skipped = preview.filter((row) => row.error).length;
  const rows = show === "changed" ? [...changed, ...preview.filter((row) => row.error)] : preview;

  return (
    <>
      <PageHeader
        title="Hinnastamine"
        breadcrumbs={[{ label: "Pood" }, { label: "Hinnastamine" }]}
        description="Müügihind = ostuhind + transport + garantiireserv + juurdehindlus + käibemaks + makseteenuse tasu, ümardatuna. Kui kasum jääb alla miinimumi, tõstetakse hinda."
      />
      <div className="flex flex-col gap-6">
        <PricingRulesForm
          settings={{
            vatRateBps: pct(settings.vatRateBps),
            supplierShippingCents: toInput(settings.supplierShippingCents, "euro"),
            warrantyReserveBps: pct(settings.warrantyReserveBps),
            paymentFeeBps: pct(settings.paymentFeeBps),
            paymentFeeFixedCents: toInput(settings.paymentFeeFixedCents, "euro"),
            minProfitCents: toInput(settings.minProfitCents, "euro"),
            minProfitBps: pct(settings.minProfitBps),
            minSalePriceCents: toInput(settings.minSalePriceCents, "euro"),
            rounding: settings.rounding,
          }}
          bands={bands.map((band) => ({
            from: toInput(band.fromCostCents, "euro"),
            to: toInput(band.toCostCents, "euro"),
            fixed: toInput(band.markupFixedCents, "euro"),
            pct: pct(band.markupPercentBps),
          }))}
        />

        <Card
          title="Eelvaade"
          description={`Salvestatud reeglite järgi: ${changed.length} hinda muutuks, ${skipped} pakkumist ei saa hinnastada. Eelvaade ei muuda midagi.`}
          actions={<ApplyPricingButton changedCount={changed.length} skippedCount={skipped} />}
        >
          <div className="mb-3 flex gap-3 text-sm">
            <Link href="/admin/pricing?show=changed" className={cx(show === "changed" ? "font-semibold text-text" : "text-primary hover:underline")}>
              Ainult muutuvad ({changed.length + skipped})
            </Link>
            <Link href="/admin/pricing?show=all" className={cx(show === "all" ? "font-semibold text-text" : "text-primary hover:underline")}>
              Kõik ({preview.length})
            </Link>
          </div>
          <DataTable
            rows={rows}
            rowKey={(row) => row.id}
            caption="Hindade eelvaade"
            empty={{ title: "Kõik hinnad vastavad reeglitele", description: "Rakendamisel midagi ei muutuks." }}
            columns={[
              {
                key: "sku",
                header: "SKU",
                mobile: "title",
                cell: (row) => (
                  <Link href={`/admin/products/listings/${row.id}`} className="font-medium text-primary hover:underline">
                    {row.sku}
                  </Link>
                ),
              },
              { key: "cost", header: "Ostuhind", align: "right", cell: (row) => fmtCents(row.costCents) ?? <Missing /> },
              { key: "current", header: "Praegu", align: "right", cell: (row) => fmtCents(row.currentCents) ?? <Missing /> },
              { key: "calc", header: "Arvutatud", align: "right", cell: (row) => (row.error ? <span className="text-xs text-danger">{row.error}</span> : fmtCents(row.calculatedCents)) },
              {
                key: "diff",
                header: "Erinevus",
                align: "right",
                cell: (row) =>
                  row.differenceCents === null ? (
                    <Missing label="—" />
                  ) : (
                    <span className={cx(row.differenceCents > 0 && "text-danger", row.differenceCents < 0 && "text-success")}>
                      {row.differenceCents > 0 ? "+" : ""}
                      {fmtCents(row.differenceCents)}
                    </span>
                  ),
              },
              { key: "margin", header: "Kasum (marginaal)", align: "right", cell: (row) => (row.profitCents === null ? <Missing label="—" /> : `${fmtCents(row.profitCents)} (${String(row.marginPct).replace(".", ",")}%)`) },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
