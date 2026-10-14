import type { Metadata } from "next";
import Link from "next/link";
import { IcecatReviewRow } from "@/components/admin/icecat-review-row";
import { EmptyState, PageHeader } from "@/components/admin/ui";
import { cx } from "@/components/ui/class-names";
import { BRAND_CODES, BRAND_NAMES } from "@/domain/catalog/types";
import { getIcecatReviewQueue, REVIEW_QUEUE_STATES, type ReviewQueueState } from "@/server/admin/images/review-queue";
import { canDownloadImages } from "@/server/admin/images/actions";
import { oneOf, pageNumber } from "@/server/admin/search-params";

/** Admin on alati päringupõhine (sessioon, värsked andmed) — eelrenderdust ega "instant" navigeerimist ei kasutata. */
export const instant = false;
/** "Laadi pildid alla" (lokaalselt) jookseb selle lehe funktsioonis */
export const maxDuration = 300;

export const metadata: Metadata = { title: "Piltide ülevaatus" };

const STATE_TABS: Record<ReviewQueueState, string> = {
  REVIEW: "Ülevaatust vajavad",
  MATCHED_NO_IMAGES: "Kinnitatud, pildid alla laadimata",
  REJECTED: "Tagasi lükatud",
  NO_MATCH: "Vaste puudub (käsitsi ID)",
};

export default async function ImageReviewPage({ searchParams }: PageProps<"/admin/images/review">) {
  const sp = await searchParams;
  const state = oneOf(sp.state, REVIEW_QUEUE_STATES) ?? "REVIEW";
  const scope = sp.scope === "all" ? "all" : "sellable";
  const brand = oneOf(sp.brand, BRAND_CODES);
  const [queue, downloadEnabled] = await Promise.all([getIcecatReviewQueue({ state, scope, brand, page: pageNumber(sp.page) }), canDownloadImages()]);

  const href = (over: Partial<{ state: string; scope: string; brand: string | undefined; page: number }>) => {
    const params = new URLSearchParams();
    const next = { state, scope, brand, ...over };
    if (next.state !== "REVIEW") params.set("state", next.state);
    if (next.scope === "all") params.set("scope", "all");
    if (next.brand) params.set("brand", next.brand);
    if (over.page && over.page > 1) params.set("page", String(over.page));
    const query = params.toString();
    return `/admin/images/review${query ? `?${query}` : ""}`;
  };
  const pill = (active: boolean) => cx("rounded-md px-3 py-1.5 text-sm font-medium", active ? "bg-primary text-on-primary" : "text-muted hover:text-text");

  return (
    <>
      <PageHeader
        title="Piltide ülevaatus (Icecat)"
        breadcrumbs={[{ label: "Pildid", href: "/admin/images" }, { label: "Ülevaatus" }]}
        description="Kandidaadi kinnitamine salvestab ainult otsuse — pildid tulevad alles allalaadimisega (Vercelis püsivat pildisalvestust pole). Tagasi lükatud Icecati toodet enam ei pakuta. Apple'il automaatset vastet ei tehta: kinnita käsitsi."
        actions={
          <nav aria-label="Skoop" className="inline-flex gap-1 rounded-lg border border-border bg-surface p-1">
            <Link href={href({ scope: "sellable", page: 1 })} className={pill(scope === "sellable")}>
              Müügis
            </Link>
            <Link href={href({ scope: "all", page: 1 })} className={pill(scope === "all")}>
              Kõik
            </Link>
          </nav>
        }
      />
      <nav aria-label="Olek" className="mb-3 flex flex-wrap gap-2">
        {REVIEW_QUEUE_STATES.map((key) => (
          <Link key={key} href={href({ state: key, page: 1 })} className={cx("rounded-full border px-3 py-1 text-sm", key === state ? "border-primary bg-primary-soft font-semibold text-primary" : "border-border text-muted hover:text-text")}>
            {STATE_TABS[key]} <span className="tabular-nums">({queue.counts[key][scope]})</span>
          </Link>
        ))}
      </nav>
      <nav aria-label="Tootja" className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Tootja:</span>
        <Link href={href({ brand: undefined, page: 1 })} className={brand ? "text-primary hover:underline" : "font-semibold"}>
          Kõik
        </Link>
        <Link href={href({ brand: "apple", page: 1 })} className={brand === "apple" ? "font-semibold" : "text-primary hover:underline"}>
          Apple (käsitsi)
        </Link>
        <form action="/admin/images/review" className="inline-flex items-center gap-1">
          {state !== "REVIEW" && <input type="hidden" name="state" value={state} />}
          {scope === "all" && <input type="hidden" name="scope" value="all" />}
          <select name="brand" defaultValue={brand ?? ""} aria-label="Tootja" className="h-8 rounded-md border border-border-strong bg-surface px-2 text-sm">
            <option value="">— vali —</option>
            {BRAND_CODES.map((code) => (
              <option key={code} value={code}>
                {BRAND_NAMES[code]}
              </option>
            ))}
          </select>
          <button type="submit" className="h-8 rounded-md border border-border px-2 text-sm">
            Näita
          </button>
        </form>
      </nav>
      <p className="mb-3 text-sm text-muted">
        {STATE_TABS[state]}: {queue.total} mudelit{scope === "sellable" ? " (müügis)" : ""}. Järjekord: müügis → rohkem poes nähtavaid konfiguratsioone → nimi.
      </p>
      {queue.rows.length === 0 ? (
        <EmptyState title="Siin pole midagi üle vaadata" description={scope === "sellable" ? "Vaata ka „Kõik“ — müügist väljas mudelid." : undefined} />
      ) : (
        <ul className="flex flex-col gap-3">
          {queue.rows.map((row) => (
            <IcecatReviewRow key={row.modelId} row={row} downloadEnabled={downloadEnabled} />
          ))}
        </ul>
      )}
      {queue.pageCount > 1 && (
        <nav aria-label="Lehekülg" className="mt-4 flex items-center gap-3 text-sm">
          {queue.page > 1 && <Link href={href({ page: queue.page - 1 })} className="text-primary hover:underline">← Eelmine</Link>}
          <span className="text-muted">
            Lk {queue.page}/{queue.pageCount}
          </span>
          {queue.page < queue.pageCount && <Link href={href({ page: queue.page + 1 })} className="text-primary hover:underline">Järgmine →</Link>}
        </nav>
      )}
    </>
  );
}
