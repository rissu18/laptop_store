import Link from "next/link";
import { Container } from "@/components/ui/container";

const COLUMNS = [
  {
    title: "Pood",
    links: [
      { href: "/sulearvutid", label: "Kõik sülearvutid" },
      { href: "/parimad-pakkumised", label: "Parimad pakkumised" },
      { href: "/leia-sobiv", label: "Leia sobiv sülearvuti" },
      { href: "/vordlus", label: "Toodete võrdlus" },
    ],
  },
  {
    title: "Abi ja info",
    links: [
      { href: "/info/tarne", label: "Tarne" },
      { href: "/info/tagastamine", label: "Tagastamine ja taganemine" },
      { href: "/info/garantii", label: "Garantii" },
      { href: "/seisukorrad", label: "Seisukorra klassid" },
      { href: "/tellimus", label: "Tellimuse otsing" },
    ],
  },
  {
    title: "Ettevõte",
    links: [
      { href: "/info/meist", label: "Meist" },
      { href: "/info/kontakt", label: "Kontakt" },
      { href: "/info/muugitingimused", label: "Müügitingimused" },
      { href: "/info/privaatsus", label: "Privaatsuspoliitika" },
    ],
  },
];

export function SiteFooter({ storeName, legalName, registryCode }: { storeName: string; legalName: string | null; registryCode: string | null }) {
  return (
    <footer className="mt-auto border-t border-border bg-surface-alt">
      <Container className="py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-base font-bold">{storeName}</p>
            <p className="mt-2 max-w-xs text-sm text-muted">
              Kasutatud äriklassi sülearvutid: Lenovo ThinkPad, Dell Latitude ja HP EliteBook.
            </p>
          </div>
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-sm font-semibold">{column.title}</h2>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-muted hover:text-text hover:underline">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted sm:flex-row sm:justify-between">
          {/* TODO: REAL PROVIDER DATA REQUIRED — ettevõtte ametlik nimi ja registrikood */}
          <p>{legalName && registryCode ? `${legalName} · Registrikood ${registryCode}` : "Ettevõtte andmed lisatakse"}</p>
          <p>Kasutame ainult tehniliselt vajalikke küpsiseid.</p>
        </div>
      </Container>
    </footer>
  );
}
