import { ArrowRight, MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { HERO_CTAS, SHOWROOM } from "@/domain/storefront/showroom";
import { SHOWROOM_PHOTOS } from "@/components/brand/showroom-photos";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

/**
 * Hero: päris salong + spetsialiseerumine. Foto on brändi põhivisuaal (mitte illustratsioon).
 * Teist otsingukasti siin pole — otsing on headeris (mobiilis alati nähtaval real).
 * Foto on nähtav igal ekraanil (mobiilis kohe headeri all, 16:9 crop; desktopis paremal) → üks LCP-kandidaat, seega `preload`.
 */
export function Hero() {
  const photo = SHOWROOM_PHOTOS.hero;
  return (
    <section aria-labelledby="hero-pealkiri" className="bg-surface-soft bg-[image:var(--store-hero-gradient)]">
      <Container className="grid items-center gap-6 pb-8 pt-0 sm:gap-8 sm:pt-8 md:py-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12 lg:py-14">
        <div className="max-w-xl">
          <p className="text-sm font-semibold text-primary">Lenovo · Dell · HP äriklass</p>
          <h1 id="hero-pealkiri" className="mt-2 text-balance text-3xl font-bold tracking-tight sm:mt-3 sm:text-5xl">
            Äriklassi sülearvutid suurest Tallinna salongist.
          </h1>
          <p className="mt-3 text-pretty text-body sm:mt-4 sm:text-lg">
            Kontrollitud kasutatud äriklassi sülearvutid ja suur valik konfiguratsioone. Vali veebis või tule salongi ja
            võrdle mudeleid kõrvuti.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:mt-7 sm:flex-row sm:flex-wrap">
            <ButtonLink href={HERO_CTAS.primary.href} size="lg">
              {HERO_CTAS.primary.label}
            </ButtonLink>
            <ButtonLink href={HERO_CTAS.finder.href} size="lg" variant="outline">
              {HERO_CTAS.finder.label}
            </ButtonLink>
          </div>
          <Link
            href={HERO_CTAS.showroom.href}
            className="mt-3 inline-flex min-h-11 sm:mt-5 items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            {HERO_CTAS.showroom.label}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>

        <figure className="relative -mx-4 sm:mx-0 max-lg:order-first">
          <div className="relative aspect-[16/9] overflow-hidden shadow-lg ring-1 ring-black/5 sm:aspect-[16/10] sm:rounded-2xl lg:aspect-[3/2]">
            <Image
              src={photo.src}
              alt={photo.alt}
              fill
              preload
              placeholder="blur"
              sizes="(min-width: 1360px) 700px, (min-width: 1024px) 52vw, 100vw"
              className="object-cover object-[50%_60%]"
            />
          </div>
          <figcaption className="absolute bottom-3 left-4 flex items-center gap-2 rounded-lg bg-surface/95 px-3 py-2 text-sm shadow-md sm:bottom-4 sm:left-4">
            <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="font-semibold">Salong {SHOWROOM.addressShort}</span>
              <span className="block text-xs text-muted">{SHOWROOM.hours}</span>
            </span>
          </figcaption>
        </figure>
      </Container>
    </section>
  );
}
