import Link from "next/link";
import { formatEur } from "@/domain/money/money";
import { SearchBox } from "@/components/search/search-box";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { LaptopIllustration } from "@/components/product/laptop-illustration";

/**
 * Hero: kompaktne (ei võta tervet ekraani). Kõik numbrid tulevad kataloogist.
 * "Uueneb automaatselt" väidet näidatakse alles siis, kui sync päriselt töötab.
 */
export function Hero({
  stats,
  popular,
  autoSyncActive,
}: {
  stats: { count: number; minPriceCents: number | null };
  popular: { label: string; query: string }[];
  autoSyncActive: boolean;
}) {
  return (
    <section className="border-b border-border bg-surface-alt bg-[image:var(--store-hero-gradient)]">
      <Container className="grid items-center gap-8 py-10 md:py-14 lg:grid-cols-[1.25fr_1fr] lg:gap-12">
        <div>
          <p className="text-sm font-semibold text-primary">Lenovo · Dell · HP äriklass</p>
          <h1 className="mt-3 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            Hea sülearvuti ei pea olema uus.
          </h1>
          <p className="mt-4 max-w-xl text-pretty text-lg text-muted">
            Leia kvaliteetne kasutatud äriklassi sülearvuti selge seisukorra ja ausa hinnaga.
            {autoSyncActive && " Valik, hinnad ja laoseis uuenevad automaatselt."}
          </p>

          <SearchBox size="lg" className="mt-6 max-w-xl" />

          {popular.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">Populaarsed:</span>
              {popular.map((item) => (
                <Link
                  key={item.label}
                  href={`/sulearvutid?q=${encodeURIComponent(item.query)}`}
                  className="rounded-full border border-border bg-surface px-3 py-1 hover:border-primary hover:text-primary"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/sulearvutid" size="lg">
              Vaata sülearvuteid
            </ButtonLink>
            <ButtonLink href="/leia-sobiv" size="lg" variant="outline">
              Leia mulle sobiv
            </ButtonLink>
          </div>
        </div>

        <div className="relative hidden lg:block">
          <LaptopIllustration className="w-full" screenSizeIn={14} />
          {stats.count > 0 && (
            <dl className="absolute -bottom-2 left-6 flex gap-6 rounded-lg border border-border bg-surface px-5 py-3 shadow-md">
              <div>
                <dt className="text-xs text-muted">Valikus</dt>
                <dd className="tabular text-lg font-bold">{stats.count} sülearvutit</dd>
              </div>
              {stats.minPriceCents !== null && (
                <div>
                  <dt className="text-xs text-muted">Hinnad alates</dt>
                  <dd className="tabular text-lg font-bold">{formatEur(stats.minPriceCents)}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </Container>
    </section>
  );
}
