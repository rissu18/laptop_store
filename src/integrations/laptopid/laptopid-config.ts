/**
 * Laptopid.ee API seadistus (ainult serveris kasutatav; puhas funktsioon, testitav).
 *
 *   LAPTOPID_API_BASE_URL  Config, nt https://laptopid.ee/api/sulearvutid/  (products.php ja images.php samas kataloogis)
 *   LAPTOPID_API_KEY       Secret, saadetakse AINULT päises X-API-Key
 *
 * Otspunktid ehitatakse URL API-ga (mitte stringe liites). Puuduv/vigane seadistus → kontrollitud viga;
 * hardcoded tagavara-URL-i EI ole. NEXT_PUBLIC_ muutujaid ei kasutata (võti ei tohi brauserisse jõuda).
 */

export interface LaptopidEndpoints {
  productsUrl: string;
  imagesUrl: string;
}

export interface LaptopidConfig {
  apiKey: string;
  endpoints: LaptopidEndpoints;
}

export class LaptopidConfigError extends Error {
  readonly code = "NOT_CONFIGURED" as const;
  constructor(message: string) {
    super(message);
    this.name = "LaptopidConfigError";
  }
}

/** "https://laptopid.ee/api/sulearvutid" või ".../" → products.php ja images.php samas kataloogis. */
export function laptopidEndpoints(baseUrl: string): LaptopidEndpoints {
  let base: URL;
  try {
    base = new URL(baseUrl.trim());
  } catch {
    throw new LaptopidConfigError("LAPTOPID_API_BASE_URL ei ole korrektne URL");
  }
  if (base.protocol !== "https:") throw new LaptopidConfigError("LAPTOPID_API_BASE_URL peab olema https");
  if (base.search || base.hash || base.username || base.password) throw new LaptopidConfigError("LAPTOPID_API_BASE_URL ei tohi sisaldada päringut, ankrut ega kasutajat");
  // Kataloogi URL peab lõppema "/"-ga, muidu asendaks new URL("products.php", base) viimase osa
  if (!base.pathname.endsWith("/")) base.pathname = `${base.pathname}/`;
  return {
    productsUrl: new URL("products.php", base).toString(),
    imagesUrl: new URL("images.php", base).toString(),
  };
}

export function readLaptopidConfig(env: Record<string, string | undefined> = process.env): LaptopidConfig {
  const apiKey = env.LAPTOPID_API_KEY?.trim();
  const baseUrl = env.LAPTOPID_API_BASE_URL?.trim();
  if (!baseUrl) throw new LaptopidConfigError("LAPTOPID_API_BASE_URL puudub");
  if (!apiKey) throw new LaptopidConfigError("LAPTOPID_API_KEY puudub");
  return { apiKey, endpoints: laptopidEndpoints(baseUrl) };
}

export function isLaptopidConfigured(env: Record<string, string | undefined> = process.env): boolean {
  try {
    readLaptopidConfig(env);
    return true;
  } catch {
    return false;
  }
}
