import type { ComponentProps } from "react";
import { cx } from "./class-names";

/** Lehe sisu maksimaalne laius (~1360 px) ja külgvahed. */
export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("mx-auto w-full max-w-[1360px] px-4 sm:px-6 lg:px-8", className)} {...props} />;
}
