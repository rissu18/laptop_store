/**
 * Raha arvutatakse alati täisarvuliste sentidena.
 * Ujukomaarvud (0.1 + 0.2 !== 0.3) ei sobi hindade jaoks.
 */
export type Cents = number;

const eurFormatter = new Intl.NumberFormat("et-EE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const eurFormatterPrecise = new Intl.NumberFormat("et-EE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 42900 → "429 €"; kui sente on, näidatakse neid: 42950 → "429,50 €" */
export function formatEur(cents: Cents): string {
  return cents % 100 === 0
    ? eurFormatter.format(cents / 100)
    : eurFormatterPrecise.format(cents / 100);
}

export function eurosToCents(euros: number): Cents {
  return Math.round(euros * 100);
}

/** Protsent baaspunktides: 2400 = 24%. Ümardab lähima sendini. */
export function percentOf(cents: Cents, basisPoints: number): Cents {
  return Math.round((cents * basisPoints) / 10_000);
}

/**
 * Kliendile kuvatav ja küsitav hind on alati TÄISARV eurodes — üks reegel kogu klienditees (kaart, tooteleht,
 * konfiguratsioonid, ostukorv, kassa, tellimus): tavaline ümardamine lähima euroni (x,50 → üles).
 * 75812 → 75800 ("758 €"), 15052 → 15100 ("151 €"). Tarnija täpne hind jääb andmebaasi (backend).
 */
export function roundToEuro(cents: Cents): Cents {
  return Math.round(cents / 100) * 100;
}

/** Ülempiir täiseurodes (soodustuse lagi, marginaalikaitse) — ei ületa kunagi antud summat */
export function floorToEuro(cents: Cents): Cents {
  return Math.floor(cents / 100) * 100;
}
