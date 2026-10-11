import Link from "next/link";
import { COMPANY, COMPANY_ADDRESS_LINE } from "@/config/company";
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
      { href: "/info/muugitingimused", label: "E-poe tingimused" },
      { href: "/info/privaatsus", label: "Isikuandmed ja privaatsus" },
    ],
  },
];

/** Müüja andmed tulevad src/config/company.ts-ist (sama allikas mis Kontakt-lehel ja E-poe tingimustes). */
export function SiteFooter({ storeName }: { storeName: string }) {
  return (
    <footer className="mt-auto border-t border-border bg-surface-alt">
      <Container className="py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-base font-bold">{storeName}</p>
            <p className="mt-2 max-w-xs text-sm text-muted">
              Kasutatud äriklassi sülearvutid: Lenovo ThinkPad, Dell Latitude ja HP EliteBook.
            </p>
            <address className="mt-4 space-y-1 text-sm not-italic text-muted">
              <p>
                <a href={COMPANY.mapsUrl} target="_blank" rel="noopener noreferrer" className="hover:text-text hover:underline">
                  {COMPANY_ADDRESS_LINE}
                </a>
              </p>
              <p>
                Tel{" "}
                <a href={COMPANY.phone.href} className="hover:text-text hover:underline">
                  {COMPANY.phone.label}
                </a>
              </p>
              <p>
                Mobiil{" "}
                <a href={COMPANY.mobile.href} className="hover:text-text hover:underline">
                  {COMPANY.mobile.label}
                </a>
              </p>
              <p>
                <a href={`mailto:${COMPANY.email}`} className="hover:text-text hover:underline">
                  {COMPANY.email}
                </a>
              </p>
            </address>
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
          <p>
            {COMPANY.legalName} · Registrikood {COMPANY.registryCode} · {COMPANY_ADDRESS_LINE}
          </p>
          <p>Kasutame ainult tehniliselt vajalikke küpsiseid.</p>
        </div>
      </Container>
    </footer>
  );
}
