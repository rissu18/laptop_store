"use client";

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
 */
export function StoredImage({
  image,
  sizes,
  priority,
  fallbackView = "front",
  screenSizeIn = 14,
  className,
  imageClassName,
}: {
  image: ProductImageView;
  sizes: string;
  priority?: boolean;
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

  const largeWidth = Math.max(image.width, 700);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- variandid on juba serveris optimeeritud (vt kommentaar)
    <img
      src={image.mediumUrl}
      srcSet={`${image.thumbnailUrl} 300w, ${image.mediumUrl} 700w, ${image.largeUrl} ${largeWidth}w`}
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
