/**
 * Kas tarnija "sülearvuti" on tegelikult tahvelarvuti või eemaldatava ekraaniga 2-in-1 (detachable)?
 * Kasutaja otsus 2026-10-12 (Tech): tahvlid ja detachable'id ei lähe sülearvutite kataloogi. Sama reegel kehtib
 * kõigile tarnijatele (Tech, Foxway). 360° pööratava ekraaniga 2-in-1 (x360, Yoga, Flip) on sülearvuti.
 */

const NOT_LAPTOP_PATTERNS: RegExp[] = [
  /\btablet\b/i,
  /\btab\s+[a-z]?\d/i,
  /\bzenpad\b/i,
  /\btoughpad\b/i,
  /\belitepad\b/i,
  /\bFZ-[A-Z]\d/i,
  /\belite\s*x2\b/i,
  /\bpro\s*x2\b/i,
  /\bsurface\s+(go|pro|book)\b/i,
  /\btoughbook\s+cf-?(20|33)\b/i,
  /\bmiix\b/i,
  /\bideapad\s+duet\b/i,
  /\bdetachable\b/i,
  /\blatitude\s+7(200|210|320)\s+2-in-1\b/i,
  /^F110\b/i,
];

/** Väiksem ekraan → ei ole sülearvuti (nt 7" tahvlid) */
export const MIN_LAPTOP_SCREEN_IN = 10;

/** Tahvelarvuti või eemaldatava ekraaniga 2-in-1? */
export function isNotLaptop(model: string, screenSizeIn: number | null): boolean {
  if (screenSizeIn !== null && screenSizeIn < MIN_LAPTOP_SCREEN_IN) return true;
  return NOT_LAPTOP_PATTERNS.some((pattern) => pattern.test(model));
}
