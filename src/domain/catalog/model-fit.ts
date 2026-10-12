import { LIGHT_LAPTOP_MAX_KG } from "./features";
import { cpuTier, isHighPerformanceCpu } from "./spec-explanations";
import type { CatalogItem } from "./types";

/**
 * Tootelehe "Miks valida see mudel?" — deterministlikud spetsifikatsioonipõhised reeglid (mitte AI ega
 * turundustekst). Iga väide tuleb konfiguratsiooni päris andmetest; puuduva väärtuse korral (nt kaal
 * teadmata, CPU klass tundmatu) reegel ei rakendu. Läved on samad, mida kasutavad leidja ja kiirinfo.
 */
export interface ModelFit {
  /** "Sobib hästi" */
  goodFor: string[];
  /** "Vaata võimsamat varianti, kui …" */
  considerStronger: string[];
}

/** Vähem kui kaks "sobib hästi" põhjust → plokki ei kuvata (üks väide üksi pole kasulik). */
export const MIN_FIT_REASONS = 2;

export function modelFit({ product, variant }: CatalogItem): ModelFit | null {
  const tier = cpuTier(variant.cpu.family);
  const strongCpu = (tier !== null && tier >= 3) || isHighPerformanceCpu(variant.cpu.model);
  const weight = variant.weightKg ?? product.weightKg;
  const screen = product.screenSizeIn;

  const goodFor: string[] = [];
  if (tier !== null && tier >= 2 && variant.ramGb >= 8) goodFor.push("kontoritööks ja kaugtööks");
  if (weight !== null && weight <= LIGHT_LAPTOP_MAX_KG && screen > 0 && screen <= 14) goodFor.push("igapäevaseks kaasaskandmiseks");
  if (variant.features.lte === true || variant.features["5g"] === true) goodFor.push("tööks liikvel (mobiilne internet)");
  if (variant.ramGb >= 16 && variant.storageGb >= 512 && strongCpu) goodFor.push("programmeerimiseks");
  if (variant.gpu.dedicated && variant.ramGb >= 16) goodFor.push("graafika-, 3D- ja videotööks");
  if (variant.features.numpad === true) goodFor.push("numbritööks (numbriklahvistik)");
  if (screen >= 15.6 && !goodFor.includes("igapäevaseks kaasaskandmiseks")) goodFor.push("laua taga suurel ekraanil töötamiseks");

  if (goodFor.length < MIN_FIT_REASONS) return null;

  const considerStronger: string[] = [];
  if (!variant.gpu.dedicated) considerStronger.push("vajad eraldi graafikakaarti (nt NVIDIA) 3D- või videotööks");
  if (variant.ramGb > 0 && variant.ramGb < 16) considerStronger.push("töötad korraga paljude programmide või virtuaalmasinatega");
  else if (tier !== null && tier <= 2 && !isHighPerformanceCpu(variant.cpu.model)) considerStronger.push("vajad rohkem protsessorivõimsust (nt kompileerimine, andmetöötlus)");

  return { goodFor, considerStronger };
}
