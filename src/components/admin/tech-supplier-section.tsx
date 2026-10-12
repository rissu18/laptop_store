import Link from "next/link";
import { DataTable, type Column } from "@/components/admin/data-table";
import { fmtDateTime } from "@/components/admin/format";
import { SyncNowButton } from "@/components/admin/sync-now-button";
import { Badge, Card, DefinitionList } from "@/components/admin/ui";
import { SYNC_STALE_MESSAGE } from "@/domain/catalog/sync-health";
import type { getTechSupplierOverview } from "@/server/admin/suppliers/queries";
import type { SyncRunRow } from "@/server/catalog-sync/sync-runs";

/**
 * Admin → Tarnijad → Tech (Google Sheets hinnakiri). Laptopid.ee kaart on eraldi ja muutmata.
 * Näidistes on Tech ID ja põhjus — seerianumbreid siin ei näidata (need on konfiguratsiooni lehel).
 */

type Overview = Awaited<ReturnType<typeof getTechSupplierOverview>>;
type Sample = { row: string; techId: string | null; model: string; reason: string; noteK?: string | null; noteL?: string | null };

const num = (stats: Record<string, unknown> | undefined, key: string) => (stats && typeof stats[key] === "number" ? (stats[key] as number) : null);
const list = <T,>(stats: Record<string, unknown> | undefined, key: string): T[] => (stats && Array.isArray(stats[key]) ? (stats[key] as T[]) : []);

const TRIGGER_LABELS: Record<string, string> = { ADMIN: "Admin", CRON: "Ajastatud", CLI: "Käsurida", TEST: "Test" };

function RunResult({ run }: { run: SyncRunRow }) {
  if (run.status === "SUCCESS") return run.snapshotTrusted ? <Badge tone="success">OK</Badge> : <Badge tone="warning">OK, puuduvaid ei võetud maha</Badge>;
  if (run.status === "RUNNING") return <Badge>Käib</Badge>;
  return <Badge tone="danger">Ebaõnnestus</Badge>;
}

const COLUMNS: Column<SyncRunRow>[] = [
  { key: "started", header: "Algus", mobile: "title", cell: (r) => fmtDateTime(r.startedAt) },
  { key: "trigger", header: "Käivitaja", cell: (r) => `${TRIGGER_LABELS[r.trigger] ?? r.trigger}${r.triggeredBy && r.trigger === "ADMIN" ? ` (${r.triggeredBy})` : ""}` },
  { key: "status", header: "Tulemus", cell: (r) => <RunResult run={r} /> },
  { key: "rows", header: "Read", align: "right", mobile: "hidden", cell: (r) => num(r.stats, "laptopRows") },
  { key: "units", header: "Müügis", align: "right", cell: (r) => num(r.stats, "validUnits") },
  { key: "groups", header: "Pakkumisi", align: "right", cell: (r) => num(r.stats, "groups") },
  { key: "created", header: "Uued", align: "right", cell: (r) => num(r.stats, "created") },
  { key: "updated", header: "Muutunud", align: "right", cell: (r) => num(r.stats, "updated") },
  { key: "unavailable", header: "Maha võetud", align: "right", cell: (r) => num(r.stats, "madeUnavailable") },
  { key: "error", header: "Viga", mobile: "show", cell: (r) => r.error ?? (typeof r.stats.trustReason === "string" ? r.stats.trustReason : null) },
];

