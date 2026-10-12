import type { Metadata } from "next";
import Link from "next/link";
import { DataTable, type Column } from "@/components/admin/data-table";
import { fmtDateTime } from "@/components/admin/format";
import { SyncNowButton } from "@/components/admin/sync-now-button";
import { SYNC_STALE_MESSAGE } from "@/domain/catalog/sync-health";
import { Badge, Card, DefinitionList, PageHeader } from "@/components/admin/ui";
import { getSupplierOverview, getTechSupplierOverview } from "@/server/admin/suppliers/queries";
import { TechSupplierSection } from "@/components/admin/tech-supplier-section";
import type { SyncRunRow } from "@/server/catalog-sync/sync-runs";

/** Admin on alati päringupõhine (sessioon, värsked andmed) — eelrenderdust ega "instant" navigeerimist ei kasutata. */
export const instant = false;
/** "Sync now" server action jookseb selle lehe funktsioonis (esimene import loeb ka ~1100 pildi mõõdud) */
export const maxDuration = 300;

export const metadata: Metadata = { title: "Tarnijad" };

const num = (stats: Record<string, unknown>, key: string) => (typeof stats[key] === "number" ? (stats[key] as number) : null);

const TRIGGER_LABELS: Record<string, string> = { ADMIN: "Admin", CRON: "Ajastatud", CLI: "Käsurida", TEST: "Test" };

function RunResult({ run }: { run: SyncRunRow }) {
  if (run.status === "SUCCESS") return run.snapshotTrusted ? <Badge tone="success">OK</Badge> : <Badge tone="warning">OK, puuduvaid ei võetud maha</Badge>;
  if (run.status === "RUNNING") return <Badge>Käib</Badge>;
  return <Badge tone="danger">Ebaõnnestus</Badge>;
}

const COLUMNS: Column<SyncRunRow>[] = [
  { key: "started", header: "Algus", mobile: "title", cell: (r) => fmtDateTime(r.startedAt) },
  { key: "trigger", header: "Käivitaja", cell: (r) => `${TRIGGER_LABELS[r.trigger] ?? r.trigger}${r.triggeredBy && r.trigger === "ADMIN" ? ` (${r.triggeredBy})` : ""}` },
  {
    key: "status",
    header: "Tulemus",
    cell: (r) => <RunResult run={r} />,
  },
  { key: "received", header: "Saadud", align: "right", cell: (r) => num(r.stats, "received") },
  { key: "created", header: "Uued", align: "right", cell: (r) => num(r.stats, "created") },
  { key: "updated", header: "Muutunud", align: "right", cell: (r) => num(r.stats, "updated") },
  { key: "unchanged", header: "Muutmata", align: "right", mobile: "hidden", cell: (r) => num(r.stats, "unchanged") },
  { key: "unavailable", header: "Maha võetud", align: "right", cell: (r) => num(r.stats, "madeUnavailable") },
  { key: "rejected", header: "Vigased", align: "right", cell: (r) => num(r.stats, "rejected") },
  { key: "error", header: "Viga", mobile: "show", cell: (r) => r.error ?? (typeof r.stats.trustReason === "string" ? r.stats.trustReason : null) },
];

