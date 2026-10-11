/**
 * Laoseisu semantika (vt docs/LAPTOPID_SYNC.md).
 *
 * Tarnijad annavad laoseisu kahel viisil:
 *   - täpne kogus (nt tulevane hulgiladu: available=true, quantity=7)
 *   - ainult saadavus (Laptopid.ee: toode on aktiivses nimekirjas → vähemalt 1 tk füüsiliselt laos,
 *     aga täpne kogus on TEADMATA: available=true, quantity=null)
 *
 * "Teadmata kogus" EI tähenda "1 tk" — poes ei kuvata kunagi "Laos 1 tk". Kuna rohkem kui ühe seadme
 * olemasolu pole kinnitatud, lubatakse sellisest pakkumisest automaatselt tellida 1 tk rea kohta.
 */

export interface StockInfo {
  /** Kas pakkumist saab praegu tellida */
  available: boolean;
  /** Täpne kogus; `null` = tarnija ei anna kogust (teadmata) */
  quantity: number | null;
}

/** Ostukorvi ülempiir ühe rea kohta, kui kogus on teada */
export const MAX_ORDER_QUANTITY = 10;

/** Teadmata koguse korral automaatselt lubatud kogus rea kohta */
export const UNKNOWN_QUANTITY_ORDER_LIMIT = 1;

export const UNKNOWN_QUANTITY_LIMIT_MESSAGE =
  "Täpne laokogus ei ole automaatselt teada. Rohkema kui ühe seadme saadavuse kontrollimiseks võta meiega ühendust.";

/**
 * Andmebaasi väärtused → saadavus.
 *   available=false            → ei ole saadaval (puudus tarnija täielikust snapshot'ist)
 *   stock teada                → saadaval, kui stock > 0
 *   stock NULL + available=true → saadaval, kogus teadmata
 *   stock NULL + available NULL → andmed puuduvad → ei müüda
 */
export function resolveStock(input: { stock: number | null; available: boolean | null }): StockInfo {
  if (input.available === false) return { available: false, quantity: input.stock };
  if (input.stock !== null) return { available: input.stock > 0, quantity: input.stock };
  return { available: input.available === true, quantity: null };
}

/** Kui palju ühte rida tohib automaatselt tellida. 0 = ei saa tellida. */
export function orderQuantityLimit(stock: StockInfo): number {
  if (!stock.available) return 0;
  if (stock.quantity === null) return UNKNOWN_QUANTITY_ORDER_LIMIT;
  return Math.max(0, Math.min(stock.quantity, MAX_ORDER_QUANTITY));
}

/**
 * Kassa: kui palju saab tellida ilma laoseisu ületamata. Teada kogus → kogu laoseis (ostukorvi 10 tk piir
 * on eraldi); teadmata kogus → 1.
 */
export function availableForOrder(stock: StockInfo): number {
  if (!stock.available) return 0;
  return stock.quantity ?? UNKNOWN_QUANTITY_ORDER_LIMIT;
}

export function isQuantityUnknown(stock: StockInfo): boolean {
  return stock.available && stock.quantity === null;
}

/** Laoseisu tekst kliendile. Teadmata koguse korral kogust EI väideta. */
export function stockLabel(stock: StockInfo): string {
  if (!stock.available) return "Laost otsas";
  if (stock.quantity === null) return "Kohe saadaval";
  return `Partnerlaos ${stock.quantity} tk`;
}
