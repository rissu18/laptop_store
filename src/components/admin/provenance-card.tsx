import type { ProvenanceRow, ProvenanceSource } from "@/domain/admin/provenance";
import { cx } from "@/components/ui/class-names";
import { PerformanceOverrideField } from "./quick-fix";
import { Badge, Card } from "./ui";

const SOURCE_LABELS: Record<Exclude<ProvenanceSource, null>, string> = { manual: "Parandus", supplier: "Tarnija", enrichment: "Rikastus", model: "Mudel" };
const SOURCE_TONES = { manual: "primary", supplier: "neutral", enrichment: "info", model: "neutral" } as const;
const PLACEHOLDERS = { cpuMaxMhz: "nt 4400", cpuBenchmark: "nt 6235", gpuBenchmark: "nt 2100" } as const;

const show = (value: unknown) => (value === null || value === undefined || value === "" ? <span className="text-subtle">—</span> : typeof value === "boolean" ? (value ? "Jah" : "Ei") : String(value));

/**
 * Konfiguratsiooni lehe "Väljade päritolu": tarnija / rikastus / admini parandus / kehtiv (poes). Admini parandus on
 * alati kõige kõrgema prioriteediga ja visuaalselt esile tõstetud. Jõudlusväärtusi saab siin otse parandada.
 */
export function ProvenanceCard({ listingId, rows, keys }: { listingId: string; rows: ProvenanceRow[]; keys: { cpu: string | null; gpu: string | null } }) {
  return (
    <Card
      title="Väljade päritolu ja jõudlus"
      description={`Prioriteet: admini parandus → tarnija → rikastus (täidab ainult tühja tarnija välja, täpse vastega). Kanooniline CPU võti: ${keys.cpu ?? "—"} · GPU võti: ${keys.gpu ?? "—"}.`}
    >
      <div id="joudlus" className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="px-1 py-1.5 font-medium">Väli</th>
              <th className="px-1 py-1.5 font-medium">Tarnija</th>
              <th className="px-1 py-1.5 font-medium">Rikastus</th>
              <th className="px-1 py-1.5 font-medium">Admini parandus</th>
              <th className="px-1 py-1.5 font-medium">Kehtiv (poes)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.field} className={cx("align-top", row.hasManual && "bg-primary-soft")}>
                <td className="px-1 py-2 font-medium">{row.label}</td>
                <td className={cx("px-1 py-2", row.source !== "supplier" && "text-muted")}>{show(row.supplier)}</td>
                <td className={cx("px-1 py-2", row.source !== "enrichment" && "text-muted")}>
                  {row.enrichment ? (
                    <>
                      {show(row.enrichment.value)}
                      {row.enrichment.matchedBy && <span className="block text-xs text-subtle">{[row.enrichment.source, row.enrichment.matchedBy].filter(Boolean).join(", ")}</span>}
                    </>
                  ) : (
                    show(null)
                  )}
                </td>
                <td className="px-1 py-2">
                  {row.hasManual ? <strong className="text-primary">{row.manual === null ? "puudub (märgitud)" : show(row.manual)}</strong> : show(undefined)}
                  {row.overrideField && (
                    <div className="mt-1">
                      <PerformanceOverrideField listingId={listingId} field={row.overrideField} hasManual={row.hasManual} placeholder={PLACEHOLDERS[row.overrideField]} />
                    </div>
                  )}
                </td>
                <td className="px-1 py-2">
                  <span className="font-semibold">{show(row.effective)}</span>{" "}
                  {row.source && <Badge tone={SOURCE_TONES[row.source]}>{SOURCE_LABELS[row.source]}</Badge>}
                  {row.note && <span className="block text-xs text-muted">{row.note}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
