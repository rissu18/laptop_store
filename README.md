# Sülearvutipood

Kasutatud äriklassi sülearvutite e-pood (Lenovo ThinkPad, Dell Latitude, HP EliteBook), mis põhineb automaatselt sünkroniseeritaval hulgilaol.

Custom veebirakendus — ei kasuta WordPressi, WooCommerce'i, Shopifyd ega muud e-poe platvormi. Kogu äriloogika on selles repositooriumis ja rakendust saab self-hostida tavalisel Linuxi VPS-il ilma kuutasuta tarkvarata.

> 12. klassi praktiline lõputöö. Arenduse käik ja otsused on dokumenteeritud kaustas [`docs/`](docs/) ning failis [`CHANGELOG.md`](CHANGELOG.md).

## Staatus

| Etapp | Staatus |
| --- | --- |
| 0 — Analüüs ja planeerimine | ✅ valmis |
| 1 — UI prototüüp (mock-andmed) | ✅ esimene versioon |
| 2 — Andmebaas (PostgreSQL + Prisma) | ⏳ järgmine |
| 3–9 — Admin, tarnija sync, checkout, maksed, automaatika, lihvimine, tootmine | planeeritud |

Vt [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md).

## Tehnoloogiad

- **Next.js 16** (App Router, Server Components, Cache Components) + **React 19**
- **TypeScript** (strict)
- **Tailwind CSS 4** + CSS muutujatel põhinev design token süsteem
- **Zod** — sisendi, keskkonnamuutujate ja tarnija andmete valideerimine
- **Vitest** — unit- ja integratsioonitestid
- Plaanis: PostgreSQL, Prisma, pg-boss, Nodemailer, Playwright, Docker Compose, Nginx, Let's Encrypt

Põhjendused: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Nõuded

- Node.js 22 või uuem (arendatud versiooniga 24)
- npm 10+
- Phase 2-st alates: Docker ja Docker Compose (PostgreSQL)

## Paigaldamine

```bash
npm install
```

```bash
cp .env.example .env.local
```

## Keskkonnamuutujad

| Muutuja | Vaikimisi | Kirjeldus |
| --- | --- | --- |
| `SITE_URL` | `http://localhost:3000` | Poe avalik aadress (canonical, sitemap) |
| `PROTOTYPE_MODE` | `true` | Näitab testandmete hoiatust, keelab indekseerimise |

Muutujad valideeritakse käivitamisel failis [`src/config/env.ts`](src/config/env.ts). Saladusi (API võtmed, paroolid) ei commit'ita kunagi.

## Arendus

```bash
npm run dev
```

Ava <http://localhost:3000>.

| Käsk | Mida teeb |
| --- | --- |
| `npm run dev` | Arendusserver |
| `npm run build` | Tootmisbuild |
| `npm start` | Käivitab tootmisbuildi |
| `npm test` | Unit- ja integratsioonitestid (Vitest) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScripti kontroll |

## Testimine

```bash
npm test
```

Testitud on äriloogika, mis peab olema kindlasti õige:

- **hinnastamismootor** — juurdehindlus, käibemaks (tava- ja erikord), ümardamine, miinimumkasumi kaitse, vigase sisendi tagasilükkamine;
- **tarnija andmete normaliseerimine** — CPU, RAM-i, SSD, ekraani ja klaviatuuri parsimine;
- **seisukorra (Grade) kaardistus**;
- **kataloog** — otsing ("840 g8", "t14 16 512"), filtrid, facet'ide loendurid, URL-i valideerimine, sorteerimine.

E2E testid (Playwright) lisanduvad koos checkout'iga.

## Andmebaas

Phase 2. Andmemudeli kavand: [docs/DATABASE.md](docs/DATABASE.md).

## Deploy

Phase 9: Docker Compose (`web`, `worker`, `db`, `nginx`) + Let's Encrypt tavalisel Linuxi VPS-il.

## Projekti struktuur

```
docs/                     plaan, arhitektuur, andmebaas
src/
  app/                    Next.js route'id
    (shop)/               avalik pood (avaleht, nimekiri, tooteleht, ostukorv, võrdlus …)
    api/search/           otsingu autocomplete
  components/             UI komponendid (ui, layout, product, catalog, home, cart, compare, search, seo)
  domain/                 puhas äriloogika: kataloog, filtrid, otsing, hinnastamine, seisukord, raha
  server/                 serveripoolsed teenused (kataloog, ostukorv)
  integrations/supplier/  SupplierAdapter liides, normaliseerimine, MockSupplierAdapter + testandmed
  client/                 brauseripoolsed store'id (ostukorv, võrdlus)
  config/                 poe seaded, hinnareeglid, keskkonnamuutujad
```

## Testandmed

Kaustas [`src/integrations/supplier/mock/`](src/integrations/supplier/mock/) on **arenduse testandmed** (~45 sülearvutit). Mudelinimed on realistlikud, kuid hinnad, laoseisud ja muud numbrid on välja mõeldud. Seni, kuni `PROTOTYPE_MODE=true`, kuvatakse lehel vastav hoiatus.
