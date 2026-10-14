import Link from "next/link";
import { VISIBILITY_CHECK_LABELS, type VisibilityCheckKey } from "@/domain/admin/visibility";
import { cx } from "@/components/ui/class-names";

/**
 * Konfiguratsiooni lehe ülaosa: kas pakkumine on poes nähtav ja miks mitte. Otsus tuleb poe reeglist
 * (storefrontVisibility → describeVisibility), see komponent ainult kuvab.
 */
export function ShopVisibility({
  visible,
  checks,
  reason,
  deliveryLabel,
  quantityUnknown,
  customerPrice,
  shopHref,
}: {
  visible: boolean;
  checks: Record<VisibilityCheckKey, boolean>;
  reason: { short: string; detail: string } | null;
  deliveryLabel: string | null;
  quantityUnknown: boolean;
  customerPrice: string | null;
  shopHref: string | null;
}) {
  return (
    <section
      aria-labelledby="poes-nahtavus"
      className={cx("mb-6 rounded-lg border px-4 py-3", visible ? "border-success bg-success-soft" : "border-warning bg-warning-soft")}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div>
          <h2 id="poes-nahtavus" className="text-xs font-semibold tracking-wide text-muted uppercase">
            Poes nähtavus
          </h2>
          <p className={cx("mt-1 text-lg font-semibold", visible ? "text-success" : "text-warning")}>{visible ? "✓ Poes nähtav" : "✕ Poes ei kuvata"}</p>
          {visible ? (
            <p className="text-sm text-text">
              {[deliveryLabel, quantityUnknown ? "täpne kogus teadmata" : null, customerPrice ? `kliendihind ${customerPrice}` : null].filter(Boolean).join(" · ")}
            </p>
          ) : (
            reason && (
              <p className="text-sm text-text">
                <strong>Põhjus:</strong> {reason.detail}
              </p>
            )
          )}
        </div>
        {shopHref && (
          <Link href={shopHref} target="_blank" rel="noopener" className="text-sm font-medium text-primary hover:underline">
            Vaata poes ↗
          </Link>
        )}
      </div>
      <ul className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {(Object.keys(VISIBILITY_CHECK_LABELS) as VisibilityCheckKey[]).map((key) => (
          <li key={key} className="flex gap-2">
            <span aria-hidden className={checks[key] ? "text-success" : "text-danger"}>
              {checks[key] ? "✓" : "✕"}
            </span>
            <span className={checks[key] ? "text-muted" : "font-medium text-text"}>
              {VISIBILITY_CHECK_LABELS[key]}
              <span className="sr-only">{checks[key] ? " — jah" : " — ei"}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
