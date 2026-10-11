"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import type { ProductImageView } from "@/domain/images/product-image";
import { cx } from "@/components/ui/class-names";
import { MAX_CARD_DOTS, indexFromScroll, shouldLoadSlide, stopCardNavigation, wrapIndex } from "./card-gallery-logic";
import { StoredImage } from "./stored-image";

/**
 * Tootekaardi pildid, kui pilte on mitu (ühe pildiga kaart kasutab tavalist ProductImage'it):
 * - mobiilis pühkimine (natiivne scroll-snap) — vertikaalne lehe kerimine jääb brauserile, pühkimine
 *   ei ava tootelehte (kerimise järel klikki ei teki), tavaline puudutus avab tootelehe
 * - desktopil nooled kaardi hover'il; noole klõps vahetab pilti ega ava tootelehte
 * - ringiga nagu tootelehe galeriis; punktid kuni 8 pildi korral
 * Pildid tulevad samast järjekorrast nagu mujal (imagesForDisplay: pakkumise → mudeli pildid).
 * Rida on z-10, et puudutused jõuaksid kerimisalani (kaardi venitatud lingi kohal).
 */
export function ProductCardImages({
  images,
  href,
  title,
  screenSizeIn,
  sizes,
  priority,
}: {
  images: ProductImageView[];
  href: string;
  title: string;
  screenSizeIn: number;
  sizes: string;
  priority?: boolean;
}) {
  const count = images.length;
  const [index, setIndex] = useState(0);
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set([0]));
  const trackRef = useRef<HTMLDivElement>(null);

  const show = (next: number) => {
    setIndex(next);
    setSeen((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  };

  const goTo = (next: number) => {
    const target = wrapIndex(next, count);
    const track = trackRef.current;
    if (track) track.scrollTo({ left: target * track.clientWidth, behavior: "smooth" });
    show(target);
  };

  return (
    <div className="relative z-10 aspect-[4/3] overflow-hidden bg-white">
      <div
        ref={trackRef}
        className="flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(event) => {
          const track = event.currentTarget;
          const next = indexFromScroll(track.scrollLeft, track.clientWidth, count);
          if (next !== index) show(next);
        }}
        aria-roledescription="karussell"
        aria-label={`${title} pildid`}
      >
        {images.map((image, i) => (
          // Puudutus/klõps pildil avab tootelehe (nagu ülejäänud kaart); ligipääsetav link on pealkirjas
          <Link key={i} href={href} tabIndex={-1} aria-hidden draggable={false} className="relative block h-full w-full shrink-0 snap-center snap-always">
            {shouldLoadSlide(i, index, count, seen) && (
              <StoredImage image={image} sizes={sizes} priority={priority && i === 0} includeLarge={false} screenSizeIn={screenSizeIn} className="p-3" />
            )}
          </Link>
        ))}
      </div>

      <button
        type="button"
        onClick={(event) => {
          stopCardNavigation(event);
          goTo(index - 1);
        }}
        className="absolute left-2 top-1/2 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 shadow-md transition-opacity hover:bg-surface md:flex md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        aria-label={`Eelmine pilt: ${title}`}
      >
        <ChevronLeft className="size-5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={(event) => {
          stopCardNavigation(event);
          goTo(index + 1);
        }}
        className="absolute right-2 top-1/2 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 shadow-md transition-opacity hover:bg-surface md:flex md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        aria-label={`Järgmine pilt: ${title}`}
      >
        <ChevronRight className="size-5" aria-hidden />
      </button>

      {count <= MAX_CARD_DOTS && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5" aria-hidden>
          {images.map((_, i) => (
            <span key={i} className={cx("size-1.5 rounded-full", i === index ? "bg-text" : "bg-border-strong")} />
          ))}
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        Pilt {index + 1} / {count}
      </span>
    </div>
  );
}
