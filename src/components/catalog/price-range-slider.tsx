"use client";

import { useState } from "react";
import { cx } from "@/components/ui/class-names";

/**
 * Kahe käepidemega hinnaliugur.
 * - Kaks natiivset <input type="range"> elementi üksteise peal: klaviatuur (nooled, Page Up/Down,
 *   Home/End), puude ja ekraanilugeja tugi tulevad brauserist.
 * - Väärtused muutuvad lohistamise ajal kohe, filter rakendub käepideme vabastamisel.
 * - Min/max tulevad aktiivsest kataloogist (filtreeritud toodete hinnad, hinnafilter välja arvatud).
 */

export const PRICE_STEP = 10;

export function roundRange(range: { min: number; max: number }): { min: number; max: number } {
  const min = Math.floor(range.min / PRICE_STEP) * PRICE_STEP;
  const max = Math.ceil(range.max / PRICE_STEP) * PRICE_STEP;
  return { min, max: Math.max(max, min + PRICE_STEP) };
}

/**
 * Kuvatav väärtus: liuguri samm on 10 €, aga piiril näidatakse kataloogi TEGELIKKU min/max hinda (sama mis avalehe
 * "Hinnad alates" ja poe skoop), mitte sammuni ümardatud väärtust (131 €, mitte 130 €).
 */
export function displayRange(lo: number, hi: number, bounds: { min: number; max: number }, raw: { min: number; max: number }): { lo: number; hi: number } {
  return { lo: lo <= bounds.min ? raw.min : lo, hi: hi >= bounds.max ? raw.max : hi };
}

/** Valitud vahemik → filtri väärtused (piir, mis langeb kokku kataloogi piiriga, = filtrit pole). */
export function rangeToFilter(lo: number, hi: number, bounds: { min: number; max: number }): { min: number | null; max: number | null } {
  return { min: lo <= bounds.min ? null : lo, max: hi >= bounds.max ? null : hi };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function PriceRangeSlider({
  bounds: rawBounds,
  value,
  onCommit,
}: {
  bounds: { min: number; max: number };
  value: { min: number | null; max: number | null };
  onCommit: (range: { min: number | null; max: number | null }) => void;
}) {
  const bounds = roundRange(rawBounds);
  const initialLo = clamp(value.min ?? bounds.min, bounds.min, bounds.max);
  const initialHi = clamp(value.max ?? bounds.max, initialLo, bounds.max);
  const [lo, setLo] = useState(initialLo);
  const [hi, setHi] = useState(initialHi);

  const commit = (nextLo = lo, nextHi = hi) => {
    const next = rangeToFilter(nextLo, nextHi, bounds);
    if (next.min !== value.min || next.max !== value.max) onCommit(next);
  };

  const shown = displayRange(lo, hi, bounds, rawBounds);
  const span = bounds.max - bounds.min;
  const left = ((lo - bounds.min) / span) * 100;
  const right = ((hi - bounds.min) / span) * 100;
  const commitEvents = { onPointerUp: () => commit(), onKeyUp: () => commit(), onTouchEnd: () => commit() };

  return (
    <div>
      <p className="tabular text-center text-base font-semibold" aria-live="polite">
        {shown.lo} € – {shown.hi} €
      </p>

      <div className="relative mt-2 h-11">
        {/* Rada ja valitud vahemik */}
        <div className="absolute inset-x-3 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-border" aria-hidden>
          <div className="absolute h-full rounded-full bg-primary" style={{ left: `${left}%`, right: `${100 - right}%` }} />
        </div>
        <input
          type="range"
          className={cx("dual-range", lo > bounds.max - span * 0.1 && "z-10")}
          min={bounds.min}
          max={bounds.max}
          step={PRICE_STEP}
          value={lo}
          aria-label="Minimaalne hind"
          aria-valuetext={`${shown.lo} €`}
          onChange={(event) => setLo(Math.min(Number(event.target.value), hi - PRICE_STEP))}
          {...commitEvents}
        />
        <input
          type="range"
          className="dual-range"
          min={bounds.min}
          max={bounds.max}
          step={PRICE_STEP}
          value={hi}
          aria-label="Maksimaalne hind"
          aria-valuetext={`${shown.hi} €`}
          onChange={(event) => setHi(Math.max(Number(event.target.value), lo + PRICE_STEP))}
          {...commitEvents}
        />
      </div>

      {/* Täpne väärtus: lihtsad väljad ilma +/- nuppudeta, rakenduvad Enteri või fookuse kadumisel */}
      <div className="mt-2 flex items-center gap-2">
        <label className="flex-1 text-xs text-muted">
          <span className="sr-only">Minimaalne hind eurodes</span>
          <input
            key={`lo-${lo}`}
            type="number"
            inputMode="numeric"
            defaultValue={shown.lo}
            min={bounds.min}
            max={bounds.max}
            className="no-spinner h-10 w-full rounded-md border border-border-strong px-2 text-sm text-text"
            onBlur={(event) => {
              const next = clamp(Number(event.target.value) || bounds.min, bounds.min, hi - PRICE_STEP);
              setLo(next);
              commit(next, hi);
            }}
            onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
          />
        </label>
        <span className="text-muted" aria-hidden>
          –
        </span>
        <label className="flex-1 text-xs text-muted">
          <span className="sr-only">Maksimaalne hind eurodes</span>
          <input
            key={`hi-${hi}`}
            type="number"
            inputMode="numeric"
            defaultValue={shown.hi}
            min={bounds.min}
            max={bounds.max}
            className="no-spinner h-10 w-full rounded-md border border-border-strong px-2 text-sm text-text"
            onBlur={(event) => {
              const next = clamp(Number(event.target.value) || bounds.max, lo + PRICE_STEP, bounds.max);
              setHi(next);
              commit(lo, next);
            }}
            onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
          />
        </label>
      </div>
    </div>
  );
}
