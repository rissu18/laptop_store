"use client";

import { ChevronLeft, ChevronRight, Expand, ZoomIn, ZoomOut } from "lucide-react";
import { useRef, useState } from "react";
import { ILLUSTRATIVE_IMAGES_NOTICE, isIllustrative, type ProductImageView } from "@/domain/images/product-image";
import { Dialog } from "@/components/ui/dialog";
import { cx } from "@/components/ui/class-names";
import { LaptopIllustration, type IllustrationView } from "./laptop-illustration";
import { StoredImage } from "./stored-image";

/**
 * Tootegalerii:
 * - suur pilt; mobiilis pühitav (scroll-snap), desktopil nooled
 * - pisipildid all; klikk vahetab suurt pilti
 * - täisekraan + suum
 * - esimene pilt on põhipilt (isMain), järgmised Icecati galerii järjekorras
 * Kui pilte pole, kuvatakse kolm illustratsiooni.
 */

type Slide = { kind: "image"; image: ProductImageView } | { kind: "illustration"; view: IllustrationView; label: string };

const MAX_THUMBNAILS = 6;

const ILLUSTRATIONS: Slide[] = [
  { kind: "illustration", view: "front", label: "Eestvaade (illustratsioon)" },
  { kind: "illustration", view: "closed", label: "Kaas (illustratsioon)" },
  { kind: "illustration", view: "side", label: "Küljevaade (illustratsioon)" },
];

function SlideView({ slide, screenSizeIn, sizes, priority, padded = true }: { slide: Slide; screenSizeIn: number; sizes: string; priority?: boolean; padded?: boolean }) {
  if (slide.kind === "image") {
    return <StoredImage image={slide.image} sizes={sizes} priority={priority} screenSizeIn={screenSizeIn} className={padded ? "p-4" : undefined} />;
  }
  return <LaptopIllustration view={slide.view} screenSizeIn={screenSizeIn} className="absolute inset-0 m-auto h-[78%] w-[78%]" />;
}

