"use client";

import { ArrowLeft, Check, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { formatSpecLine } from "@/domain/catalog/format";
import { productHref } from "@/domain/catalog/urls";
import {
  BUDGETS,
  CARRY_OPTIONS,
  PRIORITIES,
  PURPOSES,
  type BudgetKey,
  type Carry,
  type FinderAnswers,
  type FinderResult,
  type Priority,
  type Purpose,
  type ScoredItem,
} from "@/domain/finder/finder";
import { formatEur } from "@/domain/money/money";
import { findLaptops } from "@/server/finder/finder-actions";
import { GradeBadge } from "@/components/product/grade-badge";
import { ProductImage } from "@/components/product/product-image";
import { Button, ButtonLink } from "@/components/ui/button";
import { cx } from "@/components/ui/class-names";

/**
 * 4-sammuline sülearvuti leidja. Soovitused tulevad serveri deterministlikust hindamisest
 * (src/domain/finder/finder.ts), mitte AI-st.
 */

type Draft = { purpose: Purpose | null; budget: BudgetKey | null; carry: Carry | null; priorities: Priority[] };
const EMPTY: Draft = { purpose: null, budget: null, carry: null, priorities: [] };
const STEP_TITLES = ["Milleks vajad?", "Eelarve", "Kui palju kannad kaasas?", "Mis on oluline?"];

function OptionCard({ selected, label, onSelect, multi }: { selected: boolean; label: string; onSelect: () => void; multi?: boolean }) {
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={onSelect}
      className={cx(
        "flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left text-base font-medium transition-colors",
        selected ? "border-primary bg-primary-soft text-primary ring-1 ring-primary" : "border-border bg-surface hover:border-border-strong",
      )}
    >
      {label}
      <span
        className={cx(
          "flex size-6 shrink-0 items-center justify-center border-2",
          multi ? "rounded-md" : "rounded-full",
          selected ? "border-primary bg-primary text-on-primary" : "border-border-strong",
        )}
        aria-hidden
      >
        {selected && <Check className="size-4" />}
      </span>
    </button>
  );
}

function ResultCard({ label, result }: { label: string; result: ScoredItem }) {
  const { item, reasons } = result;
  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface">
      <p className="bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wide text-on-primary">{label}</p>
      <ProductImage item={item} sizes="(min-width: 1024px) 270px, (min-width: 768px) 30vw, 100vw" />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="font-semibold leading-snug">
            <Link href={productHref(item)} className="hover:text-primary">
              {item.product.title}
            </Link>
          </h3>
          <p className="mt-1 text-sm text-muted">{formatSpecLine(item)}</p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <GradeBadge grade={item.variant.grade} size="sm" />
          <span className="tabular text-xl font-bold">{formatEur(item.variant.price.saleCents)}</span>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Miks sobib sulle</p>
          <ul className="mt-1.5 space-y-1 text-sm">
            {reasons.slice(0, 3).map((reason) => (
              <li key={reason.text} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {reason.text}
              </li>
            ))}
          </ul>
        </div>
        <ButtonLink href={productHref(item)} variant="outline" className="mt-auto">
          Vaata lähemalt
        </ButtonLink>
      </div>
    </article>
  );
}

/**
 * `initialPurpose` (avalehe "Milleks sülearvutit vajad?" plokist): eesmärk on eelvalitud ja leidja algab
 * eelarve sammust; "Tagasi" viib eesmärgi juurde, kus valikut saab muuta.
 */
