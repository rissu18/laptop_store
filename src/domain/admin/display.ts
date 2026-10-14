import { displayProductTitle } from "@/domain/catalog/display-name";
import { SUPPLIER_FILTER_LABELS } from "@/domain/catalog/facets";
import { productTitle } from "@/domain/catalog/title";
import { BRAND_CODES, type BrandCode } from "@/domain/catalog/types";

/**
 * Admini kuvamise abifunktsioonid (ainult kuvamine — andmebaasi väärtusi ei muudeta).
 */

/** Tarnija kood → nimi (sama mis poe filtris "Tarnija"); tundmatu kood toorkujul. */
export function supplierLabel(code: string): string {
  return SUPPLIER_FILTER_LABELS[code.toLowerCase()] ?? (code.toLowerCase() === "mock" ? "Mock (test)" : code);
}

const isBrand = (value: string): value is BrandCode => (BRAND_CODES as readonly string[]).includes(value);

/**
 * Mudeli nimi adminis — sama reegel nagu poe pealkiri (title.ts → productTitle): seeriat ei korrata, kui mudelinimi
 * algab sellega ("Acer" + "Aspire" + "Aspire 3 A314-23P" → "Acer Aspire 3 A314-23P", mitte "Aspire Aspire 3 …").
 */
export function adminModelTitle(model: { manufacturer: string; family: string; model: string }): string {
  if (isBrand(model.manufacturer)) return displayProductTitle(model.manufacturer, model.family, model.model);
  return productTitle(model.manufacturer, model.family, model.model);
}