function SampleList({ title, description, rows }: { title: string; description: string; rows: Sample[] }) {
  if (!rows.length) return null;
  return (
    <Card title={`${title} (${rows.length})`} description={description}>
      <ul className="space-y-1 text-sm">
        {rows.map((r) => (
          <li key={r.row}>
            <span className="font-mono text-xs">{r.row}</span> <span className="font-mono">[{r.techId ?? "–"}]</span> {r.model} — <span className="text-muted">{r.reason}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function TechSupplierSection({ data }: { data: Overview }) {
  const { health, lastFinished } = data;
  const last = data.lastSuccess?.stats;
  const enrichmentMissing = list<{ slug: string; title: string; reused: boolean }>(last, "enrichmentMissingSample");
  const conflicts = list<{ externalUnitId: string; occurrences: string[] }>(last, "conflictSample");
  const layoutWarnings = list<string>(last, "layoutWarnings");

  return (
    <section aria-labelledby="tech-tarnija" className="mt-10 flex flex-col gap-6 border-t border-border pt-8">
      <div>
        <h2 id="tech-tarnija" className="text-xl font-semibold">
          Tech (hinnakiri)
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Google Sheets XLSX → sülearvutite tabid/sektsioonid → füüsilised seadmed (Tech ID + seerianumber) → sama konfiguratsiooni seadmed üheks pakkumiseks. Brand/Model lahtri värv = müüdud. Seisukord B, tarne 1–2 tööpäeva,
          hind = hinnakirja hind + 60 € (ostuhind − 20 €). Vt docs/TECH_SYNC.md.
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          {health.stale && data.configured && (
            <div role="alert" className="rounded-md border border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
              <p className="font-semibold">{SYNC_STALE_MESSAGE}</p>
              <p className="mt-1">
                {health.lastSuccessAt
                  ? `Viimane edukas Tech sync: ${health.ageLabel} (ajastus tööpäeviti 10–20 iga tund ja iga öö 03:00).`
                  : "Edukat Tech sync'i pole veel olnud."}{" "}
                Pood näitab viimast edukat andmebaasi seisu.
              </p>
            </div>
          )}
          <Card title="Tech sync'i seis">
            <DefinitionList
              items={[
                { label: "Hinnakiri", value: data.configured ? "Seadistatud (TECH_SHEET_URL)" : "Puudub (TECH_SHEET_URL)" },
                { label: "Viimane edukas sync", value: health.lastSuccessAt ? `${fmtDateTime(health.lastSuccessAt)} (${health.ageLabel})` : "Pole veel" },
                { label: "Viimane katse", value: lastFinished ? <span className="flex flex-wrap items-center gap-2">{fmtDateTime(lastFinished.startedAt)} <RunResult run={lastFinished} /></span> : "Pole veel" },
                ...(lastFinished?.status === "FAILED" ? [{ label: "Viga", value: lastFinished.error }] : []),
                { label: "Lähteread (sülearvuti sektsioonid)", value: num(last, "laptopRows") },
                { label: "Müüdud (värvitud) — välja", value: num(last, "soldRows") },
                { label: "Ei ole sülearvuti (tahvel/detachable) — välja", value: num(last, "notLaptopRows") },
                { label: "Defekt — välja", value: num(last, "defectRows") },
                { label: "Tundmatu märkus — välja", value: num(last, "unknownNoteRows") },
                { label: "Vigased andmed (ID, seerianr, hind …)", value: num(last, "invalidRows") },
                { label: "Konfliktid (sama Tech ID, eri andmed)", value: num(last, "conflicts") },
                { label: "Müügis füüsilisi seadmeid", value: num(last, "validUnits") },
                { label: "Pakkumisi (konfiguratsioonid)", value: num(last, "groups") },
                { label: "Uued / muutunud / muutmata", value: last ? `${num(last, "created")} / ${num(last, "updated")} / ${num(last, "unchanged")}` : null },
                { label: "Maha võetud (laoseis 0)", value: num(last, "madeUnavailable") },
                { label: "Mudel: olemasolev / uus", value: last ? `${num(last, "modelsReused")} / ${num(last, "modelsCreated")}` : null },
                { label: "Rikastus: olemasolev / Icecat / puudub", value: last ? `${num(last, "enrichmentExisting")} / ${num(last, "enrichmentIcecat")} / ${num(last, "enrichmentMissing")}` : null },
                { label: "Andmebaasis", value: `${data.listings.total} pakkumist (müügis ${data.listings.available}, kokku ${data.listings.stock} tk); seadmeid ${data.units.total} (müügis ${data.units.available})` },
              ]}
            />
          </Card>
          {layoutWarnings.length > 0 && (
            <Card title="Tabide/sektsioonide hoiatused">
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {layoutWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Card>
          )}
          <SampleList title="Tundmatu märkus (käsitsi üle vaadata)" description="Märkust ei osatud kindlalt klassifitseerida — seade jäeti müügist välja, kuni tähendus on kokku lepitud." rows={list<Sample>(last, "unknownNoteSample")} />
          <SampleList title="Defektiga seadmed" description="K/L märkuses defekt (aku, klaviatuur, ekraan, USB …) — aktiivsest laost välja." rows={list<Sample>(last, "defectSample")} />
          <SampleList title="Vigased andmed" description="Puudub Tech ID, seerianumber, hind (M) või muu kohustuslik väli — ei impordita." rows={list<Sample>(last, "invalidSample")} />
          {conflicts.length > 0 && (
            <Card title={`Konfliktid (${conflicts.length})`} description="Sama Tech ID mitmel real erinevate andmetega — seade on müügist väljas, kuni hinnakiri parandatakse.">
              <ul className="space-y-1 text-sm">
                {conflicts.map((c) => (
                  <li key={c.externalUnitId}>
                    <span className="font-mono">{c.externalUnitId}</span> — <span className="text-muted">{c.occurrences.join(", ")}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {enrichmentMissing.length > 0 && (
            <Card title={`Rikastus puudub (${enrichmentMissing.length})`} description="Mudelil pole Icecati ega teise tarnija pilte/andmeid — poes kuvatakse illustratsioon, puuduvad väärtused on tühjad. Icecati vaste vajab GTIN/MPN-i (Tech ei anna) — lisa adminis Icecat → mudel.">
              <ul className="columns-1 gap-6 text-sm sm:columns-2">
                {enrichmentMissing.map((m) => (
                  <li key={m.slug}>
                    {m.title}
                    {m.reused && <span className="text-xs text-muted"> (olemasolev mudel)</span>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <section aria-labelledby="tech-ajalugu" className="flex flex-col gap-3">
            <h3 id="tech-ajalugu" className="text-lg font-semibold">
              Tech käivitused
            </h3>
            <DataTable rows={data.runs} columns={COLUMNS} rowKey={(r) => r.id} caption="Tech sync'i käivitused" empty={{ title: "Tech sync pole veel käivitatud" }} />
            <Link href="/admin/system/logs?source=TECH" className="text-sm text-primary hover:underline">
              Süsteemilogi (TECH) →
            </Link>
          </section>
        </div>
        <aside className="flex min-w-0 flex-col gap-6">
          <Card title="Käsitsi sync (Tech)">
            <SyncNowButton supplier="tech" disabled={!data.configured} />
          </Card>
        </aside>
      </div>
    </section>
  );
}
