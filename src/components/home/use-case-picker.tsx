import { Briefcase, Code2, GraduationCap, Home, Palette, Plane, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { USE_CASES, hrefForUseCase } from "@/domain/use-cases/use-cases";

const ICONS: Record<string, LucideIcon> = {
  too: Briefcase,
  kool: GraduationCap,
  kodu: Home,
  reis: Plane,
  programmeerimine: Code2,
  kujundus: Palette,
};

/** Kasutusotstarbe valik — klikk avab nimekirja sobivate filtritega. */
export function UseCasePicker() {
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {USE_CASES.map((useCase) => {
        const Icon = ICONS[useCase.key];
        return (
          <li key={useCase.key} className="flex">
            <Link
              href={hrefForUseCase(useCase)}
              className="flex w-full flex-col gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary hover:bg-primary-soft"
            >
              <Icon className="size-6 text-primary" aria-hidden />
              <span>
                <span className="block font-semibold">{useCase.label}</span>
                <span className="mt-1 block text-sm text-muted">{useCase.description}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
