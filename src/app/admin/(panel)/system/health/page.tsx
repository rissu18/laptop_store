import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { Card, DefinitionList, PageHeader } from "@/components/admin/ui";
import { getSystemHealth } from "@/server/admin/system/queries";

/** Admin on alati päringupõhine (sessioon, värsked andmed) — eelrenderdust ega "instant" navigeerimist ei kasutata. */
export const instant = false;

export const metadata: Metadata = { title: "Süsteemi tervis" };

const ICONS = {
  ok: <CheckCircle2 className="size-5 text-success" aria-label="Korras" />,
  warn: <AlertTriangle className="size-5 text-warning" aria-label="Hoiatus" />,
  error: <XCircle className="size-5 text-danger" aria-label="Viga" />,
};

export default async function HealthPage() {
  const { checks, facts } = await getSystemHealth();
  return (
    <>
      <PageHeader title="Süsteemi tervis" breadcrumbs={[{ label: "Süsteem" }, { label: "Tervis" }]} description="Mõõdetud lehe avamise hetkel." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Kontrollid">
          <ul className="divide-y divide-border">
            {checks.map((check) => (
              <li key={check.name} className="flex items-start gap-3 py-3">
                {ICONS[check.status]}
                <div>
                  <p className="font-medium">{check.name}</p>
                  <p className="text-sm text-muted">{check.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Keskkond">
          <DefinitionList items={facts} />
        </Card>
      </div>
    </>
  );
}
