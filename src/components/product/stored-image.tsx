"use client";

import Image from "next/image";
import { useState } from "react";
import type { ProductImageView } from "@/domain/images/product-image";
import { cx } from "@/components/ui/class-names";
import { LaptopIllustration, type IllustrationView } from "./laptop-illustration";

/**
 * Meie salvestusruumis olev tootepilt.
 * - srcset (300 / 700 / large) → brauser valib ekraanile sobiva, Retina ekraanil teravama faili
 * - object-contain → sülearvutit ei lõigata
 * - kui fail ei lae (nt puudub serverist), näidatakse placeholderit, mitte katkist pildi ikooni
 *
 * Kasutame <img> mitte next/image'it, sest variandid on juba serveris optimeeritud (WebP) ja
 * tulevikus asuvad need välises salvestusruumis (S3/R2) — topeltoptimeerimist pole vaja.
 * Erand: tarnija kaugpildid (https://…) on optimeerimata originaalid → next/image.
 */
export function StoredImage({
  image,
  sizes,
  priority,
  includeLarge = true,
  fallbackView = "front",
  screenSizeIn = 14,
  className,
  imageClassName,
}: {
  image: ProductImageView;
  sizes: string;
  priority?: boolean;
  /** Tootekaardil false: brauser valib ainult 300 / 700 px vahel (suurt faili kaardile ei laadita) */
  includeLarge?: boolean;
  fallbackView?: IllustrationView;
  screenSizeIn?: number;
  className?: string;
  imageClassName?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <LaptopIllustration view={fallbackView} screenSizeIn={screenSizeIn} className={cx("absolute inset-0 m-auto h-[78%] w-[78%]", className)} />
    );
  }

  if (isRemoteImage(image)) {
    // Tarnija kaugpilt (nt Laptopid.ee 0,4–2 MB PNG): Next/Image optimeerib (WebP/AVIF, õige laius).
    // Lubatud hostid: next.config.ts → images.remotePatterns (ainult laptopid.ee tootepildid).
    return (
      <Image
        src={image.largeUrl}
        alt={image.alt}
        fill
        sizes={sizes}
        preload={priority}
        draggable={false}
        onError={() => setFailed(true)}
        className={cx("object-contain", imageClassName, className)}
      />
    );
  }

  const largeWidth = Math.max(image.width, 701);
  const srcSet = [`${image.thumbnailUrl} 300w`, `${image.mediumUrl} 700w`, includeLarge && `${image.largeUrl} ${largeWidth}w`]
    .filter(Boolean)
    .join(", ");
  return (
    // eslint-disable-next-line @next/next/no-img-element -- variandid on juba serveris optimeeritud (vt kommentaar)
    <img
      src={image.mediumUrl}
      srcSet={srcSet}
      sizes={sizes}
      alt={image.alt}
      width={image.width}
      height={image.height}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      className={cx("absolute inset-0 h-full w-full object-contain", imageClassName, className)}
    />
  );
}

/** Tarnija kaugpilt (absoluutne https URL) — meie enda failid on suhtelised teed (/media/…). */
function isRemoteImage(image: ProductImageView): boolean {
  return /^https:\/\//.test(image.largeUrl);
}
