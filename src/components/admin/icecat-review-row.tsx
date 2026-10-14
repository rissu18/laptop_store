"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { IMAGE_STATES } from "@/domain/admin/image-state";
import type { ActionResult } from "@/server/admin/action-result";
import {
  clearManualMatchAction,
  confirmIcecatMatchAction,
  previewIcecatMatchAction,
  refreshIcecatImagesAction,
  rejectIcecatCandidateAction,
  restoreIcecatCandidateAction,
  type IcecatPreviewResult,
} from "@/server/admin/images/actions";
import type { ReviewQueueRow } from "@/server/admin/images/review-queue";
import { inputClass } from "./entity-form";
import { useToast } from "./toast";
import { Badge } from "./ui";

type Preview = Extract<IcecatPreviewResult, { ok: true }>;

/** Icecati kandidaadi pisipildid (kaug-URL — ainult admini eelvaade, pood Icecatist ei laadi). */
function Thumbnails({ preview, error, loading }: { preview: Preview | null; error: string | null; loading: boolean }) {
  if (loading) return <p className="text-xs text-muted">Laadin Icecati pilte…</p>;
  if (error) return <p className="text-xs text-danger">{error}</p>;
  if (!preview) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <ul className="flex flex-wrap gap-1.5">
        {preview.thumbnails.map((url) => (
          <li key={url} className="size-20 overflow-hidden rounded border border-border bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element -- admini eelvaade otse Icecatist, Next pildioptimeerijat ei kasutata */}
            <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-contain" />
          </li>
        ))}
        {preview.thumbnails.length === 0 && <li className="text-xs text-muted">Icecatil pole sellele tootele kasutatavaid pilte.</li>}
      </ul>
      <p className="text-xs text-muted">
        {preview.imageCount} pilti Icecatis · {preview.titleMatches ? "pealkiri vastab mudelile" : <span className="font-medium text-warning">pealkiri EI vasta mudelinimele — kontrolli</span>}
        {preview.rejected && <span className="font-medium text-danger"> · see ID on tagasi lükatud</span>}
      </p>
    </div>
  );
}

