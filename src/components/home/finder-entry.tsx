import { ArrowRight, Briefcase, Code2, GraduationCap, Home, Palette, Plane, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { PURPOSES, finderHrefForPurpose, type Purpose } from "@/domain/finder/finder";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

/** Lühike vihje iga leidja eesmärgi juurde (leidja enda hindamisreeglid on src/domain/finder/finder.ts) */
const PURPOSE_UI: Record<Purpose, { icon: LucideIcon; hint: string }> = {
  work: { icon: Briefcase, hint: "Kontor, kaugtöö, Teams" },
  school: { icon: GraduationCap, hint: "Kool, ülikool, kodutööd" },
  home: { icon: Home, hint: "Veeb, video, dokumendid" },
  travel: { icon: Plane, hint: "Kerge, kompaktne, ärireisile" },
  programming: { icon: Code2, hint: "Rohkem mälu ja SSD-d" },
  design: { icon: Palette, hint: "Graafika, foto, video" },
};

/**
 * "Milleks sülearvutit vajad?" — avalehe sisenemine olemasolevasse leidjasse (/leia-sobiv).
 * Paralleelset soovitussüsteemi pole: iga valik avab sama 4-sammulise leidja eelvalitud eesmärgiga.
 */
export function FinderEntry() {
  return (
    <Container className="py-10">
      <section aria-labelledby="milleks-vajad" className="rounded-2xl border border-primary-border/70 bg-surface-soft p-5 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-primary">Sülearvuti leidja</p>
            <h2 id="milleks-vajad" className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              Milleks sülearvutit vajad?
            </h2>
            <p className="mt-1 text-body">Vali eesmärk — küsime veel eelarve ja kaasaskandmise kohta ning soovitame kuni kolm sobivat mudelit koos põhjendusega.</p>
          </div>
          <ButtonLink href="/leia-sobiv" variant="outline" className="hidden sm:inline-flex">
            Alusta algusest
            <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
        </div>

        <ul className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {PURPOSES.map((purpose) => {
            const { icon: Icon, hint } = PURPOSE_UI[purpose.key];
            return (
              <li key={purpose.key} className="flex">
                <Link
                  href={finderHrefForPurpose(purpose.key)}
                  className="group flex w-full flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm transition-[border-color,box-shadow] hover:border-primary hover:shadow-md"
                >
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary transition-colors group-hover:bg-primary group-hover:text-on-primary">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span>
                    <span className="block font-semibold leading-snug">{purpose.label}</span>
                    <span className="mt-1 block text-sm text-muted">{hint}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <ButtonLink href="/leia-sobiv" variant="outline" fullWidth className="mt-4 sm:hidden">
          Alusta algusest
        </ButtonLink>
      </section>
    </Container>
  );
}
