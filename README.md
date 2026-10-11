# Sülearvutipood

Kasutatud äriklassi sülearvutite e-pood (Lenovo ThinkPad, Dell Latitude, HP EliteBook …), mille kataloog sünkroniseeritakse Laptopid.ee API-st (tulevikus ka hulgilaost).

Custom veebirakendus — ei kasuta WordPressi, WooCommerce'i, Shopifyd ega muud e-poe platvormi. Kogu äriloogika on selles repositooriumis ja rakendust saab self-hostida tavalisel Linuxi VPS-il ilma kuutasuta tarkvarata.

> 12. klassi praktiline lõputöö. Arenduse käik ja otsused on dokumenteeritud kaustas [`docs/`](docs/) ning failis [`CHANGELOG.md`](CHANGELOG.md).

## Staatus

| Etapp | Staatus |
| --- | --- |
| 0 — Analüüs ja planeerimine | ✅ valmis |
| 1 — UI prototüüp (mock-andmed) | ✅ esimene versioon |
| 1b — Tootepildid Open Icecatist | ✅ valmis (pildid Git'is; püsiv salvestus ootab valikut) |
| 2 — Andmebaas (PostgreSQL + Drizzle) | ✅ valmis |
| 3 — Admin-liides | ✅ valmis — vt [docs/ADMIN.md](docs/ADMIN.md) |
| 3b — Sooduskoodid | ✅ valmis — vt [docs/DISCOUNTS.md](docs/DISCOUNTS.md) |
| 5a — Kassa ja tellimused (ilma makseta, testtellimused) | ✅ valmis — vt [docs/ORDERS.md](docs/ORDERS.md) |
| 4a — Päris kataloog Laptopid.ee API-st (sync → PostgreSQL) | ✅ valmis — vt [docs/LAPTOPID_SYNC.md](docs/LAPTOPID_SYNC.md) |
| 4–9 — Foxway, 5-min ajastaja, maksed, automaatika, lihvimine, tootmine | planeeritud |

Vt [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md).

## Tehnoloogiad

- **Next.js 16** (App Router, Server Components, Cache Components) + **React 19**
- **TypeScript** (strict)
- **Tailwind CSS 4** + CSS muutujatel põhinev design token süsteem
- **Zod** — sisendi, keskkonnamuutujate ja tarnija andmete valideerimine
- **Vitest** — unit- ja integratsioonitestid
- **sharp** — tootepiltide kontroll ja variandid (WebP)
- **Open Icecat** JSON API — tootjate mudelipildid
- **PostgreSQL** (Neon) + **Drizzle ORM** — andmebaas ja migratsioonid
- Plaanis: pg-boss, Nodemailer, Playwright, Docker Compose, Nginx, Let's Encrypt

Põhjendused: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Nõuded

- Node.js 22 või uuem (arendatud versiooniga 24)
- npm 10+
- PostgreSQL (arenduses ja Vercelis Neon). Ilma andmebaasita töötab pood mock-andmetega; admin vajab andmebaasi.

## Paigaldamine

```bash
npm install
```

```bash
cp .env.example .env.local
```

Andmebaasi muutujad (Neon, Verceliga seotud projekt):

```bash
npx vercel env pull .env.development.local
```

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm run admin:create
```

Seejärel ava <http://localhost:3000/admin/login>. Admini kasutajat ega parooli koodis ei ole — see luuakse ainult `admin:create` käsuga.

## Keskkonnamuutujad

| Muutuja | Vaikimisi | Kirjeldus |
| --- | --- | --- |
| `SITE_URL` | `http://localhost:3000` | Poe avalik aadress (canonical, sitemap) |
| `DATABASE_URL` / `database_DATABASE_URL` | – | PostgreSQL (pooled). Vercel + Neon lisab `database_` eesliitega |
| `DATABASE_URL_UNPOOLED` | – | Otseühendus migratsioonidele ja skriptidele |
| `ICECAT_USERNAME` | – | Open Icecati kasutajanimi (piltide import) |
| `ICECAT_API_TOKEN` | – | Valikuline; saadetakse ainult HTTP päises |
| `ICECAT_CONTENT_TOKEN` | – | Valikuline; saadetakse ainult HTTP päises |
| `LAPTOPID_API_KEY` | – | Laptopid.ee API võti (ainult server, ainult HTTP päises `X-API-Key`) |
| `LAPTOPID_API_BASE_URL` | – | Laptopid.ee API kataloog (`https://laptopid.ee/api/sulearvutid/`); sellest ehitatakse `products.php` ja `images.php`. Puudumisel sync ei käivitu (tagavara-URL-i pole) |
| `CRON_SECRET` | – | Ajastatud sync'i otspunkti kaitse (`Authorization: Bearer …`, vähemalt 16 märki). Puudumisel otspunkt ei käivitu. Vercelis Secret-tüübina |

Muutujad valideeritakse käivitamisel failis [`src/config/env.ts`](src/config/env.ts). Saladusi (API võtmed, paroolid, ühendusstringid) ei commit'ita ega logita kunagi. Prototüübirežiim (hoiatusriba + noindex) on nüüd poe seadetes: admin → Seaded → Pood.

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
| `npm run icecat -- import --all` | Icecati piltide import kõigile mudelitele + raport |
| `npm run icecat -- status` | Data Quality: kate, staatused, mudelid ilma pildita |
| `npm run db:check` | Andmebaasi ühenduse test |
| `npm run db:migrate` | Rakenda migratsioonid |
| `npm run db:seed` | Impordi praegune kataloog andmebaasi (idempotentne, ENNE/PÄRAST kontroll) |
| `npm run db:verify-catalog` | Võrdle mock-kataloogi ja andmebaasi kataloogi |
| `npm run db:counts` | Olemasolevate andmete arvud (kontroll enne/pärast migratsiooni) |
| `npm run db:generate` | Uus migratsioon pärast skeemi muutmist |
| `npm run laptopid:sync` | Laptopid.ee → andmebaas sync (`-- --allow-large-drop` lubab suure muutuse) |
| `npm run catalog:archive-mock` | Mock-testandmete pakkumised → ARCHIVED (`-- --confirm`; ilma selleta ainult näitab) |
| `npm run admin:create` | Loo admin (parool küsitakse varjatult); `-- --reset-password` vahetab parooli |
| `npm run admin:delete -- <e-post>` | Kustuta admin |

## Tootepildid (Icecat)

```bash
npm run icecat -- import --all
```

Pildid laaditakse Open Icecatist alla, töödeldakse (300 / 700 / 2000 px WebP) ja salvestatakse kausta `public/media/products/`. Frontend kasutab ainult meie URL-e. Icecatist võetakse **ainult pildid** — seadme tehnilised andmed tulevad alati tarnija pakkumisest.

Üksikute mudelite toimingud (põhipilt, järjekord, peitmine, otsi uuesti, käsitsi vaste eelvaatega, värskenda pilte) tehakse nüüd **adminis**: Pildid ja mudeli leht. Andmed on PostgreSQL-is. CLI (`npm run icecat`) kasutab veel JSON-faile ja on mõeldud esialgseks massimpordiks.

Raportid: [kogu kataloog](docs/reports/icecat-catalog-report.md) · [10 mudeli test](docs/reports/icecat-test-report.md).

> Testversioonis on töödeldud pildid Git'is (`public/media/products`) ja Vercel serveerib neid. Piltide allalaadimine administ töötab ainult lokaalselt, kuni on püsiv salvestusruum (vt docs/PROJECT_PLAN.md R13).

## Testimine

```bash
npm test
```

Testitud on äriloogika, mis peab olema kindlasti õige:

- **hinnastamismootor** — juurdehindlus, käibemaks (tava- ja erikord), ümardamine, miinimumkasumi kaitse, vigase sisendi tagasilükkamine;
- **tarnija andmete normaliseerimine** — CPU, RAM-i, SSD, ekraani ja klaviatuuri parsimine;
- **seisukorra (Grade) kaardistus**;
- **kataloog** — otsing ("840 g8", "t14 16 512"), filtrid, facet'ide loendurid, URL-i valideerimine, sorteerimine;
- **Icecat** — vaste prioriteedid ja kindlus, pealkirja kontroll (T14 ≠ T14s), pildivalik ja duplikaadid, klient (tokenid päistes, 404 ei korrata), pildi kontroll (HTML ei lähe pildina läbi), kogu import pipeline (muutumata pilte ei laeta uuesti, Icecat maas → pildid jäävad alles);
- **andmebaas** — migratsioon, import = allika arvud, idempotentsus, admini muudatused säilivad korduval impordil;
- **autentimine** — scrypt, nõrgad paroolid, sessioonid, sisselogimise piirang, proxy, CSRF päritolu, open redirect;
- **admin** — parandused vs tarnija väärtus, pildid, andmekvaliteet, hinnastamine (eelvaade/rakendamine), seaded, audit, toimingud ilma sessioonita, SQL-süst;
- **Laptopid.ee sync** — API skeem, normaliseerimine (pordid, omadused, pildid), allikas + väline ID, idempotentsus (duplikaate ei teki), muutuste uuendamine, sama mudeli konfiguratsioonid eraldi, admini parandus säilib, ostuhind NULL, saadavus ilma koguseta (ei väida "1 tk", 1 tk lubatud, rohkem → teade), API viga / poolik snapshot ei muuda kataloogi, usaldusväärne snapshot võtab puuduva maha ja taastab tagasi tulnu, lukk, otsing, ostukorv, kassa hind andmebaasist, hinnamuutuse tuvastus, vana tellimuse snapshot;
- **sooduskoodid** — tõstutundetus, %, €, maksimum, miinimumsumma, kuupäevad, tootja/mudeli/konfiguratsiooni piirang, välistused, negatiivne summa, marginaalikaitse, kliendi võltsimine, üks kood korraga, kontroll ei suurenda kasutust, piirang, kasutuste reserveerimine/kinnitamine, admini õigused ja audit.

Andmebaasi testid jooksevad päris PostgreSQL-is **ajutises skeemis**, mis testi lõpus kustutatakse. Ilma `DATABASE_URL`-ita jäetakse need vahele. E2E testid (Playwright) lisanduvad koos checkout'iga.

## Andmebaas

PostgreSQL (Neon) + Drizzle ORM: 25 tabelit, migratsioonid `drizzle/0000_init.sql`, `0001_discount_codes.sql`, `0002_orders.sql` ja `0003_laptopid_sync.sql`. Skeem, ORM valiku põhjendus ja impordi tulemused: [docs/DATABASE.md](docs/DATABASE.md).

## Admin

`/admin`: töölaud, mudelid, konfiguratsioonid, pildid ja Icecat, andmekvaliteet, hinnastamine, seaded, tegevuslogi, logid, tervis. Turvalisus, tarnija vs admini andmed, hinnastamine ja audit: [docs/ADMIN.md](docs/ADMIN.md).

## Sooduskoodid

`/admin/discounts`: protsent (+ maksimum), fikseeritud summa, tasuta tarne; kehtivusaeg (Eesti aeg, server otsustab), miinimumsumma, kasutuspiirang, tootja/mudeli/konfiguratsiooni piirang ja välistused, marginaalikaitse. Ostukorvis saab korraga kasutada ühte koodi; brauser saadab ainult koodi teksti ja soodustuse arvutab server. Andmemudel, arvutuse järjekord, turvalisus ja tulevane tellimuste integratsioon: [docs/DISCOUNTS.md](docs/DISCOUNTS.md).

## Päris kataloog (Laptopid.ee)

Laptopid.ee API → valideerimine → normaliseerimine → sync → PostgreSQL → sama kataloogiteenus kõigile lehtedele (pood, otsing, ostukorv, kassa). Pood ja kassa ei küsi kunagi API-st otse. Laptopid annab ainult saadavuse (mitte kogust): poes "Kohe saadaval", tellida saab 1 tk rea kohta. Müügihind tuleb tarnijalt (admin saab parandada), ostuhind on teadmata. Puuduvad tooted võetakse maha ainult usaldusväärse täieliku nimekirjaga. Pildid on Laptopid.ee kaug-URL-id läbi Next/Image (Git'i neid ei laeta). Sync: admin → Tarnijad → **Sync now**, `npm run laptopid:sync` või kaitstud cron-otspunkt `/api/cron/laptopid-sync` (välisele 5-min ajastajale; Vercel Hobby enda cron kord päevas). Vt [docs/LAPTOPID_SYNC.md](docs/LAPTOPID_SYNC.md).

## Kassa ja tellimused

Ostukorv → `/kassa` → serveripoolne kontroll (hinnad, laoseis, sooduskood, tarne) → tellimus PostgreSQL-is → kinnitusleht → `/admin/orders` ja tellimuse otsing (`/tellimus`). **Päris makset ei ole.** Prototüübirežiimis tekivad ainult testtellimused: makset ei võeta, tarnijale ei saadeta ja laoseisu ei vähendata. Kui prototüüp lülitatakse välja ilma makseteenuseta, kassa sulgub. Idempotentsus, tellimuse rea snapshot, olekumasin, juurdepääs ja isikuandmed: [docs/ORDERS.md](docs/ORDERS.md).

## Deploy

Testversioon: Vercel (<https://laptop-store-rouge.vercel.app>) + Neon PostgreSQL; iga push `main` harusse deploy'b automaatselt. Lõplik plaan (Phase 9): Docker Compose (`web`, `worker`, `db`, `nginx`) + Let's Encrypt tavalisel Linuxi VPS-il.

## Projekti struktuur

```
docs/                     plaan, arhitektuur, andmebaas
src/
  app/                    Next.js route'id
    (shop)/               avalik pood (avaleht, nimekiri, tooteleht, ostukorv, võrdlus …)
    admin/                admin (login + kaitstud (panel))
    api/search/           otsingu autocomplete
  components/             UI komponendid (ui, layout, product, catalog, home, cart, compare, search, seo)
  domain/                 puhas äriloogika: kataloog, filtrid, otsing, hinnastamine, seisukord, raha
  server/                 serveripoolsed teenused (kataloog, ostukorv, db, auth, admin, settings, logging)
  integrations/supplier/  SupplierAdapter liides, normaliseerimine, MockSupplierAdapter + testandmed
  integrations/icecat/    Icecati klient, vaste otsimine, pildivalik
  integrations/laptopid/  Laptopid.ee API klient, skeem, normaliseerimine, snapshot'i kontroll
  server/catalog-sync/    Laptopid.ee sync (lukk, käivitused, pildi mõõdud, cron-kaitse)
  server/images/          piltide import, töötlus, salvestusruum, Data Quality
scripts/                  käsurea tööriistad (icecat, db:*, admin:*)
drizzle/                  andmebaasi migratsioonid (SQL)
data/icecat/              Icecati vasted ja käsitsi kogutud identifikaatorid
  client/                 brauseripoolsed store'id (ostukorv, võrdlus)
  config/                 poe seaded, hinnareeglid, keskkonnamuutujad
```

## Testandmed

Kaustas [`src/integrations/supplier/mock/`](src/integrations/supplier/mock/) on **arenduse testandmed** (~45 sülearvutit). Mudelinimed on realistlikud, kuid hinnad, laoseisud ja muud numbrid on välja mõeldud. Need on imporditud andmebaasi; päris kataloogi (Laptopid.ee) kasutuselevõtul arhiveeritakse nende pakkumised (`npm run catalog:archive-mock`), kustutamata. Testid ja andmebaasita arendus kasutavad neid edasi. Prototüübirežiimis (admin → Seaded) kuvatakse hoiatusriba: kataloog (tooted, hinnad, saadavus) on päris, tellimused on testtellimused ja makseid ei võeta.
