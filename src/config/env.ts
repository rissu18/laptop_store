import { z } from "zod";

/**
 * Keskkonnamuutujate valideerimine.
 * Vigase seadistusega rakendus ei käivitu — parem kohe selge viga kui hiljem müstiline bug.
 * Andmebaasi ühendus: src/server/db/database-url.ts. Prototüübirežiim on poe seadetes (admin → Seaded).
 * Saladusi EI commit'ita.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SITE_URL: z.string().url().default("http://localhost:3000"),
});

export const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  SITE_URL: process.env.SITE_URL,
});
