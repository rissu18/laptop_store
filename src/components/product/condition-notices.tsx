import { Info } from "lucide-react";
import type { ListingDetails } from "@/domain/catalog/listing-details";
import { cx } from "@/components/ui/class-names";

type Notices = NonNullable<ListingDetails["conditionNotices"]>;

/**
 * Seisukorra märkused (nt Foxway lubatud kosmeetilised / nõrgad LCD jäljed) — tootelehel seisukorra juures, mitte
 * tehniliste andmete lõpus. Rahulik toon: NOTICE pehme hoiatusvärviga, INFO neutraalne (mitte punane viga).
 * Tarnija toortermineid ("Working*") ei kuvata — tekstid on sync'is eesti keelde tõlgitud.
 */
export function ConditionNotices({ notices, className }: { notices: Notices | undefined; className?: string }) {
  if (!notices?.length) return null;
  const hasNotice = notices.some((n) => n.severity === "NOTICE");
  return (
    <section
      aria-label="Seisukorra märkus"
      className={cx("rounded-lg border px-3.5 py-3 text-sm", hasNotice ? "border-warning/30 bg-warning-soft" : "border-border bg-surface-alt", className)}
    >
      <p className="flex items-center gap-1.5 font-semibold text-text">
        <Info className={cx("size-4 shrink-0", hasNotice ? "text-warning" : "text-muted")} aria-hidden />
        Seisukorra märkus
      </p>
      <ul className="mt-1 space-y-1 text-body">
        {notices.map((notice) => (
          <li key={notice.text}>{notice.text}</li>
        ))}
      </ul>
    </section>
  );
}

/** Tootekaardil ainult NOTICE (nt LCD): "Seisukorra märkus: ekraanil võivad esineda nõrgad laigud." */
export function ConditionNoticeLine({ notices }: { notices: Notices | undefined }) {
  const notice = notices?.find((n) => n.severity === "NOTICE");
  if (!notice) return null;
  return (
    <p className="text-xs text-muted">
      <span className="font-medium text-body">Seisukorra märkus:</span> {notice.short}.
    </p>
  );
}
