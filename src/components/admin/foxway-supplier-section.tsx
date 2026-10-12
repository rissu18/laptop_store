import Link from "next/link";
import { DataTable, type Column } from "@/components/admin/data-table";
import { fmtDateTime } from "@/components/admin/format";
import { SyncNowButton } from "@/components/admin/sync-now-button";
import { Badge, Card, DefinitionList } from "@/components/admin/ui";
import { SYNC_STALE_MESSAGE } from "@/domain/catalog/sync-health";
import type { getFoxwaySupplierOverview } from "@/server/admin/suppliers/queries";
import type { SyncRunRow } from "@/server/catalog-sync/sync-runs";

/**
 * Admin → Tarnijad → Foxway (API). Laptopid.ee ja Tech kaardid on eraldi ja muutmata.
 * Automaatset Foxway tellimust EI tehta — tellimuse hange on käsitsi (Tellimused → tellimus → "Foxway hange").
 */

type Overview = Awaited<ReturnType<typeof getFoxwaySupplierOverview>>;
type OfferSample = { sku: string; productName: string; quantity: number; appearance: string | null; reasons: string[] };
type InvalidSample = { feed: string; sku: string | null; productName: string | null; reasons: string[] };
type Duplicate = { sku: string; catalogs: string[]; conflict: boolean; differences: string[] };

const num = (stats: Record<string, unknown> | undefined, key: string) => (stats && typeof stats[key] === "number" ? (stats[key] as number) : null);
const list = <T,>(stats: Record<string, unknown> | undefined, key: string): T[] => (stats && Array.isArray(stats[key]) ? (stats[key] as T[]) : []);
const TRIGGER_LABELS: Record<string, string> = { ADMIN: "Admin", CRON: "Ajastatud", CLI: "Käsurida", TEST: "Test" };

function RunResult({ run }: { run: SyncRunRow }) {
  if (run.status === "SUCCESS") return run.snapshotTrusted ? <Badge tone="success">OK</Badge> : <Badge tone="warning">OK, puuduvaid ei võetud maha</Badge>;
  if (run.status === "RUNNING") return <Badge>Käib</Badge>;
  return <Badge tone="danger">Ebaõnnestus</Badge>;
}

const duration = (run: SyncRunRow) => (run.finishedAt ? `${((run.finishedAt.getTime() - run.startedAt.getTime()) / 1000).toFixed(1)} s` : null);

const COLUMNS: Column<SyncRunRow>[] = [
  { key: "started", header: "Algus", mobile: "title", cell: (r) => fmtDateTime(r.startedAt) },
  { key: "trigger", header: "Käivitaja", cell: (r) => `${TRIGGER_LABELS[r.trigger] ?? r.trigger}${r.triggeredBy && r.trigger === "ADMIN" ? ` (${r.triggeredBy})` : ""}` },
  { key: "status", header: "Tulemus", cell: (r) => <RunResult run={r} /> },
  { key: "duration", header: "Kestus", align: "right", mobile: "hidden", cell: duration },
  { key: "skus", header: "SKU-d", align: "right", cell: (r) => num(r.stats, "uniqueSkus") },
  { key: "publishable", header: "Poes", align: "right", cell: (r) => num(r.stats, "publishable") },
  { key: "created", header: "Uued", align: "right", cell: (r) => num(r.stats, "created") },
  { key: "updated", header: "Muutunud", align: "right", cell: (r) => num(r.stats, "updated") },
  { key: "unavailable", header: "Maha võetud", align: "right", cell: (r) => num(r.stats, "madeUnavailable") },
  { key: "error", header: "Viga", mobile: "show", cell: (r) => r.error ?? (typeof r.stats.trustReason === "string" ? r.stats.trustReason : null) },
];