export function IcecatReviewRow({ row, downloadEnabled }: { row: ReviewQueueRow; downloadEnabled: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const hasCandidate = row.state === "REVIEW" || row.state === "MATCHED_NO_IMAGES";
  const candidateId = hasCandidate ? (row.icecat?.icecatId ?? null) : null;
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(candidateId));
  const [manualId, setManualId] = useState("");
  const [manualPreview, setManualPreview] = useState<Preview | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);

  useEffect(() => {
    if (!candidateId) return;
    let cancelled = false;
    previewIcecatMatchAction(row.modelId, candidateId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.ok) setPreview(result);
      else setPreviewError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [row.modelId, candidateId]);

  const run = (task: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const result = await task();
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else toast.error(result.error);
    });

  const state = IMAGE_STATES[row.state];
  return (
    <li className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/admin/images/${row.modelId}`} className="font-semibold text-primary hover:underline">
            {row.title}
          </Link>
          <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
            {row.sellable ? <Badge tone="primary">Müügis · {row.sellableListings} konf.</Badge> : <Badge>Ei müüda</Badge>}
            <Badge tone={row.galleryCount ? "neutral" : "warning"}>Galeriis {row.galleryCount ?? 0} pilti</Badge>
            <Badge tone={state.tone}>{state.label}</Badge>
          </div>
        </div>
        <Link href={`/admin/products/models/${row.modelId}`} className="text-xs text-muted hover:underline">
          Mudeli andmed →
        </Link>
      </div>

      {!hasCandidate && (row.hint || row.icecat?.reason) && (
        <p className="mt-2 text-xs text-muted">
          {[row.hint && `Rikastus: ${row.hint}`, row.icecat?.reason && `Icecat: ${row.icecat.reason}`].filter(Boolean).join(" · ")} — sisesta Icecat ID käsitsi.
        </p>
      )}

      {row.icecat && hasCandidate && (
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="text-sm">
            <p>
              <span className="text-muted">Kandidaat:</span> <strong>{row.icecat.icecatTitle ?? preview?.title ?? "—"}</strong>{" "}
              <span className="font-mono text-xs text-muted">Icecat {row.icecat.icecatId ?? "—"}</span>
            </p>
            <p className="text-xs text-muted">
              {[row.icecat.matchType && `vaste: ${row.icecat.matchType}`, row.icecat.confidence !== null && `kindlus ${Math.round(row.icecat.confidence * 100)}%`, row.icecat.matchedBy, row.icecat.reason && `põhjus: ${row.icecat.reason}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="mt-2">
              <Thumbnails preview={preview} error={previewError} loading={loading} />
            </div>
          </div>
          <div className="flex flex-wrap items-start gap-2 lg:flex-col">
            {row.state === "REVIEW" && candidateId && (
              <>
                <Button size="sm" disabled={pending || !preview} onClick={() => run(() => confirmIcecatMatchAction(row.modelId, candidateId, preview?.title ?? row.icecat?.icecatTitle ?? ""))}>
                  Kinnita
                </Button>
                <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => rejectIcecatCandidateAction(row.modelId, candidateId))}>
                  Lükka tagasi
                </Button>
              </>
            )}
            {row.state === "MATCHED_NO_IMAGES" && (
              <>
                <Button
                  size="sm"
                  disabled={pending || !downloadEnabled}
                  title={downloadEnabled ? undefined : "Töötab ainult lokaalselt — püsiv pildisalvestus puudub"}
                  onClick={() => run(() => refreshIcecatImagesAction(row.modelId))}
                >
                  Laadi pildid alla
                </Button>
                {row.icecat.matchType === "MANUAL" ? (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => clearManualMatchAction(row.modelId))}>
                    Eemalda vaste
                  </Button>
                ) : (
                  candidateId && (
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => rejectIcecatCandidateAction(row.modelId, candidateId))}>
                      Eemalda vaste (lükka tagasi)
                    </Button>
                  )
                )}
                {!downloadEnabled && <p className="max-w-48 text-xs text-muted">Pildid pole alla laaditud: püsiv pildisalvestus puudub, allalaadimine töötab ainult lokaalselt.</p>}
              </>
            )}
          </div>
        </div>
      )}

      {row.rejectedIds.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Tagasi lükatud:</span>
          {row.rejectedIds.map((id) => (
            <span key={id} className="inline-flex items-center gap-1.5 rounded border border-border px-2 py-0.5">
              <span className="font-mono text-xs">{id}</span>
              <button type="button" disabled={pending} className="text-xs text-primary hover:underline disabled:opacity-50" onClick={() => run(() => restoreIcecatCandidateAction(row.modelId, id))}>
                Taasta kandidaat
              </button>
            </span>
          ))}
        </div>
      )}

      <form
        className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!manualId) return;
          setManualError(null);
          startTransition(async () => {
            const result = await previewIcecatMatchAction(row.modelId, manualId);
            if (result.ok) setManualPreview(result);
            else setManualError(result.error);
          });
        }}
      >
        <label className="flex flex-col gap-1 text-xs font-medium">
          Sisesta Icecat ID
          <input value={manualId} onChange={(e) => setManualId(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={12} className={`${inputClass} w-40`} placeholder="nt 91234567" />
        </label>
        <Button type="submit" size="sm" variant="outline" disabled={pending || !manualId}>
          Eelvaade
        </Button>
      </form>
      {(manualPreview || manualError) && (
        <div className="mt-2 rounded-md border border-border p-3 text-sm">
          {manualPreview && (
            <p className="mb-2">
              <strong>{manualPreview.title}</strong> <span className="font-mono text-xs text-muted">Icecat {manualPreview.icecatId}</span>
            </p>
          )}
          <Thumbnails preview={manualPreview} error={manualError} loading={false} />
          {manualPreview && (
            <div className="mt-2 flex gap-2">
              <Button size="sm" disabled={pending} onClick={() => run(() => confirmIcecatMatchAction(row.modelId, manualPreview.icecatId, manualPreview.title))}>
                Kinnita see vaste
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setManualPreview(null)}>
                Loobu
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
