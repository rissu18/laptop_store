import type { Metadata } from "next";
import Link from "next/link";
import { fmtCents, fmtDateTime } from "@/components/admin/format";
import { Card, MetricCard, Missing, PageHeader } from "@/components/admin/ui";
import { getDashboard } from "@/server/admin/dashboard/queries";
import { getDiscountStatusCounts } from "@/server/admin/discounts/queries";
import { getOrderCounts } from "@/server/admin/orders/queries";
import { requireAdmin } from "@/server/auth/auth";

/** Admin on alati päringupõhine (sessioon, värsked andmed) — eelrenderdust ega "instant" navigeerimist ei kasutata. */
export const instant = false;

export const metadata: Metadata = { title: "Töölaud" };

export default async function AdminDashboardPage() {
  const [admin, d, discounts, orderCounts] = await Promise.all([requireAdmin(), getDashboard(), getDiscountStatusCounts(), getOrderCounts()]);
  const issueHref = (key: string) => (["no-images", "images-review", "icecat-not-found", "icecat-needs-review"].includes(key) ? `/admin/products/models?issue=${key}` : `/admin/products/listings?issue=${key}`);

  return (
    <>
      <PageHeader title="Töölaud" description={`Tere, ${admin.name}! Kõik numbrid on arvutatud andmebaasist. Käivet ja müügistatistikat ei näidata enne päris makseid — praegused tellimused on testtellimused.`} />

      <section aria-labelledby="kataloog" className="mb-8">
        <h2 id="kataloog" className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Kataloog
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="Mudeleid" value={d.catalog.modelTotal} hint={`${d.catalog.modelsActive} aktiivset · ${d.catalog.modelsHidden} peidetud`} href="/admin/products/models" />
          <MetricCard label="Konfiguratsioone" value={d.catalog.listingTotal} hint={`${d.catalog.listingsActive} aktiivset · ${d.catalog.listingsHidden} peidetud`} href="/admin/products/listings" />
          <MetricCard label="Laos (aktiivsed)" value={d.catalog.inStock} hint="Laoseis > 0" href="/admin/products/listings?status=ACTIVE&sort=stock" />
          <MetricCard label="Esiletõstetud mudeleid" value={d.catalog.featured} href="/admin/products/models?featured=yes" />
        </div>
      </section>

      <section aria-labelledby="pildid" className="mb-8">
        <h2 id="pildid" className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Pildid ja andmekvaliteet
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="Pildikate" value={`${d.images.coveragePct}%`} hint={`${d.images.modelsWithImages}/${d.catalog.modelTotal} mudelil on pilt`} href="/admin/images" tone={d.images.coveragePct < 90 ? "warning" : undefined} />
          <MetricCard label="Pilte kokku" value={d.images.total} hint={`${d.images.hidden} peidetud`} href="/admin/images" />
          <MetricCard
            label="Icecat"
            value={`${d.images.icecat.MATCHED ?? 0} leitud`}
            hint={`${d.images.icecat.NEEDS_REVIEW ?? 0} vajab ülevaatust · ${d.images.icecat.NOT_FOUND ?? 0} ei leitud`}
            href="/admin/images?icecat=NEEDS_REVIEW"
          />
          <MetricCard label="Andmekvaliteedi probleeme" value={d.quality.totalIssues} href="/admin/data-quality" tone={d.quality.totalIssues ? "warning" : undefined} />
        </div>
      </section>

      <section aria-labelledby="hinnad" className="mb-8">
        <h2 id="hinnad" className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Hinnad (aktiivsed pakkumised)
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <MetricCard label="Min" value={fmtCents(d.prices.min) ?? "—"} />
          <MetricCard label="Keskmine" value={fmtCents(d.prices.avg) ?? "—"} />
          <MetricCard label="Max" value={fmtCents(d.prices.max) ?? "—"} />
        </div>
      </section>

      <section aria-labelledby="tellimused" className="mb-8">
        <h2 id="tellimused" className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Tellimused
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <MetricCard label="Testtellimusi täna" value={orderCounts.testToday} href="/admin/orders?kind=test" hint="TEST — ei ole müük" />
          <MetricCard label="Testtellimusi kokku" value={orderCounts.testTotal} href="/admin/orders?kind=test" hint="TEST — ei ole müük" />
          <MetricCard label="Päris tellimusi" value={orderCounts.realTotal} href="/admin/orders?kind=real" hint="Avaneb koos makseteenusega" />
        </div>
      </section>

      <section aria-labelledby="sooduskoodid" className="mb-8">
        <h2 id="sooduskoodid" className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Sooduskoodid
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <MetricCard label="Aktiivsed" value={discounts.ACTIVE} href="/admin/discounts?status=ACTIVE" />
          <MetricCard label="Ajastatud" value={discounts.SCHEDULED} href="/admin/discounts?status=SCHEDULED" />
          <MetricCard label="Aegunud" value={discounts.EXPIRED} href="/admin/discounts?status=EXPIRED" />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Suurimad andmeprobleemid" actions={<Link href="/admin/data-quality" className="text-sm text-primary hover:underline">Kõik</Link>}>
          {d.quality.top.length === 0 ? (
            <p className="text-sm text-success">Probleeme ei leitud.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {d.quality.top.map((issue) => (
                <li key={issue.key}>
                  <Link href={issueHref(issue.key)} className="flex items-center justify-between gap-3 py-2 hover:text-primary">
                    <span>{issue.label}</span>
                    <span className="font-semibold tabular-nums text-warning">{issue.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card
          title="Viimased tegevused"
          description={d.system.errors24h ? `${d.system.errors24h} viga viimase 24 h jooksul` : "Vigu viimase 24 h jooksul pole"}
          actions={<Link href="/admin/system/activity" className="text-sm text-primary hover:underline">Kõik</Link>}
        >
          {d.recent.length === 0 ? (
            <Missing label="Tegevusi pole" />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {d.recent.map((entry) => (
                <li key={entry.id} className="flex flex-wrap justify-between gap-x-3 py-2">
                  <span>
                    <code className="text-xs">{entry.action}</code> {entry.entityLabel}
                  </span>
                  <span className="text-xs text-muted">
                    {entry.adminEmail ?? "CLI"} · {fmtDateTime(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