export default async function SuppliersPage() {
  const [data, tech] = await Promise.all([getSupplierOverview(), getTechSupplierOverview()]);
  const { health, lastFinished } = data;
  const last = data.lastSuccess;
  const rejectedSample = Array.isArray(last?.stats.rejectedSample) ? (last.stats.rejectedSample as { externalId: string | null; message: string }[]) : [];
  const taxonomyWarnings = Array.isArray(last?.stats.taxonomyWarningSample) ? (last.stats.taxonomyWarningSample as { externalId: string; message: string }[]) : [];

  return (
    <>
      <PageHeader
        title="Tarnijad"
        breadcrumbs={[{ label: "Kataloog" }, { label: "Tarnijad" }]}
        description="Laptopid.ee API ja Tech hinnakiri (Google Sheets XLSX) → valideerimine → PostgreSQL → pood. Pood ja kassa loevad ainult andmebaasi, mitte otse tarnijat."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          {health.stale && (
            <div role="alert" className="rounded-md border border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
              <p className="font-semibold">{SYNC_STALE_MESSAGE}</p>
              <p className="mt-1">
                {health.lastSuccessAt
                  ? `Viimane edukas sünkroonimine: ${health.ageLabel} (automaatne sync päeval iga 30 min, öösel iga 2 h; hoiatus praegu üle ${health.staleAfterMs / 60_000} min).`
                  : "Edukat sync'i pole veel olnud."}{" "}
                Pood näitab viimast edukat andmebaasi seisu. Kontrolli välist ajastajat ja CRON_SECRET-i või vajuta „Sync now“.
              </p>
            </div>
          )}
          <Card title="Sync'i seis">
            <DefinitionList
              items={[
                {
                  label: "Viimane edukas sync",
                  value: health.lastSuccessAt ? `${fmtDateTime(health.lastSuccessAt)} (${health.ageLabel})` : "Pole veel",
                },
                { label: "Viimase käivituse tulemus", value: lastFinished ? <RunResult run={lastFinished} /> : "Pole veel" },
                { label: "Saadud", value: lastFinished ? num(lastFinished.stats, "received") : null },
                { label: "Muutunud / uued", value: lastFinished ? `${num(lastFinished.stats, "updated") ?? "–"} / ${num(lastFinished.stats, "created") ?? "–"}` : null },
                { label: "Maha võetud (pole enam saadaval)", value: lastFinished ? num(lastFinished.stats, "madeUnavailable") : null },
                {
                  label: "Vead",
                  value: lastFinished
                    ? lastFinished.status === "FAILED"
                      ? (lastFinished.error ?? "Ebaõnnestus")
                      : `Vigased kirjed ${num(lastFinished.stats, "rejected") ?? 0}, pildivead ${num(lastFinished.stats, "imageErrors") ?? 0}`
                    : null,
                },
              ]}
            />
          </Card>
          <Card title="Laptopid.ee">
            <DefinitionList
              items={[
                { label: "API seadistus", value: data.configured ? "Seadistatud" : "Puudub (LAPTOPID_API_BASE_URL / LAPTOPID_API_KEY)" },
                { label: "Saadud (viimane edukas)", value: last ? num(last.stats, "received") : null },
                { label: "Uued", value: last ? num(last.stats, "created") : null },
                { label: "Muutunud", value: last ? num(last.stats, "updated") : null },
                { label: "Maha võetud (pole enam saadaval)", value: last ? num(last.stats, "madeUnavailable") : null },
                { label: "Vigased / vahele jäetud", value: last ? num(last.stats, "rejected") : null },
                { label: "Pakkumisi andmebaasis", value: `${data.listings.total} (saadaval ${data.listings.available}, mitte saadaval ${data.listings.unavailable})` },
                { label: "Teiste tarnijate aktiivseid pakkumisi", value: data.otherActiveListings },
                {
                  label: "Automaatne sync",
                  value: data.cronConfigured
                    ? "Cron-otspunkt valmis (CRON_SECRET seadistatud): /api/cron/laptopid-sync — 5-min sagedus vajab välist ajastajat, vt docs/LAPTOPID_SYNC.md"
                    : "Pole seadistatud (CRON_SECRET puudub) — kasuta „Sync now“",
                },
              ]}
            />
          </Card>
          {rejectedSample.length > 0 && (
            <Card title="Viimases sync'is vahele jäetud tooted" description="Neid poodi ei imporditud. Põhjus on tarnija andmetes (nt tundmatu seisukord) — midagi ei mõelda välja.">
              <ul className="space-y-1 text-sm">
                {rejectedSample.map((r, i) => (
                  <li key={`${r.externalId}-${i}`}>
                    <span className="font-mono">{r.externalId ?? "?"}</span> — <span className="text-muted">{r.message}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {taxonomyWarnings.length > 0 && (
            <Card title="Imporditud hoiatusega (tundmatu seeria)" description="Toode on poes; seeria tuletati mudelinimest. Kontrolli ja paranda vajadusel mudeli andmetes.">
              <ul className="space-y-1 text-sm">
                {taxonomyWarnings.map((w) => (
                  <li key={w.externalId}>
                    <span className="font-mono">{w.externalId}</span> — <span className="text-muted">{w.message}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <section aria-labelledby="sync-ajalugu" className="flex flex-col gap-3">
            <h2 id="sync-ajalugu" className="text-lg font-semibold">
              Viimased käivitused
            </h2>
            <DataTable rows={data.runs} columns={COLUMNS} rowKey={(r) => r.id} caption="Laptopid.ee sync'i käivitused" empty={{ title: "Sync pole veel käivitatud" }} />
            <Link href="/admin/system/logs?source=LAPTOPID" className="text-sm text-primary hover:underline">
              Süsteemilogi (LAPTOPID) →
            </Link>
          </section>
        </div>
        <aside className="flex min-w-0 flex-col gap-6">
          <Card title="Käsitsi sync">
            <SyncNowButton disabled={!data.configured} />
          </Card>
        </aside>
      </div>
      <TechSupplierSection data={tech} />
    </>
  );
}