export function LaptopFinder({ initialPurpose = null }: { initialPurpose?: Purpose | null }) {
  const [step, setStep] = useState(initialPurpose ? 1 : 0);
  const [draft, setDraft] = useState<Draft>({ ...EMPTY, purpose: initialPurpose });
  const [result, setResult] = useState<FinderResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const canContinue = [draft.purpose, draft.budget, draft.carry, true][step];

  function submit() {
    const answers = draft as FinderAnswers;
    startTransition(async () => {
      setResult(await findLaptops(answers));
      setStep(4);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function restart() {
    setDraft(EMPTY);
    setResult(null);
    setStep(0);
  }

  if (step === 4 && result) {
    const picks = [
      { label: "Parim valik", result: result.best },
      { label: "Soodsaim sobiv", result: result.cheapest },
      { label: "Võimsaim sobiv", result: result.strongest },
    ].filter((p): p is { label: string; result: ScoredItem } => p.result !== null);

    return (
      <section aria-live="polite">
        <h2 className="text-2xl font-bold tracking-tight">Sinu soovitused</h2>
        <p className="mt-1 text-sm text-muted">
          {result.matchingCount > 0
            ? `Sinu eelarvesse mahub ${result.matchingCount} sülearvutit. Valisime neist välja need, mis sobivad sinu vastustega kõige paremini.`
            : "Selle eelarvega ei leidnud praegu ühtegi sülearvutit."}
        </p>
        {picks.length > 0 && (
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {picks.map((pick) => (
              <ResultCard key={pick.label} label={pick.label} result={pick.result} />
            ))}
          </div>
        )}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button variant="outline" onClick={() => setStep(0)}>
            <ArrowLeft className="size-4" aria-hidden />
            Muuda vastuseid
          </Button>
          <Button variant="ghost" onClick={restart}>
            <RotateCcw className="size-4" aria-hidden />
            Alusta uuesti
          </Button>
          <ButtonLink href={result.allMatchingHref} className="sm:ml-auto">
            Vaata kõiki sobivaid sülearvuteid
          </ButtonLink>
        </div>
      </section>
    );
  }

  return (
    <section>
      {/* Edenemine */}
      <div className="mb-6">
        <p className="text-sm text-muted">
          Samm {step + 1} / 4
        </p>
        <div className="mt-2 grid grid-cols-4 gap-1.5" aria-hidden>
          {STEP_TITLES.map((title, i) => (
            <span key={title} className={cx("h-1.5 rounded-full", i <= step ? "bg-primary" : "bg-border")} />
          ))}
        </div>
      </div>

      <fieldset>
        <legend className="mb-1 text-2xl font-bold tracking-tight">{STEP_TITLES[step]}</legend>
        {step === 3 && <p className="mb-2 text-sm text-muted">Vali kõik, mis sulle olulised on (võid ka vahele jätta).</p>}

        <div role={step === 3 ? "group" : "radiogroup"} className="mt-4 grid gap-2 sm:grid-cols-2">
          {step === 0 &&
            PURPOSES.map((o) => (
              <OptionCard key={o.key} label={o.label} selected={draft.purpose === o.key} onSelect={() => setDraft({ ...draft, purpose: o.key })} />
            ))}
          {step === 1 &&
            BUDGETS.map((o) => (
              <OptionCard key={o.key} label={o.label} selected={draft.budget === o.key} onSelect={() => setDraft({ ...draft, budget: o.key })} />
            ))}
          {step === 2 &&
            CARRY_OPTIONS.map((o) => (
              <OptionCard key={o.key} label={o.label} selected={draft.carry === o.key} onSelect={() => setDraft({ ...draft, carry: o.key })} />
            ))}
          {step === 3 &&
            PRIORITIES.map((o) => {
              const selected = draft.priorities.includes(o.key);
              return (
                <OptionCard
                  key={o.key}
                  multi
                  label={o.label}
                  selected={selected}
                  onSelect={() =>
                    setDraft({ ...draft, priorities: selected ? draft.priorities.filter((p) => p !== o.key) : [...draft.priorities, o.key] })
                  }
                />
              );
            })}
        </div>
      </fieldset>

      {/* Mobiilis kleepuv navigatsioon pöidla ulatuses */}
      <div className="sticky bottom-0 -mx-4 mt-6 flex gap-3 border-t border-border bg-surface/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0">
        {step > 0 && (
          <Button variant="outline" size="lg" onClick={() => setStep(step - 1)}>
            <ArrowLeft className="size-4" aria-hidden />
            Tagasi
          </Button>
        )}
        {step < 3 ? (
          <Button size="lg" className="flex-1 sm:flex-none" disabled={!canContinue} onClick={() => setStep(step + 1)}>
            Edasi
          </Button>
        ) : (
          <Button size="lg" className="flex-1 sm:flex-none" disabled={isPending} onClick={submit}>
            {isPending ? "Otsin…" : "Näita soovitusi"}
          </Button>
        )}
      </div>
    </section>
  );
}
