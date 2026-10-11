# HANDOFF — üleandmine järgmisele Claude Code sessioonile

> Seis: **2026-10-11 õhtu**, haru `main` (= `origin/main`). Live: <https://laptop-store-rouge.vercel.app> · GitHub: <https://github.com/rissu18/laptop_store>
> Kasutaja kirjutab eesti keeles; vasta eesti keeles. Projekt on 12. klassi praktiline lõputöö — dokumentatsioon (docs/, CHANGELOG.md) on osa tööst.
> Projekti püsireeglid: **AGENTS.md** (ainus juhiste fail; CLAUDE.md on sinna ühendatud ja kustutatud).

## 1. Eesmärk

Custom e-pood **kasutatud äriklassi sülearvutitele** (Sülearvutid.ee), ilma WordPressi/Shopify jms platvormita. Päris kataloog tuleb **Laptopid.ee API-st** (sync → PostgreSQL). Pood on **prototüübirežiimis**: hoiatusriba, noindex, ainult testtellimused, makseid pole.

## 2. Tech stack

- **Next.js 16.4** (App Router, `cacheComponents`, `partialPrefetching`) + **React 19**, **TypeScript strict** — enne Next-koodi loe `node_modules/next/dist/docs/` (AGENTS.md)
- **Tailwind CSS 4** (tokenid `src/app/globals.css`), lucide-react, **zod 4**, **Vitest**, **tsx** skriptidele (`--conditions=react-server`)
- **PostgreSQL (Neon)** + **Drizzle ORM 0.45**, draiver `pg`; **sharp**; Open Icecat
- **Vercel Hobby** (push `main` → automaatne deploy). CLI: `npx --yes vercel@63.1.2 …` (projekt lingitud, `.vercel/`)
- Node 24. Windows + PowerShell/Git Bash.

## 3. Arhitektuur (modulaarne monoliit)

```
src/
  app/(shop)/, app/(checkout)/   avalik pood + kassa (wrapper .storefront = poe värvisüsteem)
  app/admin/                     login + (panel)/… kaitstud admin (oma :root värvid)
  app/api/                       search, products (admini diagnostika), cron/laptopid-sync
  components/                    UI
  domain/                        puhas äriloogika (catalog, availability, grade, pricing, discounts, checkout, orders …)
  server/                        server-only: db, catalog, catalog-sync, auth, admin, discounts, checkout, orders, settings, logging
  integrations/                  laptopid (klient, config, skeem, normaliseerija, snapshot), supplier (mock), icecat
  client/                        brauseri store'id (ostukorv, sooduskood, võrdlus)
scripts/                         db:*, admin:*, laptopid:sync, catalog:archive-mock, icecat
drizzle/                         migratsioonid 0000–0003 (kõik lisavad)
docs/                            PROJECT_PLAN, ARCHITECTURE, DATABASE, ADMIN, DISCOUNTS, ORDERS, LAPTOPID_SYNC, HANDOFF
```

**PostgreSQL on poe tööaegne tõeallikas.** Laptopid.ee API on upstream tõeallikas, aga pood / otsing / ostukorv / kassa / tellimused loevad ainult andmebaasi (`catalog-service`, `computeCheckout`). Raha arvutab ainult server (täisarvulised sendid).

## 4. Valmis

| Faas | Seis |
| --- | --- |
| 0 analüüs, 1 UI, 1b Icecati pildid, 2 PostgreSQL, 3 admin, 3b sooduskoodid, 5a kassa + testtellimused | ✅ |
| **4a Laptopid.ee päris kataloog** (sync, saadavus, tarnija hind + parandus, pildid, admin Tarnijad) | ✅ |
| Poe värvisüsteem indigo-sinine (`.storefront` tokenid), avalehe hero pilt `public/brand/hero.png` | ✅ |
| Järelparandus: seisukord "Uus", Lenovo V-seeria, `LAPTOPID_API_BASE_URL` | ✅ |
| Juriidiline info / garantii / kontaktid Laptopid.ee live-lehe põhjal (`src/config/company.ts`, `src/config/info-pages.ts`; e-post ainult info@sylearvutid.ee) | ✅ |
| Production-cleanup: prototüübiriba (kataloog live), ausad maksetekstid, cron-otspunkt + `CRON_SECRET` Vercelis, admini stale-sync hoiatus | ✅ |
| 4 Foxway, 5b tarneteenused, 6 maksed, 7 automaatika, 8–9 | ⏳ (ära alusta ise) |

