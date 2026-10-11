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
}
