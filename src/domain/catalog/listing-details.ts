/**
 * Konkreetse pakkumise (SupplierListing) struktureeritud lisaandmed, millele poes filtrit pole.
 * Salvestatakse supplier_listings.details (JSONB). Iga väli on valikuline: puuduv = tarnija ei andnud.
 * Väärtusi EI mõelda välja (nt Wi-Fi/Bluetooth puudub, kui tarnija seda ei anna).
 *
 * Need on konfiguratsiooni tasemel, sest sama mudel võib eri konfiguratsioonides erineda
 * (nt privaatsusekraan, 4G, pordid). Mudeli üldised väärtused on product_models tabelis.
 */
export interface ListingDetails {
  /** Andmete allikas, nt "LAPTOPID" (provenance) */
  source?: string;
  /** Tarnija algne seisukorra klass ("Demo", "Outlet", "A+" …) — meie klass on supplier_listings.grade */
  sourceGrade?: string | null;
  usbA?: number | null;
  usbC?: number | null;
  /** "3" | "4" | "3+4" */
  thunderbolt?: string | null;
  displayPort?: boolean | null;
  vga?: boolean | null;
  dvi?: boolean | null;
  webcam?: boolean | null;
  pointingStick?: boolean | null;
  dockingSupport?: boolean | null;
  privacyScreen?: boolean | null;
  refreshRateHz?: number | null;
  /** Protsessori maksimaalne sagedus tarnija tekstist ("4400MHz") */
  cpuMaxMhz?: number | null;
  /** Tarnija klaviatuuri tähis algkujul, kui see ei vasta meie paigutuste nimekirjale (nt "ENG") */
  keyboardRaw?: string | null;
  /** Tarnija aku tööaja väli (tundides). Tähendus (tootja väide vs mõõdetud) pole kinnitatud — poes ei kuvata. */
  batteryHours?: number | null;
  /** Videoväljundid tarnija tekstina */
  videoOutputs?: string | null;
  /** Pordid tarnija vabatekstina — ainult varuvariant, struktureeritud väljad on eelistatud */
  portsText?: string | null;
  /** Puuteplaat / osutusseade tarnija tekstina */
  pointingDevice?: string | null;
  /** Tootja spetsifikatsiooni PDF (https) */
  pdfUrl?: string | null;
  /**
   * Tarnija "uue hinna" kontekst (nt uue seadme hind). EI OLE ostuhind ega meie varasem hind —
   * seetõttu ei kuvata seda läbikriipsutatud "enne" hinnana.
   */
  newPriceCents?: number | null;
  /** Tarnija slug (ainult viide; identiteet on tarnija ID) */
  upstreamSlug?: string | null;
  /**
   * Tarnija hinnakirja hind (Tech: veerg M) — sellest arvutatakse ostuhind (M − 20 €) ja müügihind (M + 60 €).
   * Ainult admin/diagnostika; kliendile ei kuvata.
   */
  sourcePriceCents?: number | null;
  /** Salvestuse tüüp tarnija tekstist ("SSD"), kui see on antud */
  storageType?: string | null;
  /** Lisaketas tarnija tekstist (nt "1TB HDD") — põhiketas on storage_gb */
  secondaryStorage?: string | null;
  /**
   * Kliendile nähtavad seisukorra märkused (eesti keeles), nt Foxway lubatud kosmeetilised/LCD rikked.
   * NOTICE kuvatakse ka tootekaardil ("Seisukorra märkus: …"), INFO ainult tootelehel. Tarnija toortermineid
   * ("Working*", "Scratched on Purpose") kliendile EI kuvata — need on admini toorandmetes.
   */
  conditionNotices?: { severity: "INFO" | "NOTICE"; text: string; short: string }[];
  /** Kliendile: "Laadija kaasas" / "Originaalkarp ja laadija kaasas" (laadija lisame vajadusel ise) */
  chargerLabel?: string | null;
  /** Originaalkarp kaasas */
  originalBox?: boolean | null;
  /** Aku garantii kuudes (meie poliitika, nt Foxway: 6) — eraldi sülearvuti garantiist */
  batteryWarrantyMonths?: number | null;
  /** Resolutsioon tuli sama mudeli teise tarnija andmetest (tarnija andis ainult nt "Retina") */
  resolutionFromModel?: boolean | null;
}
