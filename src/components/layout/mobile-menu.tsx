"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { MAIN_NAV } from "./navigation";

const SECONDARY = [
  { href: "/vordlus", label: "Toodete võrdlus" },
  { href: "/tellimus", label: "Tellimuse otsing" },
  { href: "/seisukorrad", label: "Seisukorra klassid" },
  { href: "/info", label: "Abi ja info" },
];

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-ml-2 rounded-md p-2 hover:bg-surface-sunken lg:hidden"
        aria-label="Ava menüü"
        aria-haspopup="dialog"
      >
        <Menu className="size-6" aria-hidden />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Menüü" variant="drawer-left">
        <nav aria-label="Mobiilimenüü" className="p-2">
          <ul>
            {MAIN_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className="block rounded-md px-3 py-3 text-base font-medium hover:bg-surface-sunken aria-[current=page]:text-primary"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <hr className="my-2 border-border" />
          <ul>
            {SECONDARY.map((item) => (
              <li key={item.href}>
                <Link href={item.href} onClick={() => setOpen(false)} className="block rounded-md px-3 py-3 text-sm text-muted hover:bg-surface-sunken hover:text-text">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Dialog>
    </>
  );
}
