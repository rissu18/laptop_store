/**
 * Admin → "Poes nähtavus": poe nähtavuse otsuse (server/catalog/db-catalog-mapper.ts → storefrontVisibility)
 * eestikeelne selgitus. Siin ON AINULT tekstid — otsus ise tuleb poe reeglist, mitte siit.
 */

export const VISIBILITY_CHECK_LABELS = {
  listingStatus: "Konfiguratsioon aktiivne",
  modelStatus: "Mudel aktiivne",
  qualityHold: "Kvaliteedi kinnipidamist pole",
  availability: "Saadaval",
  requiredFields: "Kohustuslikud andmed olemas (CPU, RAM, SSD, lubatud seisukord, hind, ekraan, tootja)",
} as const;

export type VisibilityCheckKey = keyof typeof VISIBILITY_CHECK_LABELS;

const STATUS_LABELS: Record<string, string> = { ACTIVE: "aktiivne", HIDDEN: "peidetud", ARCHIVED: "arhiveeritud" };

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const MISSING_FIELD_LABELS: Record<string, string> = {
  cpu: "protsessor",
  ram: "RAM",
  storage: "SSD",
  grade: "lubatud seisukord",
  salePrice: "müügihind",
  screenSize: "ekraan",
  manufacturer: "tuntud tootja",
};

export interface VisibilityExplainInput {
  blockedBy: VisibilityCheckKey | null;
  listingStatus: string;
  modelStatus: string;
  /** Efektiivne kinnipidamine (REVIEW / BLOCKED) */
  qualityHold: string | null;
  /** Tarnija põhjus (nt Foxway: 'Seisukord "Grade C" — Foxway C klassi ei müüda') */
  qualityHoldReason?: string | null;
  /** Kas kinnipidamine tuleb admini parandusest (manual_overrides.qualityHold) */
  holdFromAdmin?: boolean;
  available: boolean | null;
  stock: number | null;
  missing: string[];
}

/**
 * "Vaata poes ↗" link ainult siis, kui pakkumine on poes päriselt nähtav — muidu viiks link tootelehele, kus seda
 * konfiguratsiooni pole (või "Toodet ei leitud").
 */
export function storefrontHref(input: { visible: boolean; modelSlug: string; publicListingId: string }): string | null {
  if (!input.visible) return null;
  return `/toode/${input.modelSlug}?konfiguratsioon=${encodeURIComponent(input.publicListingId)}`;
}

/** Lühike põhjus (tabeli veerg "Poes") ja pikk selgitus (konfiguratsiooni leht). null = poes nähtav. */
export function explainVisibility(input: VisibilityExplainInput): { short: string; detail: string } | null {
  switch (input.blockedBy) {
    case null:
      return null;
    case "listingStatus":
      return { short: capitalize(STATUS_LABELS[input.listingStatus] ?? input.listingStatus), detail: `Konfiguratsiooni staatus on "${STATUS_LABELS[input.listingStatus] ?? input.listingStatus}" (admini väli).` };
    case "modelStatus":
      return { short: `Mudel ${STATUS_LABELS[input.modelStatus] ?? input.modelStatus}`, detail: `Mudeli staatus on "${STATUS_LABELS[input.modelStatus] ?? input.modelStatus}" — mudeli kõik konfiguratsioonid on poest peidetud.` };
    case "qualityHold": {
      const kind = input.qualityHold === "BLOCKED" ? "Blokeeritud" : "Ülevaatusel";
      const source = input.holdFromAdmin ? "admini parandus" : input.qualityHoldReason?.trim() || "tarnija andmete põhjal";
      return { short: kind, detail: `Quality hold: ${input.qualityHold} — ${source}.` };
    }
    case "availability":
      if (input.available === false) return { short: "Tarnijal pole", detail: "Pakkumist pole enam tarnija viimases nimekirjas (available = false)." };
      if (input.stock !== null && input.stock <= 0) return { short: "Laoseis 0", detail: `Laoseis on ${input.stock} tk — müügis pole ühtegi seadet.` };
      return { short: "Laoseis teadmata", detail: "Tarnija ei andnud kogust ega saadavust — pakkumist ei müüda (koguseid ei leiutata)." };
    case "requiredFields": {
      const fields = input.missing.map((key) => MISSING_FIELD_LABELS[key] ?? key).join(", ");
      return { short: "Andmed puudu", detail: `Poe kohustuslikud andmed puuduvad: ${fields}.` };
    }
  }
}
