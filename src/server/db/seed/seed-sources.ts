import { readFileSync } from "node:fs";
import path from "node:path";
import { pricingConfig } from "@/config/pricing";
import type { IcecatMatchRecord } from "@/domain/images/icecat-match";
import { MockSupplierAdapter } from "@/integrations/supplier/mock/mock-supplier-adapter";
import { MOCK_FEATURED_SKUS } from "@/integrations/supplier/mock/mock-supplier-data";
import { DEFAULT_DATA_DIR, readImageManifestSync, readMatchesSync } from "@/server/images/image-repository";
import { groupOffersIntoModels } from "@/server/images/product-models";
import type { SeedSources } from "./seed-catalog";

/**
 * Impordi allikad (praegune kataloog enne andmebaasi): mock-tarnija, pildikirjed, Icecati vasted,
 * identifikaatorid ja hinnareeglid. Tagastab ka allikate arvud ("ENNE"), et importi kontrollida.
 */
export async function loadSeedSources(dataDir = DEFAULT_DATA_DIR) {
  const { offers, rejected } = await new MockSupplierAdapter().getProducts();
  const models = groupOffersIntoModels(offers);
  const images = readImageManifestSync(dataDir);
  const matches: IcecatMatchRecord[] = readMatchesSync(dataDir);
  const curated = JSON.parse(readFileSync(path.join(dataDir, "icecat", "model-identifiers.json"), "utf8")).models;
  const modelSlugs = new Set(models.map((m) => m.model.id));

  const sources: SeedSources = {
    offers,
    featuredExternalIds: MOCK_FEATURED_SKUS,
    curatedIdentifiers: curated,
    images,
    icecatMatches: matches,
    pricingBands: pricingConfig.bands,
  };
  const before = {
    models: models.length,
    listings: offers.length,
    images: Object.entries(images)
      .filter(([slug]) => modelSlugs.has(slug))
      .reduce((sum, [, list]) => sum + list.length, 0),
    icecat: matches
      .filter((m) => modelSlugs.has(m.productModelId))
      .reduce<Record<string, number>>((acc, m) => ({ ...acc, [m.status]: (acc[m.status] ?? 0) + 1 }), {}),
  };
  return { sources, before, rejected };
}
