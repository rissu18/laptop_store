import { GRADES, type GradeCode } from "@/domain/grade/grades";
import { cx } from "@/components/ui/class-names";

const GRADE_STYLES: Record<GradeCode, string> = {
  "A+": "text-grade-aplus border-grade-aplus/30 bg-primary-soft",
  A: "text-grade-a border-grade-a/30 bg-success-soft",
  B: "text-grade-b border-grade-b/30 bg-warning-soft",
  C: "text-grade-c border-grade-c/30 bg-surface-sunken",
};

/** "A · Väga hea" — seisukorra märk. Korduvkasutatav kaardil, ostukorvis, võrdluses. */
export function GradeBadge({ grade, size = "md", className }: { grade: GradeCode; size?: "sm" | "md"; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-semibold",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        GRADE_STYLES[grade],
        className,
      )}
    >
      <span aria-hidden>{grade}</span>
      <span className="sr-only">Seisukord {grade}:</span>
      <span aria-hidden className="opacity-50">
        ·
      </span>
      <span className="font-medium">{GRADES[grade].label}</span>
    </span>
  );
}
