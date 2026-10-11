/**
 * Tootekaardi pildisirvija loogika (ProductCardImages). Eraldi .ts failis, et seda saaks testida.
 * Muster on sama mis tootelehe galeriil: mobiilis natiivne pühkimine (scroll-snap), desktopil nooled,
 * galerii jätkub ringiga.
 */

/** Navigeerimist (nooled, punktid, pühkimine) on vaja ainult mitme pildi korral */
export function hasImageNavigation(count: number): boolean {
  return count > 1;
}

/** Ringiga: viimase järel esimene, esimese ees viimane */
export function wrapIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

/** Pühkimise (scroll-snap) järel nähtav pilt kerimise asukohast */
export function indexFromScroll(scrollLeft: number, slideWidth: number, count: number): number {
  if (slideWidth <= 0 || count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollLeft / slideWidth)));
}

/**
 * Laetakse ainult nähtav pilt ja selle naabrid (ringiga) — kaardil ei laeta kõiki pilte korraga.
 * Juba nähtud pildid jäävad laetuks.
 */
export function shouldLoadSlide(slide: number, current: number, count: number, seen: ReadonlySet<number>): boolean {
  if (seen.has(slide)) return true;
  return slide === current || slide === wrapIndex(current + 1, count) || slide === wrapIndex(current - 1, count);
}

/** Punktid ainult siis, kui neid on vähe (muidu mahuvad halvasti kaardile) */
export const MAX_CARD_DOTS = 8;

/**
 * Noole klõps vahetab pilti ega ava tootelehte: kaart on venitatud lingiga klikitav, seega
 * peatatakse nii vaikekäitumine kui ka sündmuse levik.
 */
export function stopCardNavigation(event: { preventDefault: () => void; stopPropagation: () => void }): void {
  event.preventDefault();
  event.stopPropagation();
}