export function ProductGallery({ images, title, screenSizeIn }: { images: ProductImageView[]; title: string; screenSizeIn: number }) {
  const slides: Slide[] = images.length > 0 ? images.map((image) => ({ kind: "image", image })) : ILLUSTRATIONS;
  const [index, setIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const current = slides[index] ?? slides[0];
  const label = (slide: Slide, i: number) => (slide.kind === "image" ? slide.image.alt : `${title} – ${slide.label}`) + ` (${i + 1}/${slides.length})`;

  function goTo(next: number) {
    const target = (next + slides.length) % slides.length;
    const track = trackRef.current;
    if (track) track.scrollTo({ left: target * track.clientWidth, behavior: "smooth" });
    setIndex(target);
  }

  return (
    <div>
      <div className="group relative overflow-hidden rounded-lg border border-border bg-white">
        <div
          ref={trackRef}
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={(event) => {
            const track = event.currentTarget;
            const next = Math.round(track.scrollLeft / track.clientWidth);
            if (next !== index) setIndex(next);
          }}
          aria-roledescription="karussell"
          aria-label={`${title} pildid`}
        >
          {slides.map((slide, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setFullscreen(true)}
              className="relative aspect-[4/3] w-full shrink-0 cursor-zoom-in snap-center snap-always"
              aria-label={`Ava täisekraanil: ${label(slide, i)}`}
              tabIndex={i === index ? 0 : -1}
            >
              <SlideView slide={slide} screenSizeIn={screenSizeIn} sizes="(min-width: 1360px) 690px, (min-width: 1024px) 55vw, 100vw" priority={i === 0} />
            </button>
          ))}
        </div>

        <span className="pointer-events-none absolute right-3 top-3 flex items-center gap-1 rounded-md bg-surface/90 px-2 py-1 text-xs font-medium shadow-sm" aria-hidden>
          <Expand className="size-3.5" />
          {index + 1} / {slides.length}
        </span>

        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => goTo(index - 1)}
              className="absolute left-3 top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 shadow-md transition-opacity hover:bg-surface md:flex md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
              aria-label="Eelmine pilt"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => goTo(index + 1)}
              className="absolute right-3 top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 shadow-md transition-opacity hover:bg-surface md:flex md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
              aria-label="Järgmine pilt"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
            {/* Mobiilis punktid (kuni 8 pildi korral; rohkemate korral piisab loendurist) */}
            <div className={cx("absolute inset-x-0 bottom-3 justify-center gap-1.5 md:hidden", slides.length <= 8 ? "flex" : "hidden")} aria-hidden>
              {slides.map((_, i) => (
                <span key={i} className={cx("size-1.5 rounded-full", i === index ? "bg-text" : "bg-border-strong")} />
              ))}
            </div>
          </>
        )}
      </div>

      {images.length > 0 ? (
        images.some(isIllustrative) && <p className="mt-2 text-xs text-muted">{ILLUSTRATIVE_IMAGES_NOTICE}</p>
      ) : (
        <p className="mt-2 text-xs text-muted">Tootefotod lisatakse. Praegu on kuvatud illustratsioon.</p>
      )}

      {slides.length > 1 && (
        <ul className="mt-3 hidden gap-2 sm:flex" aria-label="Pisipildid">
          {/* Lehte ei koormata: näidatakse kuni 6 pisipilti, ülejäänud on täisekraani galeriis */}
          {slides.slice(0, MAX_THUMBNAILS).map((slide, i) => {
            const isMore = i === MAX_THUMBNAILS - 1 && slides.length > MAX_THUMBNAILS;
            return (
              <li key={i} className="shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (!isMore) return goTo(i);
                    setIndex(i);
                    setFullscreen(true);
                  }}
                  aria-label={isMore ? `Näita kõiki ${slides.length} pilti` : label(slide, i)}
                  aria-current={!isMore && i === index}
                  className={cx(
                    "relative block aspect-[4/3] w-20 overflow-hidden rounded-md border-2 bg-white lg:w-24",
                    i === index ? "border-primary" : "border-border hover:border-border-strong",
                  )}
                >
                  <SlideView slide={slide} screenSizeIn={screenSizeIn} sizes="96px" padded={false} />
                  {isMore && (
                    <span className="absolute inset-0 flex items-center justify-center bg-text/60 text-sm font-semibold text-white">
                      +{slides.length - MAX_THUMBNAILS + 1}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={fullscreen}
        onClose={() => {
          setFullscreen(false);
          setZoom(null);
          goTo(index); // suur galerii jääb samale pildile, mida täisekraanil vaadati
        }}
        title={title}
        variant="fullscreen"
      >
        <div className="flex h-full flex-col bg-white">
          <div
            className={cx("relative flex-1 overflow-hidden", zoom ? "cursor-zoom-out" : "cursor-zoom-in")}
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
            {slides.length > 1 && !zoom && (
              <>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIndex((index - 1 + slides.length) % slides.length);
                  }}
                  className="absolute left-4 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-surface shadow-md"
                  aria-label="Eelmine pilt"
                >
                  <ChevronLeft className="size-6" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIndex((index + 1) % slides.length);
                  }}
                  className="absolute right-4 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-surface shadow-md"
                  aria-label="Järgmine pilt"
                >
                  <ChevronRight className="size-6" aria-hidden />
                </button>
              </>
            )}
          </div>
          {slides.length > 1 && (
            <ul className="flex justify-center gap-2 overflow-x-auto border-t border-border p-3">
              {slides.map((slide, i) => (
                <li key={i} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setIndex(i);
                      setZoom(null);
                    }}
                    aria-label={label(slide, i)}
                    aria-current={i === index}
                    className={cx("relative block aspect-[4/3] w-16 overflow-hidden rounded-md border-2 bg-white", i === index ? "border-primary" : "border-border")}
                  >
                    <SlideView slide={slide} screenSizeIn={screenSizeIn} sizes="64px" padded={false} />
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
