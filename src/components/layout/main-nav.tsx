"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/class-names";
import { MAIN_NAV } from "./navigation";

export function MainNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Põhimenüü" className="hidden border-t border-border lg:block">
      <ul className="-mx-3 flex items-center gap-1">
        {MAIN_NAV.map((item) => {
          const current = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cx(
                  "block rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:text-primary",
                  current ? "text-primary" : "text-text",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
