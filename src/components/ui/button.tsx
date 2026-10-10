import Link from "next/link";
import type { ComponentProps } from "react";
import { cx } from "./class-names";

type Variant = "primary" | "secondary" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

interface ButtonStyle {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover shadow-sm",
  secondary: "bg-surface-sunken text-text hover:bg-border",
  outline: "border border-border-strong bg-surface text-text hover:border-text",
  ghost: "text-text hover:bg-surface-sunken",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-sm gap-1.5",
  md: "h-11 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

export function buttonClasses({ variant = "primary", size = "md", fullWidth }: ButtonStyle = {}) {
  return cx(
    "inline-flex items-center justify-center rounded-md font-semibold transition-colors",
    "disabled:pointer-events-none disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    fullWidth && "w-full",
  );
}

export function Button({ variant, size, fullWidth, className, type = "button", ...props }: ButtonStyle & ComponentProps<"button">) {
  return <button type={type} className={cx(buttonClasses({ variant, size, fullWidth }), className)} {...props} />;
}

export function ButtonLink({ variant, size, fullWidth, className, ...props }: ButtonStyle & ComponentProps<typeof Link>) {
  return <Link className={cx(buttonClasses({ variant, size, fullWidth }), className)} {...props} />;
}
