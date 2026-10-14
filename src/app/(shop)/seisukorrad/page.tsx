import type { Metadata } from "next";
import { storeConfig } from "@/config/store";
import { GRADES, GRADE_CODES } from "@/domain/grade/grades";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { GradeBadge } from "@/components/product/grade-badge";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Seisukorra klassid",
  description: "Kuidas hinnatakse kasutatud sülearvuti seisukorda: klassid A+, A, B ja C.",
};

export default function GradesPage() {
  return (
    <Container className="max-w-4xl pb-16">
      <Breadcrumbs items={[{ label: "Seisukorra klassid" }]} siteUrl={storeConfig.siteUrl} />
      <h1 className="text-3xl font-bold tracking-tight">Seisukorra klassid</h1>
      <p className="mt-2 text-muted">
        Iga kasutatud sülearvuti saab seisukorra klassi. Klass kirjeldab välimust; seade on igas klassis täielikult töökorras.
        Kui mõni liides ei tööta (nt üks USB-pesa), on see toote juures eraldi välja toodud — see ei mõjuta klassi.
      </p>
      <p className="mt-3 text-sm text-muted">
        Partnerlaos olevate seadmete (tarne 1–4 tööpäeva) klassi määrab tarnija oma hindamise järgi. Konkreetse seadme seisukorra
        märkus on alati tootelehel.
      </p>
      <ul className="mt-8 space-y-4">
        {GRADE_CODES.map((code) => (
          <li key={code} id={GRADES[code].param} className="rounded-lg border border-border p-5">
            <GradeBadge grade={code} />
            <p className="mt-3">{GRADES[code].description}</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
              {GRADES[code].criteria.map((criterion) => (
                <li key={criterion}>{criterion}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Container>
  );
}
