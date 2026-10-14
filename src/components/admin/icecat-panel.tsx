"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/server/admin/action-result";
import {
  clearManualMatchAction,
  confirmIcecatMatchAction,
  previewIcecatMatchAction,
  refreshIcecatImagesAction,
  retryIcecatLookupAction,
  type IcecatPreviewResult,
} from "@/server/admin/images/actions";
import { ConfirmDialog } from "./confirm-dialog";
import { fmtDateTime } from "./format";
import { inputClass } from "./entity-form";
import { useToast } from "./toast";
import { IMAGE_STATES, type ImageState } from "@/domain/admin/image-state";
import { Badge, Card, DefinitionList } from "./ui";

interface IcecatInfo {
  status: string;
  reason: string | null;
  matchType: string | null;
  confidence: number | null;
  icecatId: string | null;
  icecatTitle: string | null;
  matchedBy: string | null;
  imageCount: number;
  error: string | null;
  checkedAt: Date;
}

const REASONS: Record<string, string> = {
  NO_IDENTIFIERS: "Mudelil pole GTIN-i, MPN-i ega Icecat ID-d",
  NOT_IN_ICECAT: "Icecat ei leidnud ühegi identifikaatoriga",
  TITLE_MISMATCH: "Leitud toote nimi ei vasta mudelile",
  LOW_CONFIDENCE: "Ainult nimepõhine (madala kindlusega) vaste",
  ICECAT_UNAVAILABLE: "Icecat ei vastanud",
  DOWNLOAD_FAILED: "Pilte ei õnnestunud alla laadida",
};

/** Icecati vaste info ja toimingud mudeli lehel. Madala kindlusega vaste ei lähe kunagi automaatselt live'i. */
export function IcecatPanel({ modelId, icecat, downloadEnabled, state }: { modelId: string; icecat: IcecatInfo | null; downloadEnabled: boolean; state: ImageState }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [icecatId, setIcecatId] = useState("");
  const [preview, setPreview] = useState<Extract<IcecatPreviewResult, { ok: true }> | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const run = (task: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      const result = await task();
      if (result.ok) {
        toast.success(result.message);
        after?.();
      } else toast.error(result.error);
    });

  const loadPreview = (id: string) =>
    startTransition(async () => {
      const result = await previewIcecatMatchAction(modelId, id);
      if (result.ok) setPreview(result);
      else toast.error(result.error);
    });

  return (
    <Card title="Icecat" actions={<Badge tone={IMAGE_STATES[state].tone}>{IMAGE_STATES[state].label}</Badge>}>
      {icecat ? (
        <DefinitionList
          items={[
            { label: "Põhjus", value: icecat.reason ? (REASONS[icecat.reason] ?? icecat.reason) : null },
            { label: "Icecat ID", value: icecat.icecatId },
            { label: "Icecati nimi", value: icecat.icecatTitle },
            { label: "Vaste tüüp", value: icecat.matchType ? `${icecat.matchType}${icecat.confidence !== null ? ` (${Math.round(icecat.confidence * 100)}%)` : ""}` : null },
            { label: "Leitud", value: icecat.matchedBy },
            { label: "Pilte", value: String(icecat.imageCount) },
            { label: "Kontrollitud", value: fmtDateTime(icecat.checkedAt) },
            ...(icecat.error ? [{ label: "Viga", value: icecat.error }] : []),
          ]}
        />
      ) : (
        <p className="text-sm text-muted">Icecatist pole veel otsitud.</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => retryIcecatLookupAction(modelId))}>
          Otsi uuesti
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !downloadEnabled}
          title={downloadEnabled ? undefined : "Töötab ainult lokaalselt (Vercelis pole püsivat pildisalvestust)"}
          onClick={() => run(() => refreshIcecatImagesAction(modelId))}
        >
          Laadi pildid alla
        </Button>
        {icecat?.status === "NEEDS_REVIEW" && icecat.icecatId && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => loadPreview(icecat.icecatId!)}>
            Vaata kandidaati
          </Button>
        )}
        {icecat?.matchType === "MANUAL" && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmClear(true)}>
            Eemalda käsitsi vaste
          </Button>
        )}
      </div>
      {!downloadEnabled && <p className="mt-2 text-xs text-muted">Piltide allalaadimine on selles keskkonnas välja lülitatud (pole püsivat pildisalvestust).</p>}

      <form
        className="mt-4 flex items-end gap-2 border-t border-border pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (icecatId.trim()) loadPreview(icecatId.trim());
        }}
      >
        <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
          Käsitsi vaste (Icecat ID)
          <input value={icecatId} onChange={(e) => setIcecatId(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={12} className={inputClass} placeholder="nt 91234567" />
        </label>
        <Button type="submit" size="sm" disabled={pending || !icecatId}>
          Eelvaade
        </Button>
      </form>

      <ConfirmDialog
        open={preview !== null}
        title="Kinnita Icecati vaste"
        confirmLabel="Kinnita vaste"
        pending={pending}
        onCancel={() => setPreview(null)}
        onConfirm={() => preview && run(() => confirmIcecatMatchAction(modelId, preview.icecatId, preview.title), () => setPreview(null))}
      >
        <p>
          Icecati toode <strong>{preview?.title}</strong> (ID {preview?.icecatId}){preview?.brand ? `, tootja ${preview.brand}` : ""}.
        </p>
        <p>Pilte Icecatis: {preview?.imageCount}</p>
        {preview && !preview.titleMatches && (
          <p className="rounded-md bg-warning-soft px-3 py-2 text-warning">Hoiatus: Icecati toote nimi ei sisalda selle mudeli nime. Kontrolli, et see on õige toode!</p>
        )}
        <p className="text-muted">Pärast kinnitamist kasutatakse seda vastet selle mudeli piltide jaoks. Muudatus salvestatakse tegevuslogisse.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmClear}
        title="Eemalda käsitsi vaste"
        confirmLabel="Eemalda"
        tone="danger"
        pending={pending}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => run(() => clearManualMatchAction(modelId), () => setConfirmClear(false))}
      >
        <p>Kinnitatud Icecati vaste eemaldatakse ja selle mudeli Icecati pildid peidetakse poest (faile ei kustutata). Seejärel otsi vastet uuesti.</p>
      </ConfirmDialog>
    </Card>
  );
}
