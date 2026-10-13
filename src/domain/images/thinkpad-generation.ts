import { buildModelIdentity, cpuEras, type ModelIdentityInput } from "./model-identity";

/**
 * ThinkPadi põlvkond pakkumiste protsessorite järgi, kui mudelinimes seda pole ("ThinkPad X13", "L15", "P15").
 * AINULT lisatõend Icecati otsinguks: tuletatud põlvkonnaga mudel peab Icecatis ikka läbima nime, korpuse, ekraani ja
 * CPU ajastu kontrolli (titleHasIdentity + cpuEraConflict). Mitmetähenduslik → null (jääb REVIEW).
 *
 * Kehtib liinidele, mis algasid 2020 (Gen 1 = Intel 10. põlvkond): T14/T14s/T15/T15p/T15g, P14s/P15s/P15/P15v/P17,
 * L13 (+ Yoga), L14, L15, X13 (+ Yoga) → Intel N. põlvkond = Gen N − 9 (Core Ultra = Gen 5).
 * AMD: T14/T14s/X13/P14s Ryzen 4000 = Gen 1 … 8000 = Gen 5; L13/L14/L15 Ryzen 4000 = Gen 1, Ryzen 7000 (7x30) = Gen 4,
 * Ryzen 5000 jagavad Gen 2 ja Gen 3 → ei tuletata.
 * E-seeria (E14 Gen 3 = ainult AMD) ja vanemad liinid (T480, X1 Carbon) ei kuulu siia.
 */

const INTEL_LINES = /^(t14s?|t15[pgv]?|p14s|p15[sv]?|p17|l13|l14|l15|x13)$/;
const AMD_LINES = /^(t14s?|x13|p14s)$/;
const AMD_L_LINES = /^(l13|l14|l15)$/;
/** L-seeria: ainult üheselt tuletatavad Ryzen seeriad */
const AMD_L_GENERATION: Record<number, number> = { 4: 1, 7: 4 };
const GENERATION = /^g\d{1,2}$/;

export interface InferredGeneration {
  generation: number | null;
  reason: string;
}

export function inferThinkPadGeneration(input: ModelIdentityInput, cpus: string[]): InferredGeneration {
  if (input.manufacturer.toLowerCase() !== "lenovo") return { generation: null, reason: "ei ole Lenovo" };
  const identity = buildModelIdentity(input);
  if (!identity.tokens.includes("thinkpad")) return { generation: null, reason: "ei ole ThinkPad" };
  if (identity.tokens.some((t) => GENERATION.test(t))) return { generation: null, reason: "põlvkond on nimes" };
  const line = identity.tokens.find((t) => INTEL_LINES.test(t));
  if (!line) return { generation: null, reason: "liin ei kuulu 2020+ põlvkonnaskeemi" };
  if (!cpus.length) return { generation: null, reason: "protsessorid puuduvad" };

  const generations = new Set<number>();
  for (const cpu of cpus) {
    const eras = cpuEras(cpu);
    const fromIntel = eras.intel.filter((era) => era >= 10 && era <= 14).map((era) => era - 9);
    const fromAmd = AMD_LINES.test(line)
      ? eras.ryzen.filter((era) => era >= 4 && era <= 8).map((era) => era - 3)
      : AMD_L_LINES.test(line)
        ? eras.ryzen.filter((era) => AMD_L_GENERATION[era]).map((era) => AMD_L_GENERATION[era])
        : [];
    const options = [...fromIntel, ...fromAmd];
    // Iga pakkumise CPU peab andma täpselt ühe põlvkonna (tundmatu / AMD L-seerias → ei tuletata)
    if (options.length !== 1) return { generation: null, reason: `protsessorist "${cpu}" põlvkonda üheselt ei tuleta` };
    generations.add(options[0]);
  }
  if (generations.size !== 1) return { generation: null, reason: `pakkumised viitavad mitmele põlvkonnale (${[...generations].sort().map((g) => `Gen ${g}`).join(", ")})` };
  const [generation] = generations;
  return { generation, reason: `Gen ${generation} protsessorite järgi (${line.toUpperCase()})` };
}
