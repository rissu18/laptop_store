/**
 * Käsurea skriptidele: laeb keskkonnamuutujad samamoodi nagu Next.js arendusrežiimis.
 * .env.development.local (Verceli `env pull`, sh andmebaas) ja .env.local (Icecat jm).
 * Juba seatud muutujaid üle ei kirjutata. Väärtusi ei logita kunagi.
 */
import { existsSync } from "node:fs";

for (const file of [".env.development.local", ".env.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
