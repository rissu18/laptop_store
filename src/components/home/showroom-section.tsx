import { Check, Clock, MapPin, Phone } from "lucide-react";
import Image from "next/image";
import { COMPANY } from "@/config/company";
import { roundedCountLabel, SHOWROOM } from "@/domain/storefront/showroom";
import { SHOWROOM_PHOTOS } from "@/components/brand/showroom-photos";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

const POINTS = [
  "Päris suur valik — mudelid on laudadel kõrvuti",
  "Proovi enne ostu klaviatuuri, ekraani ja suurust",
  "Võrdle sama mudeli eri konfiguratsioone kohapeal",
  "Küsi nõu — aitame valida töö ja eelarve järgi",
];

/** Avalehe salongiplokk (brändi visuaalne ankur). id="salong" — hero link "Vaata salongi". */
export function ShowroomSection({ immediateCount }: { immediateCount: number }) {
  const photo = SHOWROOM_PHOTOS.wide;
  const count = roundedCountLabel(immediateCount);
  return (
    <Container className="py-10">
      <section
        id="salong"
        aria-labelledby="salong-pealkiri"
        className="grid scroll-mt-24 overflow-hidden rounded-2xl border border-border bg-surface shadow-sm lg:grid-cols-2"
      >
        <div className="relative aspect-[3/2] lg:aspect-auto lg:min-h-[440px]">
          <Image
            src={photo.src}
            alt={photo.alt}
            fill
            placeholder="blur"
            sizes="(min-width: 1360px) 680px, (min-width: 1024px) 50vw, 100vw"
            className="object-cover"
          />
        </div>
        <div className="flex flex-col justify-center p-6 sm:p-10">
          <p className="text-sm font-semibold text-primary">Salong Tallinnas</p>
          <h2 id="salong-pealkiri" className="mt-1 text-balance text-2xl font-bold tracking-tight sm:text-3xl">
            {count ? `${count} sülearvutit meie Tallinna salongis` : "Vaata ja võrdle enne ostu kohapeal"}
          </h2>
          <p className="mt-3 text-body">Tule vaatama ja võrdle mudeleid kõrvuti enne ostu — veebis valitud sülearvuti saad üle vaadata kohapeal.</p>
          <ul className="mt-5 space-y-2.5">
            {POINTS.map((point) => (
              <li key={point} className="flex gap-2.5 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
          <dl className="mt-6 grid gap-3 rounded-xl bg-surface-alt p-4 text-sm sm:grid-cols-3">
            <div className="flex gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <div>
                <dt className="sr-only">Aadress</dt>
                <dd className="font-semibold">{SHOWROOM.addressShort}</dd>
              </div>
            </div>
            <div className="flex gap-2">
              <Clock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <div>
                <dt className="sr-only">Lahtiolekuajad</dt>
                <dd className="font-semibold">{SHOWROOM.hours}</dd>
              </div>
            </div>
            <div className="flex gap-2">
              <Phone className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <div>
                <dt className="sr-only">Telefon</dt>
                <dd>
                  <a href={COMPANY.phone.href} className="font-semibold hover:text-primary hover:underline">
                    {COMPANY.phone.label}
                  </a>
                </dd>
              </div>
            </div>
          </dl>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href={SHOWROOM.contactHref}>Salongi info ja kontakt</ButtonLink>
            <ButtonLink href={SHOWROOM.mapsUrl} variant="outline" target="_blank" rel="noopener noreferrer">
              Ava kaardil
            </ButtonLink>
          </div>
        </div>
      </section>
    </Container>
  );
}
