import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/admin/ui";
import { EnrichCatalogButton } from "@/components/admin/enrich-catalog-button";
import { cx } from "@/components/ui/class-names";
import { getDataQualityCounts, getPerformanceCoverage, type IssueCount } from "@/server/admin/data-quality/queries";

/** Admin on alati päringupõhine (sessioon, värsked andmed) — eelrenderdust ega "instant" navigeerimist ei kasutata. */
export const instant = false;

export const metadata: Metadata = { title: "Andmekvaliteet" };

function IssueList<K extends string>({ items, total, basePath, unit }: { items: IssueCount<K>[]; total: number; basePath: string; unit: string }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <li key={item.key}>
          <Link href={`${basePath}?issue=${item.key}`} className="flex items-center gap-4 py-3 hover:bg-surface-alt sm:px-2">
            <span className={cx("w-12 shrink-0 text-right text-xl font-semibold tabular-nums", item.count > 0 ? "text-warning" : "text-success")}>{item.count}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{item.label}</span>
              <span className="block text-sm text-muted">
                {item.description} {total > 0 && `(${Math.round((item.count / total) * 100)}% ${unit})`}
              </span>
            </span>
            <span className="shrink-0 text-sm font-medium text-primary">{item.count > 0 ? "Paranda →" : "Vaata"}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function DataQualityPage() {
  const [data, performance] = await Promise.all([getDataQualityCounts(), getPerformanceCoverage()]);
  const totalIssues = [...data.models, ...data.listings].reduce((sum, item) => sum + item.count, 0);

  return (
    <>
      <PageHeader
        title="Andmekvaliteet"
        breadcrumbs={[{ label: "Kataloog" }, { label: "Andmekvaliteet" }]}
        description={`Kontrollid arvestavad parandatud (efektiivseid) väärtusi. Kokku ${totalIssues} probleemi. Klõpsa kategoorial, et näha kirjeid; "Paranda" avab detailvaate.`}
      />
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Pildiallikad" description="Mudelid poes kuvatava pildi päritolu järgi (rikastuse prioriteet: meie andmed → Laptopid.ee → Icecat)">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 font-normal">Allikas</th>
                <th className="py-1 text-right font-normal">Mudeleid</th>
                <th className="py-1 text-right font-normal">neist müügis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.imageSources.map((row) => (
                <tr key={row.key}>
                  <td className="py-1.5">{row.label}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.all}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.onSale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Kiirusindeks ja maks. sagedus" description={`Müügis konfiguratsioonid (${performance.total}). Allikas: tarnija ise (Laptopid.ee API) või täpselt sama CPU/GPU Laptopid.ee väärtus (rikastus). Üldnimi ("Integrated") ei sobi.`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 font-normal">Väärtus</th>
                <th className="py-1 text-right font-normal">Tarnijalt</th>
                <th className="py-1 text-right font-normal">LAPTOPID vaste</th>
                <th className="py-1 text-right font-normal">Puudub</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {performance.rows.map((row) => (
                <tr key={row.key}>
                  <td className="py-1.5">{row.label}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.direct}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.matched}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.missing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Rikastus" description="Laptopid.ee pildid mudelitele (kindla vastega) ning integreeritud GPU / resolutsioon meie andmetest. Admini parandusi ega peidetud pilte ei puudutata; ebakindel vaste läheb ülevaatusele. Icecat: lokaalselt `npm run enrich:catalog -- --images --icecat`.">
          <EnrichCatalogButton />
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Mudelid (${data.modelTotal})`} description="Pildid ja Icecati vasted">
          <IssueList items={data.models} total={data.modelTotal} basePath="/admin/products/models" unit="mudelitest" />
        </Card>
        <Card title={`Konfiguratsioonid (${data.listingTotal})`} description="Tarnija andmete täielikkus">
          <IssueList items={data.listings} total={data.listingTotal} basePath="/admin/products/listings" unit="konfiguratsioonidest" />
        </Card>
      </div>
    </>
  );
}
