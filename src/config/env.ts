import { z } from "zod";

/**
 * Keskkonnamuutujate valideerimine.
 * Vigase seadistusega rakendus ei käivitu — parem kohe selge viga kui hiljem müstiline bug.
 * Saladused (API võtmed, DB parool) lisatakse siia vastavates etappides; neid EI commit'ita.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SITE_URL: z.string().url().default("http://localhost:3000"),
  /** Prototüübirežiim: näitab testandmete hoiatust ja kinnitamata väiteid. */
  PROTOTYPE_MODE: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
});

export const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  SITE_URL: process.env.SITE_URL,
  PROTOTYPE_MODE: process.env.PROTOTYPE_MODE,
});
