/**
 * Andmebaasi ühendusaadress keskkonnamuutujatest.
 *
 * Eelistame standardnime DATABASE_URL (töötab igal hostingul / VPS-il).
 * Verceli Neon-integratsioon lõi selles projektis muutujad eesliitega "database_"
 * (database_DATABASE_URL jne) — need on varuvariant, et Verceli seadeid ei peaks muutma.
 *
 * - pooled: rakenduse päringud (Neon connection pooler)
 * - direct: migratsioonid ja hooldus (otseühendus, ilma pooler'ita)
 *
 * Aadressi ei logita ega kuvata kunagi.
 */
export function resolveDatabaseUrl(kind: "pooled" | "direct" = "pooled", env: NodeJS.ProcessEnv = process.env): string | null {
  const pooled = env.DATABASE_URL || env.database_DATABASE_URL || null;
  if (kind === "pooled") return pooled;
  return env.DATABASE_URL_UNPOOLED || env.database_DATABASE_URL_UNPOOLED || pooled;
}

/** Eemaldab veateatest võimalikud ühendusaadressid (et need logidesse ei satuks). */
export function redactConnectionStrings(text: string): string {
  return text.replace(/postgres(ql)?:\/\/[^\s"']+/gi, "[DATABASE_URL]");
}

/**
 * pg (node-postgres) käsitleb sslmode=require samana kui verify-full ja hoiatab, et tulevikus see muutub.
 * Määrame turvalise režiimi selgelt, et käitumine ei muutuks vaikselt nõrgemaks.
 */
export function withSecureSsl(url: string): string {
  return url.replace(/([?&])sslmode=(require|prefer|verify-ca)\b/, "$1sslmode=verify-full");
}
