"use client";

import { Info } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { GRADES, GRADE_CODES, type GradeCode } from "@/domain/grade/grades";
import { Dialog } from "@/components/ui/dialog";
import { cx } from "@/components/ui/class-names";
import { GradeBadge } from "./grade-badge";

/** Klikitav seisukorra märk, mis avab kõigi klasside selgituse. */
export function GradeExplainer({ grade }: { grade: GradeCode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex items-center gap-1.5 rounded-full"
        aria-haspopup="dialog"
      >
        <GradeBadge grade={grade} />
        <span className="inline-flex items-center gap-1 text-sm text-muted underline-offset-2 group-hover:text-text group-hover:underline">
          <Info className="size-4" aria-hidden />
          Mida see tähendab?
        </span>
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Seisukorra klassid">
        <div className="space-y-3 p-5">
          {GRADES[grade].isPlaceholder && (
            <p className="rounded-md bg-warning-soft p-3 text-sm text-warning">
              Arenduse märkus: klasside täpsed kirjeldused lisatakse hulgilao dokumentatsiooni põhjal. Allolevad
              tekstid on ajutised.
            </p>
          )}
          <ul className="space-y-2">
            {GRADE_CODES.map((code) => (
              <li
                key={code}
                className={cx(
                  "rounded-md border p-3",
                  code === grade ? "border-primary-border bg-primary-soft" : "border-border",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <GradeBadge grade={code} size="sm" />
                  {code === grade && <span className="text-xs font-semibold text-primary">Selle toote klass</span>}
                </div>
                <p className="mt-2 text-sm text-muted">{GRADES[code].description}</p>
              </li>
            ))}
          </ul>
          <Link href="/seisukorrad" onClick={() => setOpen(false)} className="inline-block text-sm font-semibold text-primary hover:underline">
            Loe seisukorra hindamise kohta lähemalt →
          </Link>
        </div>
      </Dialog>
    </>
  );
}
