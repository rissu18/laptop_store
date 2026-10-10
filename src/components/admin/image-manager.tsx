"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff, Star } from "lucide-react";
import Image from "next/image";
import { useTransition } from "react";
import { cx } from "@/components/ui/class-names";
import type { ActionResult } from "@/server/admin/action-result";
import { moveImageAction, setImageHiddenAction, setMainImageAction } from "@/server/admin/images/actions";
import { useToast } from "./toast";
import { Badge } from "./ui";

export interface ManagedImage {
  id: string;
  thumbnailPath: string;
  mediumPath: string;
  alt: string;
  source: string;
  sourceId: string;
  type: string;
  position: number;
  isMain: boolean;
  isHidden: boolean;
  width: number;
  height: number;
}

/** Mudeli piltide haldus: põhipilt, järjekord, peitmine. Kustutamist pole — peidetud pilt jääb alles. */
export function ImageManager({ images }: { images: ManagedImage[] }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const run = (task: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const result = await task();
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });

  const button = "inline-flex size-9 items-center justify-center rounded-md border border-border bg-surface text-muted hover:border-border-strong hover:text-text disabled:opacity-40";

  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {images.map((image, index) => (
        <li key={image.id} className={cx("flex flex-col overflow-hidden rounded-lg border bg-surface", image.isMain ? "border-primary" : "border-border")}>
          <div className="relative aspect-[4/3] bg-white">
            <Image src={image.mediumPath} alt={image.alt} fill sizes="(min-width: 1024px) 25vw, 50vw" className={cx("object-contain p-2", image.isHidden && "opacity-30")} />
            <div className="absolute top-2 left-2 flex gap-1">
              <Badge tone="neutral">#{index + 1}</Badge>
              {image.isMain && <Badge tone="primary">Põhipilt</Badge>}
              {image.isHidden && <Badge tone="warning">Peidetud</Badge>}
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-2 p-3 text-xs text-muted">
            <p>
              Allikas: <strong className="text-text">{image.source}</strong> · ID {image.sourceId} · {image.width}×{image.height}
            </p>
            <div className="mt-auto flex flex-wrap gap-1.5">
              <button type="button" className={button} disabled={pending || index === 0} onClick={() => run(() => moveImageAction(image.id, "up"))} aria-label="Liiguta ettepoole" title="Liiguta ettepoole">
                <ArrowUp className="size-4" aria-hidden />
              </button>
              <button type="button" className={button} disabled={pending || index === images.length - 1} onClick={() => run(() => moveImageAction(image.id, "down"))} aria-label="Liiguta tahapoole" title="Liiguta tahapoole">
                <ArrowDown className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                className={cx(button, "w-auto gap-1 px-2")}
                disabled={pending || image.isMain || image.isHidden}
                onClick={() => run(() => setMainImageAction(image.id))}
              >
                <Star className="size-4" aria-hidden /> Põhipildiks
              </button>
              <button type="button" className={cx(button, "w-auto gap-1 px-2")} disabled={pending} onClick={() => run(() => setImageHiddenAction(image.id, !image.isHidden))}>
                {image.isHidden ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
                {image.isHidden ? "Näita" : "Peida"}
              </button>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
