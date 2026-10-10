import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/admin/ui";
import { cx } from "@/components/ui/class-names";
import { getDataQualityCounts, type IssueCount } from "@/server/admin/data-quality/queries";

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
  const data = await getDataQualityCounts();
  const totalIssues = [...data.models, ...data.listings].reduce((sum, item) => sum + item.count, 0);

  return (
    <>
      <PageHeader
        title="Andmekvaliteet"
        breadcrumbs={[{ label: "Kataloog" }, { label: "Andmekvaliteet" }]}
        description={`Kontrollid arvestavad parandatud (efektiivseid) väärtusi. Kokku ${totalIssues} probleemi. Klõpsa kategoorial, et näha kirjeid; "Paranda" avab detailvaate.`}
      />
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
