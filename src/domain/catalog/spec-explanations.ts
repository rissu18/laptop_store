import type { CatalogItem, CpuFamily, KeyboardLayout } from "./types";

/**
 * Lühikesed, inimesele arusaadavad selgitused tootelehe kiirinfo kastidesse.
 * Deterministlikud reeglid (mitte AI tekst). Jõudlust kirjeldatakse ainult protsessori klassi
 * järgi — benchmark-andmeid meil pole, seega numbrilisi väiteid ei tehta.
 * Kui väärtus puudub, selgitust ei ole (null).
 */

/** Protsessori klass: 1 = algtase, 2 = keskklass, 3 = kõrgem klass, 4 = tipp. */
export function cpuTier(family: CpuFamily | null): number | null {
  if (!family) return null;
  // Klass on pere nime viimane number: "intel-core-i5", "intel-core-ultra-5", "amd-ryzen-5" → 5
  const tiers: Record<string, number> = { "3": 1, "5": 2, "7": 3, "9": 4 };
  return tiers[family.slice(-1)] ?? null;
}

/** H-seeria (nt i7-11850H) on suurema voolutarbega ja jõudlusega mobiilne protsessor. */
export function isHighPerformanceCpu(model: string): boolean {
  return /\d{4,5}H[KX]?\b/i.test(model);
}

export function explainCpu({ variant }: CatalogItem): string | null {
  if (isHighPerformanceCpu(variant.cpu.model)) return "Suurema jõudlusega H-seeria, ka raskemaks tööks";
  switch (cpuTier(variant.cpu.family)) {
    case 1:
      return "Sobib lihtsamaks igapäevatööks";
    case 2:
      return "Sobib igapäevatööks ja kontoritööks";
    case 3:
      return "Varu ka nõudlikumaks tööks";
    case 4:
      return "Tippklassi protsessor";
    default:
      return null;
  }
}

export function explainRam({ variant }: CatalogItem): string | null {
  const gb = variant.ramGb;
  if (!gb) return null;
  if (gb >= 64) return "Suure mälumahuga professionaalseks tööks";
  if (gb >= 32) return "Sobib nõudlikumaks tööks";
  if (gb >= 16) return "Hea igapäevaseks multitaskinguks";
  return "Piisav lihtsamaks kasutuseks";
}

export function explainStorage({ variant }: CatalogItem): string | null {
  const gb = variant.storageGb;
  if (!gb) return null;
  if (gb >= 1024) return "Palju ruumi failidele ja programmidele";
  if (gb >= 512) return "Hea tasakaal mahu ja hinna vahel";
  return "Põhikasutuseks sobiv maht";
}

export function explainDisplay({ product }: CatalogItem): string | null {
  const size = product.screenSizeIn;
  if (!size) return null;
  if (size < 14) return "Väga kompaktne, lihtne kaasas kanda";
  if (size < 15) return "Kompaktne ja hea kaasas kandmiseks";
  if (size < 16) return "Suurem ekraan mugavamaks tööks";
  return "Avar ekraan mitme akna jaoks";
}

export function explainGpu({ variant }: CatalogItem): string | null {
  if (!variant.gpu.model) return null;
  if (variant.features["nvidia-rtx"]) return "Eraldi graafikakaart 3D- ja graafikatööks";
  if (variant.gpu.dedicated) return "Eraldi graafikakaart";
  return "Sobib igapäevatööks ja videote vaatamiseks";
}

const KEYBOARD_EXPLANATIONS: Record<KeyboardLayout, string> = {
  SWE: "Skandinaavia paigutus",
  NOR: "Norra paigutus",
  EST: "Eesti paigutus",
  US: "USA paigutus",
  UK: "Inglise (UK) paigutus",
  DE: "Saksa paigutus",
};

export function explainKeyboard({ variant }: CatalogItem): string | null {
  return variant.keyboardLayout ? KEYBOARD_EXPLANATIONS[variant.keyboardLayout] : null;
}
