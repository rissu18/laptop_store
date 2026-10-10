"use client";

import { RefreshCw } from "lucide-react";
import { useClientNow } from "./product-badges";

const rtf = new Intl.RelativeTimeFormat("et", { numeric: "auto" });

/**
 * "Laoseis uuendatud 12 min tagasi" — AINULT päris `lastSyncedAt` väärtusest.
 * Kui sync pole töötanud (null), ei näidata midagi. Aega ei genereerita kunagi.
 */
export function StockFreshness({ lastSyncedAt }: { lastSyncedAt: string | null }) {
  const now = useClientNow();
  if (!lastSyncedAt || now === null) return null;

  const minutes = Math.round((now - new Date(lastSyncedAt).getTime()) / 60_000);
  if (minutes < 0) return null;
  const label = minutes < 60 ? rtf.format(-minutes, "minute") : rtf.format(-Math.round(minutes / 60), "hour");

  return (
    <p className="flex items-center gap-1.5 text-xs text-muted">
      <RefreshCw className="size-3" aria-hidden />
      Laoseis uuendatud {label}
    </p>
  );
}
