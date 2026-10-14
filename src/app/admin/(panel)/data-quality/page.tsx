import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/admin/ui";
import { EnrichCatalogButton } from "@/components/admin/enrich-catalog-button";
import { cx } from "@/components/ui/class-names";
import { PERFORMANCE_ISSUES } from "@/domain/admin/data-quality-rules";
import { issueHref, parseDataQualityScope, type DataQualityScope } from "@/domain/admin/scope";
import { getDataQualityCounts, type IssueCount } from "@/server/admin/data-quality/queries";

/** Admin on alati päringupõhine (sessioon, värsked andmed) — eelrenderdust ega "instant" navigeerimist ei kasutata. */
export const instant = false;
/** "Rikasta kataloogi" server action jookseb selle lehe funktsioonis (sama piir mis Tarnijad lehel) */
export const maxDuration = 300;

export const metadata: Metadata = { title: "Andmekvaliteet" };

function IssueList<K extends string>({ items, total, scope, unit }: { items: IssueCount<K>[]; total: number; scope: DataQualityScope; unit: string }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <li key={item.key}>
          <Link href={issueHref(item.key, scope)} className="flex items-center gap-4 py-3 hover:bg-surface-alt sm:px-2">
            <span className={cx("w-12 shrink-0 text-right text-xl font-semibold tabular-nums", item.count > 0 ? "text-warning" : "text-success")}>{item.count}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{item.label}</span>
              <span className="block text-sm text-muted">
                {item.description} {total > 0 && `(${Math.round((item.count / total) * 100)}% ${unit})`}
              </span>
            </span>
            <span className="shrink-0 text-sm font-medium text-primary">{item.count > 0 ? "Vaata kirjeid →" : "Vaata"}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ScopeSwitch({ scope }: { scope: DataQualityScope }) {
  const option = (value: DataQualityScope, label: string, href: string) => (
    <Link
      href={href}
      aria-current={scope === value ? "page" : undefined}
      className={cx("rounded-md px-3 py-1.5 text-sm font-medium", scope === value ? "bg-primary text-on-primary" : "text-muted hover:text-text")}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Skoop" className="inline-flex gap-1 rounded-lg border border-border bg-surface p-1">
      {option("sellable", "Müügis", "/admin/data-quality")}
      {option("all", "Kõik", "/admin/data-quality?scope=all")}
    </nav>
  );
}

export default async function DataQualityPage({ searchParams }: PageProps<"/admin/data-quality">) {
  const scope = parseDataQualityScope((await searchParams).scope);
  const data = await getDataQualityCounts(scope);
  // Kiirusindeksi lüngad ei takista müüki — loetakse eraldi, et andmevigade arv jääks loetavaks
  const isPerformance = (key: string) => (PERFORMANCE_ISSUES as readonly string[]).includes(key);
  const totalIssues = [...data.models, ...data.listings].filter((item) => !isPerformance(item.key)).reduce((sum, item) => sum + item.count, 0);
  const sellable = scope === "sellable";

  return (
    <>
      <PageHeader
        title="Andmekvaliteet"
        breadcrumbs={[{ label: "Kataloog" }, { label: "Andmekvaliteet" }]}
        description={
          sellable
            ? `Müügis = poes nähtavad pakkumised ja nende mudelid (sama reegel mis pood: aktiivne mudel ja pakkumine, saadaval, kvaliteedi kinnipidamiseta, kohustuslikud andmed olemas). Andmeprobleeme ${totalIssues} (kiirusindeksi lüngad eraldi). Kontrollid arvestavad parandatud (efektiivseid) väärtusi.`
            : `Kõik = kogu andmebaas, ka peidetud, arhiveeritud, laoseisuta ja kinni peetud kirjed. Andmeprobleeme ${totalIssues} (kiirusindeksi lüngad eraldi).`
        }
        actions={<ScopeSwitch scope={scope} />}
      />
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Pildiallikad" description="Mudelid poes kuvatava pildi päritolu järgi (rikastuse prioriteet: meie andmed → Laptopid.ee → Icecat). Müügis = vähemalt üks poes nähtav pakkumine.">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 font-normal">Allikas</th>
                <th className="py-1 text-right font-normal">Müügis</th>
                <th className="py-1 text-right font-normal">Kõik mudelid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.imageSources.map((row) => (
                <tr key={row.key}>
                  <td className="py-1.5">
                    {row.key === "PLACEHOLDER" ? (
                      <Link href={issueHref("no-images", scope)} className="text-primary hover:underline">
                        {row.label}
                      </Link>
                    ) : (
                      row.label
                    )}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{row.onSale}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.all}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card
          title="Kiirusindeks ja maks. sagedus"
          description={`${sellable ? "Müügis" : "Kõik"} konfiguratsioonid (${data.performance.total}). Allikas: tarnija ise (Laptopid.ee API) või täpselt sama CPU/GPU Laptopid.ee väärtus (rikastus). Üldnimi ("Integrated") ei sobi. "Puudub" avab kirjed.`}
        >
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
              {data.performance.rows.map((row) => (
                <tr key={row.key}>
                  <td className="py-1.5">{row.label}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.direct}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.matched}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    <Link href={issueHref(row.issue, scope)} className="font-medium text-primary hover:underline">
                      {row.missing}
                    </Link>
                  </td>
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
        <Card title={`Mudelid (${data.modelTotal}${sellable ? " müügis" : ""})`} description="Pildid ja Icecati vasted">
          <IssueList items={data.models} total={data.modelTotal} scope={scope} unit="mudelitest" />
        </Card>
        <Card title={`Konfiguratsioonid (${data.listingTotal}${sellable ? " müügis" : ""})`} description="Tarnija andmete täielikkus ja kiirusindeks">
          <IssueList items={data.listings} total={data.listingTotal} scope={scope} unit="konfiguratsioonidest" />
        </Card>
      </div>
    </>
  );
}
