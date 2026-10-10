import Link from "next/link";
import { Container } from "@/components/ui/container";

/**
 * Hariv sektsioon. Teadlikult ilma numbriteta, mida me ei suuda tõestada
 * (nt "säästad 70%" või "X kg CO₂").
 */
const POINTS = [
  {
    title: "Ehitatud igapäevaseks tööks",
    text: "Äriklassi sülearvutid (ThinkPad, Latitude, EliteBook) on mõeldud ettevõtetele, kus arvutit kasutatakse iga päev aastaid. Neil on tavaliselt tugevam korpus, parem klaviatuur ja rohkem ühendusi kui tavatarbija mudelitel.",
  },
  {
    title: "Rohkem arvutit sama raha eest",
    text: "Ettevõtted vahetavad arvuteid sageli välja liisinguperioodi lõpus, kuigi seadmed on veel heas korras. Seetõttu saab kasutatud äriklassi sülearvuti sageli sama hinnaga kui uue odavama mudeli.",
  },
  {
    title: "Keskkonnale parem valik",
    text: "Iga juba toodetud arvuti, mida edasi kasutatakse, tähendab ühte uut seadet vähem. Nii pikeneb olemasoleva tehnika eluiga.",
  },
  {
    title: "Seisukord on näha",
    text: "Igal arvutil on seisukorra klass (A+, A, B või C). Klassi tähendus on kirjeldatud eraldi lehel, et teaksid enne ostu, mida oodata.",
    link: { href: "/seisukorrad", label: "Vaata seisukorra klasse" },
  },
];

export function WhyUsedSection() {
  return (
    <section aria-labelledby="miks-kasutatud" className="bg-surface-alt py-14">
      <Container>
        <h2 id="miks-kasutatud" className="max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">
          Miks valida kasutatud äriklassi sülearvuti?
        </h2>
        <ul className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {POINTS.map((point) => (
            <li key={point.title}>
              <h3 className="font-semibold">{point.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{point.text}</p>
              {point.link && (
                <Link href={point.link.href} className="mt-2 inline-block text-sm font-semibold text-primary hover:underline">
                  {point.link.label} →
                </Link>
              )}
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