function OfferSampleList({ title, description, rows }: { title: string; description: string; rows: OfferSample[] }) {
  if (!rows.length) return null;
  return (
    <Card title={`${title} (${rows.length})`} description={description}>
      <details className="text-sm">
        <summary className="cursor-pointer text-primary">Näita</summary>
        <ul className="mt-2 space-y-1">
          {rows.map((r) => (
            <li key={r.sku}>
              <Link href={`/admin/products/listings?q=${encodeURIComponent(r.sku)}`} className="font-mono text-xs text-primary hover:underline">
                {r.sku}
              </Link>{" "}
              {r.productName} <span className="text-xs text-muted">({r.appearance ?? "–"}, {r.quantity} tk)</span> — <span className="text-muted">{r.reasons.join("; ")}</span>
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

export function FoxwaySupplierSection({ data }: { data: Overview }) {
  const { health, lastFinished } = data;
  const last = data.lastSuccess?.stats;
  const invalid = list<InvalidSample>(last, "invalidSample");
  const duplicates = list<Duplicate>(last, "duplicateSample");
  const unknownFaults = list<{ raw: string; count: number }>(last, "unknownFaults");
  const faultSummary = list<{ raw: string; severity: string; count: number }>(last, "faultSummary");
  const imagesMissing = list<{ slug: string; title: string; reused: boolean }>(last, "imagesMissingSample");

  return (
    <section aria-labelledby="foxway-tarnija" className="mt-10 flex flex-col gap-6 border-t border-border pt-8">
      <div>
        <h2 id="foxway-tarnija" className="text-xl font-semibold">
          Foxway (API)
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Foxway API (working + new × PC + Mac sülearvutid) → SKU dedup → rikete ohutusklassifikaator → PostgreSQL → pood. Täpne laoseis, tarne 2–4 tööpäeva, hind = Foxway hind + KM + 60 € + laadija
          (0 / 35 / 90 €). Tundmatu rike → ülevaatusele. Tellimine Foxwayst on käsitsi. Vt docs/FOXWAY_SYNC.md.
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          {health.stale && data.configured && (
            <div role="alert" className="rounded-md border border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
              <p className="font-semibold">{SYNC_STALE_MESSAGE}</p>
              <p className="mt-1">
                {health.lastSuccessAt ? `Viimane edukas Foxway sync: ${health.ageLabel} (päeval iga 30 min, öösel iga 2 h).` : "Edukat Foxway sync'i pole veel olnud."} Pood näitab viimast edukat andmebaasi seisu.
              </p>
            </div>
          )}
          <Card title="Foxway sync'i seis">
            <DefinitionList
              items={[
                { label: "API", value: data.configured ? "Seadistatud (FOXWAY_API_BASE_URL + FOXWAY_API_KEY)" : "Puudub (FOXWAY_API_BASE_URL / FOXWAY_API_KEY)" },
                { label: "Automaatne sync", value: data.cronConfigured ? "/api/cron/foxway-sync (QStash, Europe/Tallinn)" : "CRON_SECRET puudub — kasuta „Sync now“" },
                { label: "Viimane edukas sync", value: health.lastSuccessAt ? `${fmtDateTime(health.lastSuccessAt)} (${health.ageLabel})` : "Pole veel" },
                {
                  label: "Viimane katse",
                  value: lastFinished ? (
                    <span className="flex flex-wrap items-center gap-2">
                      {fmtDateTime(lastFinished.startedAt)} <RunResult run={lastFinished} /> {duration(lastFinished)}
                    </span>
                  ) : (
                    "Pole veel"
                  ),
                },
                ...(lastFinished?.status === "FAILED" ? [{ label: "Viga", value: lastFinished.error }] : []),
                { label: "Sync'i kestus (viimane edukas)", value: num(last, "durationMs") !== null ? `${((num(last, "durationMs") ?? 0) / 1000).toFixed(1)} s` : null },
                { label: "Working · PC Laptops", value: num(last, "fetchedWorkingPc") },
                { label: "Working · Mac Laptops", value: num(last, "fetchedWorkingMac") },
                { label: "Brand New · PC Laptops", value: num(last, "fetchedNewPc") },
                { label: "Brand New · Mac Laptops", value: num(last, "fetchedNewMac") },
                { label: "Unikaalseid SKU-sid (pärast dedup'i)", value: num(last, "uniqueSkus") },
                { label: "Laoseis kokku (täpne)", value: num(last, "totalQuantity") !== null ? `${num(last, "totalQuantity")} tk` : null },
                { label: "Uued / muutunud / muutmata", value: last ? `${num(last, "created")} / ${num(last, "updated")} / ${num(last, "unchanged")}` : null },
                { label: "Maha võetud (laoseis 0 / puudus)", value: num(last, "madeUnavailable") },
                { label: "Poodi sobivad (laos, rikketa/lubatud rike)", value: num(last, "publishable") },
                { label: "Blokeeritud rikke tõttu", value: num(last, "blocked") },
                { label: "Ülevaatus (tundmatu/ebamäärane)", value: num(last, "review") },
                { label: "Duplikaat-SKU-d (working + new) / konfliktid", value: last ? `${num(last, "duplicateSkus")} / ${num(last, "duplicateConflicts")}` : null },
                { label: "Vigased read (vahele jäetud)", value: num(last, "invalidRows") },
                { label: "Mudel: olemasolev / uus", value: last ? `${num(last, "modelsReused")} / ${num(last, "modelsCreated")}` : null },
                { label: "Pildid: taaskasutatud / Icecat / puudu (mudelid)", value: last ? `${num(last, "imagesReused")} / ${num(last, "imagesEnriched")} / ${num(last, "imagesMissing")}` : null },
                {
                  label: "Andmebaasis",
                  value: `${data.listings.total} SKU-d (laos ${data.listings.inStock}, kokku ${data.listings.stock} tk; poes ${data.listings.publishable}, blokeeritud ${data.listings.blocked}, ülevaatus ${data.listings.review})`,
                },
              ]}
            />
            <p className="mt-3 flex flex-wrap gap-3 text-sm">
              <Link href="/admin/products/listings?supplier=foxway&hold=REVIEW" className="text-primary hover:underline">
                Ülevaatusel →
              </Link>
              <Link href="/admin/products/listings?supplier=foxway&hold=BLOCKED" className="text-primary hover:underline">
                Blokeeritud →
              </Link>
              <Link href="/admin/products/listings?supplier=foxway" className="text-primary hover:underline">
                Kõik Foxway konfiguratsioonid →
              </Link>
            </p>
          </Card>
          {unknownFaults.length > 0 && (
            <Card title={`Tundmatud rikketekstid (${unknownFaults.length})`} description="Klassifikaator ei tunne neid — SKU-d on ülevaatusel/blokeeritud. Lisa reegel failis src/integrations/foxway/foxway-faults.ts, kui tähendus on kokku lepitud.">
              <ul className="space-y-1 text-sm">
                {unknownFaults.map((f) => (
                  <li key={f.raw}>
                    <span className="font-mono">{f.raw}</span> — {f.count} SKU
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {faultSummary.length > 0 && (
            <Card title="Rikete jaotus (viimane sync)">
              <details className="text-sm">
                <summary className="cursor-pointer text-primary">Näita ({faultSummary.length} erinevat)</summary>
                <ul className="mt-2 space-y-1">
                  {faultSummary.map((f) => (
                    <li key={f.raw}>
                      {f.raw} — <span className="text-muted">{f.severity}</span> · {f.count}
                    </li>
                  ))}
                </ul>
              </details>
            </Card>
          )}
          <OfferSampleList title="Blokeeritud" description="Katkine/puuduv riistvara (ekraan, kaamera, kõlar, port …), katkine seisukord, tahvel — ei müüda." rows={list<OfferSample>(last, "blockedSample")} />
          <OfferSampleList title="Ülevaatusel" description="Ebamäärane või tundmatu rike, Working* ilma kirjelduseta, mitte-SSD, mitte-EUR, tundmatu Boxed — poes ei kuvata, kuni admin otsustab (konfiguratsiooni leht → Kvaliteedi kinnipidamine)." rows={list<OfferSample>(last, "reviewSample")} />
          {invalid.length > 0 && (
            <Card title={`Vigased read (${invalid.length})`} description="Puudub SKU / ProductName või vigane Quantity / Price / tootja — ei imporditud. Olemasolev sama SKU pakkumine läks ülevaatusele.">
              <ul className="space-y-1 text-sm">
                {invalid.map((r, i) => (
                  <li key={`${r.sku}-${i}`}>
                    <span className="font-mono text-xs">{r.sku ?? "–"}</span> {r.productName ?? ""} <span className="text-xs text-muted">({r.feed})</span> — <span className="text-muted">{r.reasons.join("; ")}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {duplicates.length > 0 && (
            <Card title={`Sama SKU mitmes kataloogis (${duplicates.length})`} description="Üks pakkumine, kogust ei liideta (kanooniline rida). Konflikt = andmed erinevad (logitakse).">
              <ul className="space-y-1 text-sm">
                {duplicates.map((d) => (
                  <li key={d.sku}>
                    <span className="font-mono">{d.sku}</span> — {d.catalogs.join(" + ")} {d.conflict ? <Badge tone="warning">konflikt: {d.differences.join(", ")}</Badge> : <span className="text-muted">identne</span>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {imagesMissing.length > 0 && (
            <Card
              title={`Pildid puuduvad (${imagesMissing.length} mudelit)`}
              description="Mudelil pole Icecati ega teise tarnija pilte — poes kuvatakse illustratsioon. Lisa Icecati vaste adminis (Pildid) või käsitsi pildid; suvalisi e-poe pilte ei kasutata."
            >
              <details className="text-sm">
                <summary className="cursor-pointer text-primary">Näita</summary>
                <ul className="mt-2 columns-1 gap-6 sm:columns-2">
                  {imagesMissing.map((m) => (
                    <li key={m.slug}>
                      {m.title}
                      {m.reused && <span className="text-xs text-muted"> (olemasolev mudel)</span>}
                    </li>
                  ))}
                </ul>
              </details>
            </Card>
          )}
          <section aria-labelledby="foxway-ajalugu" className="flex flex-col gap-3">
            <h3 id="foxway-ajalugu" className="text-lg font-semibold">
              Foxway käivitused
            </h3>
            <DataTable rows={data.runs} columns={COLUMNS} rowKey={(r) => r.id} caption="Foxway sync'i käivitused" empty={{ title: "Foxway sync pole veel käivitatud" }} />
            <Link href="/admin/system/logs?source=FOXWAY" className="text-sm text-primary hover:underline">
              Süsteemilogi (FOXWAY) →
            </Link>
          </section>
        </div>
        <aside className="flex min-w-0 flex-col gap-6">
          <Card title="Tellida Foxwayst" description="Käsitsi hange — automaatset Foxway tellimust ei tehta.">
            <DefinitionList
              items={[
                { label: "Tellida Foxwayst (päris tellimused)", value: data.procurement.toOrder },
                { label: "Tellitud / teel", value: data.procurement.inProgress },
                { label: "Testtellimuste read", value: data.procurement.testRows },
              ]}
            />
            <Link href="/admin/orders" className="mt-3 inline-block text-sm text-primary hover:underline">
              Tellimused →
            </Link>
          </Card>
          <Card title="Käsitsi sync (Foxway)">
            <SyncNowButton supplier="foxway" disabled={!data.configured} />
          </Card>
        </aside>
      </div>
    </section>
  );
}
