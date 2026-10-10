"use client";

import { Check, ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";
import { addToCart } from "@/client/cart-store";
import { buttonClasses } from "@/components/ui/button";
import { cx } from "@/components/ui/class-names";

/**
 * "Lisa korvi". Saadab ainult toote ID — hinda ei saadeta kunagi.
 */
export function AddToCartButton({
  variantId,
  disabled,
  size = "md",
  fullWidth,
  label = "Lisa korvi",
  className,
}: {
  variantId: string;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  label?: string;
  className?: string;
}) {
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 2000);
    return () => clearTimeout(timer);
  }, [added]);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        addToCart(variantId);
        setAdded(true);
      }}
      className={cx(buttonClasses({ variant: "primary", size, fullWidth }), "relative z-10", className)}
    >
      {added ? <Check className="size-4" aria-hidden /> : <ShoppingCart className="size-4" aria-hidden />}
      <span>{added ? "Lisatud" : label}</span>
      <span className="sr-only" role="status">
        {added ? "Toode lisati ostukorvi" : ""}
      </span>
    </button>
  );
}
