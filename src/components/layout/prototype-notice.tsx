import { PROTOTYPE_NOTICE } from "@/domain/storefront/storefront-notices";

/** Hoiatusriba prototüübirežiimis (admin → Seaded → Pood): kataloog on päris, tellimused on testtellimused. */
export function PrototypeNotice() {
  return (
    <div role="note" className="bg-topbar px-4 py-2 text-center text-xs text-white">
      <strong className="font-semibold">{PROTOTYPE_NOTICE.label}</strong> {PROTOTYPE_NOTICE.text}
    </div>
  );
}
