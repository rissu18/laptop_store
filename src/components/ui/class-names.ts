/** Liidab tingimuslikud CSS klassid: cx("a", cond && "b") → "a b" */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
