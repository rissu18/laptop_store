import type { StaticImageData } from "next/image";
import contactImage from "../../../public/brand/showroom/showroom-contact.webp";
import detailImage from "../../../public/brand/showroom/showroom-detail.webp";
import heroImage from "../../../public/brand/showroom/showroom-hero.webp";
import wideImage from "../../../public/brand/showroom/showroom-wide.webp";

/**
 * Tallinna salongi fotod (public/brand/showroom, optimeeritud WebP ≤ 2000 px; originaalid pole Git-is).
 * Staatiline import annab Next/Image'ile mõõdud (CLS puudub) ja blur-placeholderi. Next/Image teeb
 * neist vajaliku laiusega variandid (next.config.ts deviceSizes/imageSizes) — eraldi derivaate ei tehta.
 */
export interface ShowroomPhoto {
  src: StaticImageData;
  alt: string;
}

export const SHOWROOM_PHOTOS = {
  /** Avalehe hero: salongi üldvaade õhtuvalgel */
  hero: { src: heroImage, alt: "Ülevaade Sülearvutid.ee Tallinna salongist — sülearvutid väljapanekulaudadel" },
  /** Avalehe salongisektsioon: väljapanek tootjate kaupa */
  wide: { src: wideImage, alt: "Sülearvutid.ee salongi väljapanek: Lenovo, Dell ja HP sülearvutid laudadel kõrvuti" },
  /** Kontakt: salongi sisevaade */
  contact: { src: contactImage, alt: "Sülearvutid.ee salong Tallinnas, Tartu mnt 83 — sülearvutite väljapanekulauad" },
  /** Meist: lähivaade väljapanekust */
  detail: { src: detailImage, alt: "Lähivaade salongi väljapanekust: äriklassi sülearvutid reas proovimiseks" },
} as const satisfies Record<string, ShowroomPhoto>;

export type ShowroomPhotoKey = keyof typeof SHOWROOM_PHOTOS;
