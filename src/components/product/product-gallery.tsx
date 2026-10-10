"use client";

import { Expand, ZoomIn, ZoomOut } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import type { ProductImage } from "@/domain/catalog/types";
import { Dialog } from "@/components/ui/dialog";
import { cx } from "@/components/ui/class-names";
import { LaptopIllustration, type IllustrationView } from "./laptop-illustration";

/**
 * Tootegalerii: suur pilt, pisipildid, täisekraan ja suumimine.
 * Kui päris fotosid pole, näidatakse kolme vaate illustratsiooni.
 */

type Slide = { kind: "image"; image: ProductImage } | { kind: "illustration"; view: IllustrationView; label: string };

function SlideView({ slide, screenSizeIn, sizes, priority, className }: { slide: Slide; screenSizeIn: number; sizes: string; priority?: boolean; className?: string }) {
  if (slide.kind === "image") {
    return <Image src={slide.image.url} alt={slide.image.alt} fill sizes={sizes} priority={priority} className={cx("object-contain", className)} />;
  }
  return <LaptopIllustration view={slide.view} screenSizeIn={screenSizeIn} className={cx("absolute inset-0 m-auto h-[78%] w-[78%]", className)} />;
}

export function ProductGallery({ images, title, screenSizeIn, illustrative }: { images: ProductImage[]; title: string; screenSizeIn: number; illustrative: boolean }) {
  const slides: Slide[] =
    images.length > 0
      ? images.map((image) => ({ kind: "image", image }))
      : [
          { kind: "illustration", view: "front", label: "Eestvaade" },
          { kind: "illustration", view: "closed", label: "Kaas" },
          { kind: "illustration", view: "side", label: "Küljevaade" },
        ];
  const [index, setIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const current = slides[index];

  return (
    <div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-border bg-surface-alt">
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          className="absolute inset-0 cursor-zoom-in"
          aria-label={`Ava pilt täisekraanil: ${title}`}
        >
          <SlideView slide={current} screenSizeIn={screenSizeIn} sizes="(min-width: 1024px) 55vw, 100vw" priority />
        </button>
        <span className="pointer-events-none absolute right-3 top-3 flex items-center gap-1 rounded-md bg-surface/90 px-2 py-1 text-xs font-medium shadow-sm">
          <Expand className="size-3.5" aria-hidden />
          {index + 1} / {slides.length}
        </span>
      </div>

      {illustrative && (
        <p className="mt-2 text-xs text-muted">
          {images.length > 0
            ? "Pildid on illustratiivsed. Konkreetse seadme välimus võib seisukorra klassi piires erineda."
            : "Tootefotod lisatakse. Praegu on kuvatud illustratsioon."}
        </p>
      )}

      {slides.length > 1 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto" aria-label="Pildid">
          {slides.map((slide, i) => (
            <li key={i} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={slide.kind === "image" ? slide.image.alt : slide.label}
                aria-current={i === index}
                className={cx(
                  "relative block aspect-[4/3] w-20 overflow-hidden rounded-md border-2 bg-surface-alt sm:w-24",
                  i === index ? "border-primary" : "border-transparent hover:border-border-strong",
                )}
              >
                <SlideView slide={slide} screenSizeIn={screenSizeIn} sizes="96px" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={fullscreen}
        onClose={() => {
          setFullscreen(false);
          setZoom(null);
        }}
        title={title}
        variant="fullscreen"
      >
        <div className="flex h-full flex-col">
          <div
            className={cx("relative flex-1 overflow-hidden bg-surface", zoom ? "cursor-zoom-out" : "cursor-zoom-in")}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setZoom(zoom ? null : { x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 });
            }}
          >
            <div
              className="absolute inset-0 transition-transform duration-200"
              style={zoom ? { transform: "scale(2.2)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
            >
              <SlideView slide={current} screenSizeIn={screenSizeIn} sizes="100vw" />
            </div>
            <span className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-text/80 px-3 py-1.5 text-xs text-white">
              {zoom ? <ZoomOut className="size-3.5" aria-hidden /> : <ZoomIn className="size-3.5" aria-hidden />}
              {zoom ? "Klõpsa vähendamiseks" : "Klõpsa suurendamiseks"}
            </span>
          </div>
          {slides.length > 1 && (
            <ul className="flex justify-center gap-2 p-3">
              {slides.map((slide, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => {
                      setIndex(i);
                      setZoom(null);
                    }}
                    aria-label={slide.kind === "image" ? slide.image.alt : slide.label}
                    aria-current={i === index}
                    className={cx("relative block aspect-[4/3] w-16 overflow-hidden rounded-md border-2 bg-surface", i === index ? "border-primary" : "border-transparent")}
                  >
                    <SlideView slide={slide} screenSizeIn={screenSizeIn} sizes="64px" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>
    </div>
  );
}
