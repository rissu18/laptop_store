import { buildCatalogHref, emptyQuery, type CatalogQuery } from "@/domain/catalog/query";

/**
 * "Leia sobiv" kasutusotstarbed → eeltäidetud filtrid.
 * Need on deterministlikud reeglid, mitte AI soovitused. Phase 8 wizard kasutab sama alust.
 */
export interface UseCase {
  key: string;
  label: string;
  description: string;
  query: Partial<CatalogQuery>;
}

function facets(values: Partial<CatalogQuery["facets"]>): CatalogQuery["facets"] {
  return { ...emptyQuery().facets, ...values };
}

export const USE_CASES: UseCase[] = [
  {
    key: "too",
    label: "Tööle",
    description: "16 GB mälu, hea klaviatuur ja ühendused kontoritööks.",
    query: { facets: facets({ ram: ["16", "32"] }), features: ["backlit"] },
  },
  {
    key: "kool",
    label: "Kooliks",
    description: "Taskukohane ja töökindel õppimiseks ning kodutöödeks.",
    query: { facets: facets({ ram: ["8", "16"] }), maxPrice: 450 },
  },
  {
    key: "kodu",
    label: "Koduseks kasutamiseks",
    description: "Veeb, video ja dokumendid soodsa hinnaga.",
    query: { facets: facets({ screen: ["14", "15", "16"] }), maxPrice: 400 },
  },
  {
    key: "reis",
    label: "Reisile",
    description: "Kerge ja kompaktne, et kaasas kanda.",
    query: { facets: facets({ screen: ["13", "14"] }), features: ["light"] },
  },
  {
    key: "programmeerimine",
    label: "Programmeerimiseks",
    description: "Vähemalt 16 GB mälu ja 512 GB SSD arendustööks.",
    query: { facets: facets({ ram: ["16", "32", "64"], ssd: ["512", "1024", "2048"] }) },
  },
  {
    key: "kujundus",
    label: "Kujundamiseks ja videotööks",
    description: "Eraldi graafikakaart ja 32 GB mälu.",
    query: { facets: facets({ ram: ["32", "64"] }), features: ["dedicated-gpu"] },
  },
];

export function hrefForUseCase(useCase: UseCase): string {
  return buildCatalogHref("/sulearvutid", { ...emptyQuery(), ...useCase.query });
}
