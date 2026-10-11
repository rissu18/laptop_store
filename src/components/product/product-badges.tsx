"use client";

import { useSyncExternalStore } from "react";
import { cx } from "@/components/ui/class-names";

/**
 * Tootekaardi märgid (max 2 korraga).
 * "Uus valikus" / "Lisatud täna" sõltub praegusest ajast, seega arvutatakse brauseris —
 * vahemällu salvestatud (cache) HTML ei saa nii kunagi aegunud "täna" silti.
 * Kõik märgid põhinevad päris andmetel: lisamise aeg, laoseis, PÄRIS hinnalangus.
 */

const NEW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

let clientNow: number | null = null;
const getNow = () => (clientNow ??= Date.now());
const subscribe = () => () => {};

export function useClientNow(): number | null {
  return useSyncExternalStore(subscribe, getNow, () => null);
}

interface Badge {
  key: string;
  label: string;
  tone: "deal" | "new" | "neutral";
}

export function ProductBadges({
  firstSeenAt,
  stockQuantity,
  hasPriceDrop,
  className,
}: {
  firstSeenAt: string;
  /** Täpne kogus; null = teadmata (siis "Ainult 1 tk" märki EI näidata) */
  stockQuantity: number | null;
  hasPriceDrop: boolean;
  className?: string;
}) {
  const now = useClientNow();
  const badges: Badge[] = [];

  if (hasPriceDrop) badges.push({ key: "deal", label: "Hind langes", tone: "deal" });

  if (now !== null) {
    const added = new Date(firstSeenAt);
    const age = now - added.getTime();
    if (age >= 0 && new Date(now).toDateString() === added.toDateString()) {
      badges.push({ key: "new", label: "Lisatud täna", tone: "new" });
    } else if (age >= 0 && age < NEW_DAYS * DAY_MS) {
      badges.push({ key: "new", label: "Uus valikus", tone: "new" });
    }
  }

  if (stockQuantity === 1) badges.push({ key: "last", label: "Ainult 1 tk", tone: "neutral" });

  if (badges.length === 0) return null;

  return (
    <ul className={cx("flex flex-wrap gap-1.5", className)} aria-label="Märgid">
      {badges.slice(0, 2).map((badge) => (
        <li
          key={badge.key}
          className={cx(
            "rounded-full px-2 py-0.5 text-xs font-semibold",
            badge.tone === "deal" && "bg-deal text-white",
            badge.tone === "new" && "bg-primary text-on-primary",
            badge.tone === "neutral" && "bg-surface text-text ring-1 ring-border",
          )}
        >
          {badge.label}
        </li>
      ))}
    </ul>
  );
}
