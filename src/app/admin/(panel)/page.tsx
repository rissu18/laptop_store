import type { Metadata } from "next";
import Link from "next/link";
import { fmtCents, fmtDateTime } from "@/components/admin/format";
import { Card, MetricCard, Missing, PageHeader } from "@/components/admin/ui";
import { supplierLabel } from "@/domain/admin/display";
import { issueHref } from "@/domain/admin/scope";
import { getDashboard } from "@/server/admin/dashboard/queries";
import { getDiscountStatusCounts } from "@/server/admin/discounts/queries";
import { getOrderCounts } from "@/server/admin/orders/queries";
import { requireAdmin } from "@/server/auth/auth";

/** Admin on alati päringupõhine (sessioon, värsked andmed) — eelrenderdust ega "instant" navigeerimist ei kasutata. */
export const instant = false;

export const metadata: Metadata = { title: "Töölaud" };

const SUPPLIER_ORDER = ["laptopid", "tech", "foxway"];

function SectionTitle({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">
      {children}
    </h2>
  );
}

export default async function AdminDashboardPage() {
  const [admin, d, discounts, orderCounts] = await Promise.all([requireAdmin(), getDashboard(), getDiscountStatusCounts(), getOrderCounts()]);
  const s = d.sellable;
  const supplierHint = SUPPLIER_ORDER.map((code) => `${supplierLabel(code)} ${s.bySupplier[code] ?? 0}`).join(" · ");

  return (
    <>
      <PageHeader
        title="Töölaud"
        description={`Tere, ${admin.name}! „Müügis“ = mida pood päriselt näitab (sama reegel mis pood). Andmebaasis kokku ${d.database.models} mudelit ja ${d.database.listings} konfiguratsiooni. Käivet ei näidata enne päris makseid — praegused tellimused on testtellimused.`}
      />

      <section aria-labelledby="muugis" className="mb-8">
        <SectionTitle id="muugis">Müügis</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <MetricCard label="Konfiguratsioone müügis" value={s.listings} hint={supplierHint} href="/admin/products/listings?scope=sellable" />
          <MetricCard label="Mudeleid müügis" value={s.models} hint={`${d.database.featured} esiletõstetud`} href="/admin/products/models?scope=sellable" />
          <MetricCard
            label="Kliendihind"
            value={d.prices.avg !== null ? `${fmtCents(d.prices.avg)} kesk.` : "—"}
            hint={d.prices.min !== null ? `${fmtCents(d.prices.min)} – ${fmtCents(d.prices.max)} (täiseurod, nagu poes)` : undefined}
          />
        </div>
      </section>

      <section aria-labelledby="kvaliteet" className="mb-8">
        <SectionTitle id="kvaliteet">Andmekvaliteet (müügis)</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="Pildita mudeleid" value={s.noImages} hint={`${s.fewImages} mudelil 1–4 pilti`} href={issueHref("no-images", "sellable")} tone={s.noImages ? "warning" : undefined} />
          <MetricCard label="Tundmatu klaviatuur" value={s.unknownKeyboard} hint="konfiguratsiooni" href={issueHref("unknown-keyboard", "sellable")} tone={s.unknownKeyboard ? "warning" : undefined} />
          <MetricCard label="Kiirusindeks puudu" value={`CPU ${s.missingCpuBenchmark}`} hint={`GPU ${s.missingGpuBenchmark} konfiguratsioonil`} href={issueHref("missing-cpu-benchmark", "sellable")} />
          <MetricCard
            label="Icecat"
            value={`${d.icecat.NEEDS_REVIEW ?? 0} ülevaatusel`}
            hint={`${d.icecat.MATCHED ?? 0} leitud · ${d.icecat.NOT_FOUND ?? 0} ei leitud (kõik mudelid)`}
            href="/admin/images?icecat=NEEDS_REVIEW"
            tone={d.icecat.NEEDS_REVIEW ? "warning" : undefined}
          />
        </div>
      </section>

      <section aria-labelledby="tellimused" className="mb-8">
        <SectionTitle id="tellimused">Tellimused ja sooduskoodid</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="Testtellimusi täna" value={orderCounts.testToday} href="/admin/orders?kind=test" hint={`${orderCounts.testTotal} kokku — TEST, ei ole müük`} />
          <MetricCard label="Päris tellimusi" value={orderCounts.realTotal} href="/admin/orders?kind=real" hint="Avaneb koos makseteenusega" />
          <MetricCard label="Aktiivsed sooduskoodid" value={discounts.ACTIVE} href="/admin/discounts?status=ACTIVE" hint={`${discounts.SCHEDULED} ajastatud · ${discounts.EXPIRED} aegunud`} />
          <MetricCard label="Vead (24 h)" value={d.system.errors24h} href="/admin/system/logs?level=ERROR&range=24h" tone={d.system.errors24h ? "danger" : undefined} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Suurimad andmeprobleemid (müügis)" actions={<Link href="/admin/data-quality" className="text-sm text-primary hover:underline">Kõik</Link>}>
          {d.quality.top.length === 0 ? (
            <p className="text-sm text-success">Probleeme ei leitud.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {d.quality.top.map((issue) => (
                <li key={issue.key}>
                  <Link href={issueHref(issue.key, "sellable")} className="flex items-center justify-between gap-3 py-2 hover:text-primary">
                    <span>{issue.label}</span>
                    <span className="font-semibold tabular-nums text-warning">{issue.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Viimased muudatused" description="Sisselogimised on tegevuslogis." actions={<Link href="/admin/system/activity" className="text-sm text-primary hover:underline">Kõik</Link>}>
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