## 5. Laptopid.ee API ja sync — praegune seis

Täielik kirjeldus: **docs/LAPTOPID_SYNC.md**.

- **305 / 305** Laptopid toodet aktiivsed poes (`supplier = 'laptopid'`, ACTIVE, `available = true`); viimane sync: 305 saadud, 0 vahele jäetud, 0 hoiatust.
- Otspunktid: `products.php` + `images.php` päisega `X-API-Key`; vastus on paljas massiiv (`no-store`, ilma `snapshot_complete` markerita).
- **Seadistus:** `LAPTOPID_API_BASE_URL` (Config, `https://laptopid.ee/api/sulearvutid/`) + `LAPTOPID_API_KEY` (Secret). Klient ehitab `new URL("products.php", base)` / `images.php` (`src/integrations/laptopid/laptopid-config.ts`). Puuduv seadistus → kontrollitud viga, tagavara-URL-i pole. Vana ühe-URL-iline muutuja eemaldatud Vercelist ja koodist. `NEXT_PUBLIC_LAPTOPID_*` muutujaid pole.
- Sync: DB-lukk (`catalog_sync_runs`), võrgutööd enne tehingut, kõik kirjutamised ühes tehingus, idempotentne (identne vastus → 0 muudatust).
- **Identiteet:** `supplier = 'laptopid'` + Laptopid ID (UNIQUE); avalik ID `laptopid-6678`, SKU `LP-6678`. Slug ei ole identiteet.
- **Mudelid:** kanooniline nimi (ThinkPad "G3" → "Gen 3", "2in1" → "2-in-1") → slug; vaste ainult täpselt sama slug, muidu uus mudel. Pealkiri: `productTitle()` (`src/domain/catalog/title.ts`).
- **Lenovo V-seeria:** konservatiivne muster ainult Lenovole (V330-14IKB, V340-17IWL, V14…, V15…) → seeria `V Series`, mudel `V330-14IKB`, pealkiri **"Lenovo V330-14IKB"** (ID 1670). Tundmatu seeria (tootja + mudel korras) → tagavara-seeria + hoiatus (`taxonomyWarnings`), toodet välja ei visata.
- **Seisukord "Uus":** Laptopid `New` / `Demo` / `Outlet` → meie klass `NEW` (kliendile "Uus", filtris esimesena; praegu 19 toodet: 13/5/1). Tarnija algne klass säilib `details.sourceGrade` + `raw_data`; admin näeb "Seisukord (tarnija algne)". Klassid: `src/domain/grade/grades.ts`, vastendus `mapLaptopidGrade`.
- **Saadavus:** Laptopid nimekirjas = vähemalt 1 tk füüsiliselt laos, **täpne kogus teadmata** → `available = true`, `stock = NULL`. Poes "Kohe saadaval" (mitte "1 tk"); ostukorvis/kassas 1 tk rea kohta + selgitus. Reeglid: `src/domain/catalog/availability.ts`.
- **Täielik snapshot:** puuduv toode → `available = false` ainult usaldusväärse vastusega (puuduvaid ≤ max(10, 25%)); API viga / vigane vastus → kataloog jääb samaks. Admin saab "Luba suur muutus".
- **Hinnad:** `sale_price` → müügihind (`price_source = SUPPLIER`); `new_price` ainult kontekst; ostuhind `NULL`; hinnastamismootor neid ei puuduta.
- **Pildid:** pakkumise tasemel `listing_images` (1135 kaug-URL-i laptopid.ee-st, Git'i ei laeta), kuvamine Next/Image kaudu (`remotePatterns` ainult `laptopid.ee/images/product/**`). 4 pilti on Laptopid.ee poolel 404.
- **Käivitamine:** admin → Tarnijad → **Sync now**; `npm run laptopid:sync`; `GET /api/cron/laptopid-sync` (`Authorization: Bearer <CRON_SECRET>`; 401 vale/puuduv, 503 seadistamata, 200 SUCCESS/BUSY, 502 FAILED). `CRON_SECRET` on Vercelis **Secret** tüübina (Production/Preview/Development, lisatud 2026-10-11, väärtus pole loetav — välise ajastaja seadistamisel genereeri uus ja pane korraga Vercelisse + ajastajasse). `vercel.json`-is igapäevane Vercel Cron (Hobby lubab ainult kord päevas). **Aktiivne: Upstash QStash iga 5 min** (schedule `scd_696gjRsEk4PkPVQdGeFCn4qGKqco`, `CRON_SECRET` roteeritud 2026-10-11; QStashi token ainult kohalikus `.env.local`) — vt LAPTOPID_SYNC.md §13.
- **Admin → Tarnijad → "Sync'i seis":** viimane edukas sync + vanus, viimase käivituse tulemus, arvud; üle 15 min → hoiatus "Automaatne sünkroonimine ei ole ajakohane." (ainult adminis; kuni ajastajat pole, on see ootuspäraselt nähtav). CLI sync ei tühjenda deploy'tud poe vahemälu — siis vajuta adminis "Sync now".
- Mock-kataloog: 46 pakkumist `ARCHIVED` (alles testide jaoks), mitte poes.

## 6. Admin, parandused, sooduskoodid, kassa

- **Admin** (`/admin`, vt docs/ADMIN.md): scrypt, DB-sessioonid, CSRF päritolu, piirangud; kaitse proxy → layout → iga päring/action. Admin luuakse `npm run admin:create` (koodis vaikeparooli pole). Live'is 1 admin (kasutaja enda).
- **Admini parandused:** tarnija veerud + `manual_overrides`; kehtiv = parandus ?? tarnija. Sync ei puuduta parandusi, `status`-t ega admini välju. Tarnija hinnaga pakkumisel on müügihind tarnija väli ja admini hind parandus ("Taasta" viib tagasi).
- **Sooduskoodid** (docs/DISCOUNTS.md): üks `evaluateDiscount()`; ostuhinnata pakkumistel marginaalikaitse ei rakendu ("kontrollimata"). Live'is 1 arhiveeritud testkood `LAPTOPIDTEST` (kasutusi 0).
- **Kassa ja tellimused** (docs/ORDERS.md): `computeCheckout` loeb DB-st (hind, saadavus, kood, tarne), hinnamuutus → ülevaatus; idempotentne loomine; OrderItem = snapshot (sh seisukord). Live'is 1 testtellimus `SL-26-PN46CU` (mock-toode, loodud 09:48 UTC enne Laptopid tööd).
- **Prototüübirežiim** (admin → Seaded → Pood): sees → ainult TEST tellimused; väljas ilma makseteenuseta → kassa suletud (BLOCKED). Päris makseid pole.
- **Kliendile nähtavad prototüübi tekstid** (`src/domain/storefront/storefront-notices.ts`): riba "Prototüüp: toodete, hindade ja saadavuse andmed on live. Tellimused on testtellimused — makseid ei võeta ja tellimusi ei täideta." Usaldusriba makse-punkt kuvatakse kuni LIVE kassani kui "Makseviisid — Makseviisid lisanduvad poe avamisel" (admini DB tekst jääb alles), tootelehe "Turvaline maksmine" ainult LIVE režiimis.
- **Icecat:** mudeli piltide varu-/rikastusallikas (`product_images`, `icecat_metadata`); ei kirjuta pakkumise konfiguratsiooni üle. Kuvamine: pakkumise pildid → mudeli pildid → illustratsioon.

## 7. Andmebaas (live Neon — lokaalne ja Vercel jagavad SAMA andmebaasi!)

- 25 tabelit (+ `__drizzle_migrations`), migratsioonid 0000–0003 — kõik lisavad. Uus muudatus: `schema.ts` → `npm run db:generate -- --name=…` → vaata SQL üle → `npm run db:migrate`; enne/pärast `npm run db:counts`.
- Hetkel: 177 mudelit, 351 pakkumist (305 laptopid ACTIVE + 46 mock ARCHIVED), 1135 pakkumise pilti, 320 mudeli pilti.
- DB testid jooksevad ajutises skeemis `test_xxxx` (`src/test/test-db.ts`).
- Keskkonnamuutujate **nimed** (väärtusi ära kuva): `database_DATABASE_URL`, `database_DATABASE_URL_UNPOOLED`, `SITE_URL`, `LAPTOPID_API_BASE_URL`, `LAPTOPID_API_KEY`, `CRON_SECRET` (seadistamata), `ICECAT_*` (ainult lokaalselt). Lokaalselt `.env.development.local` (`vercel env pull`) + `.env.local`.

## 8. Testid ja kontrollid

- **349 testi / 35 faili — kõik läbivad** (`npm test`, DB testidega ~45 s).
- `npm run typecheck` ✅ · `npm run lint` ✅ · `npm run build` ✅ (Git Bashis: `set -a; . ./.env.development.local; . ./.env.local; set +a; npm run build`).
- Dev-serveri vana CSS/moodul (Turbopacki vahemälu) → peata server, kustuta `.next`, käivita uuesti.
- Brauseripaan on sageli peidetud → React ei hüdreeru / Suspense segmendid jäävad `hidden` alla; kasuta `textContent`/`find`, mitte `innerText`, või tee enne kuvatõmmis.

## 9. Viimased olulised commitid

```
<see commit>  chore: production-cleanup — prototüübiriba, ausad maksetekstid, cron-otspunkti testid, admini stale-sync hoiatus
e92ee35  docs: consolidate project instructions and refresh handoff
a77e106  fix(laptopid): "Uus" seisukord, Lenovo V-seeria ja LAPTOPID_API_BASE_URL
e2c4a52  style(home): hero pilt public/brand/hero.png illustratsiooni asemel
726bfe2  style: refresh storefront with indigo blue color system
f1a25c5  fix(search): "G10" leiab ThinkPadi "Gen 10" (Laptopid.ee kirjapilt)
65c9e71  feat(catalog): päris kataloog Laptopid.ee API-st (sync → PostgreSQL)
```

Viimane edukas Vercel production deploy enne seda handoff'i: `a77e106` → **Ready** (laptop-store-iev1ukir9). Handoff-commit'i deploy staatus: vt `npx --yes vercel@63.1.2 ls laptop-store`.

## 10. Teadaolevad TODO-d

- 5-minutiline automaatne sync töötab Upstash QStashiga (tasuta plaan, 288 sõnumit/päev); Verceli igapäevane cron on varuvõrk.
- Laptopid pildid on märgitud illustratiivseteks (pole kinnitatud, et foto on müüdavast eksemplarist).
- Hobby pildioptimeerimise limiit 5000 teisendust/kuus (üle selle → illustratsioon); Hobby on Verceli tingimustes mitteäriline.
- `battery_hours` salvestatakse, aga ei kuvata (tähendus kinnitamata).
- Seisukordade A+/A/B/C kirjeldused on veel näidistekstid (`isPlaceholder`).
- `npm run icecat` CLI kasutab veel JSON-faile; püsiv pildisalvestus (R13) puudub.
- Juriidilised lehed täidetud Laptopid.ee live-sisu põhjal; lahtised vastuolud allikas (puhastus 35 € vs 25 €, tarneaeg 1–10 vs 2 tööpäeva, puuduv "lisa nr 1", poolik p 7.5) — vt CHANGELOG. Tarnehind kassas (6,99 €) on endiselt näidis. Admini "Üldine" ettevõtte väljad poes ei kuvata (allikas `src/config/company.ts`). "Meist" leht on veel kohatäide.
- Live'is on 1 vana testtellimus ja 1 arhiveeritud testkood (vt §6).

## 11. Mida järgmine sessioon EI TOHI omal algatusel alustada

- Foxway integratsioon, maksed / makseteenus, LIVE režiimi avamine, e-kirjad, kliendikontod.
- Storefronti redesign või admini ümberkujundamine.
- Vercel plaani / env muutujate muutmine, `CRON_SECRET`-i loomine, väliste ajastajate (GitHub Actions jms) lisamine.
- Destruktiivsed migratsioonid, uue Neoni projekti loomine, andmete kustutamine.
- Saladuste kuvamine/logimine/commit'imine; kasutajalt paroolide küsimine.

## 12. Järgmise töö soovitused (ainult soovitused — kasutaja otsustab)

1. (Tehtud: QStash 5-min sync.) Jälgi admin → Tarnijad "Sync'i seis"; QStashi tõrke korral ilmub stale-sync hoiatus.
2. Seisukorra klasside päris kirjeldused ja "Uus" täpsustus (kas Demo/Outlet märkida tootelehel eraldi).
3. Makseteenuse faas (Montonio / Maksekeskus / Stripe) koos LIVE režiimiga.
4. Väiksemad: privaatsuspoliitika ja ettevõtte andmed, püsiv pildisalvestus (R2), Icecati CLI → `DbImageRepository`, pakiautomaadid.
