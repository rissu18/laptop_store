/**
 * Kliendipoolne terminoloogia (üks reegel kogu poes):
 *  - "konfiguratsioon" = üks müügis pakkumine (kaart kataloogis: CPU, RAM, SSD, seisukord, hind). Kõik loendurid
 *    (kataloogi tulemused, tootja/seeria kaardid, avalehe arvud, salong) loevad konfiguratsioone samast poe skoobist.
 *  - "mudel" = tooteleht (nt ThinkPad T14 G3), mis koondab sama mudeli konfiguratsioonid.
 *  - Füüsilisi seadmeid ("tk") näidatakse ainult siis, kui tarnija annab täpse koguse ("Partnerlaos 4 tk");
 *    Laptopid.ee kogus on teadmata, seega seadmete koguarvu ei väideta.
 */
export function configurationCountLabel(count: number): string {
  return `${count} ${count === 1 ? "konfiguratsioon" : "konfiguratsiooni"}`;
}
