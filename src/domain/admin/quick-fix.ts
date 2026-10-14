import { PERFORMANCE_OVERRIDE_FIELDS } from "@/domain/catalog/benchmarks";

/**
 * Kiirparanduse väljad (Andmekvaliteet / konfiguratsiooni jõudluse kaart): ainult madala riskiga väljad, mis
 * salvestuvad parandusena (manual_overrides). Hind, saadavus, KM režiim ja rikked EI ole kiirparandatavad.
 */
export const QUICK_FIX_FIELDS = ["keyboard", ...PERFORMANCE_OVERRIDE_FIELDS] as const;
export type QuickFixField = (typeof QUICK_FIX_FIELDS)[number];
