# HANDOFF — üleandmine järgmisele Claude Code sessioonile

> Seis: **2026-10-11**, viimane commit `d1c1014`, haru `main` (= `origin/main`), working tree puhas.
> Live: <https://laptop-store-rouge.vercel.app> · GitHub: <https://github.com/rissu18/laptop_store>
> Kasutaja kirjutab eesti keeles; vasta eesti keeles. Projekt on 12. klassi praktiline lõputöö — dokumentatsioon (docs/, CHANGELOG.md) on osa tööst.

> **Uuendus (2026-10-11, hiljem):** valmis **päris kataloog Laptopid.ee API-st** (sync → PostgreSQL) — vt [LAPTOPID_SYNC.md](LAPTOPID_SYNC.md) ja CHANGELOG. 25 tabelit (migratsioon 0003), 305 testi. Admin → **Tarnijad** → Sync now; `npm run laptopid:sync`. Mock-pakkumised arhiveeritakse `npm run catalog:archive-mock -- --confirm`. Allpool olev tekst kirjeldab seisu enne seda tööd.

## 1. Eesmärk

Custom e-pood **kasutatud äriklassi sülearvutitele** (Lenovo ThinkPad, Dell Latitude, HP EliteBook), mis põhineb automaatselt sünkroniseeritaval hulgilaol (tulevikus **Foxway**). Ilma WordPressi/Shopify jms platvormita. Tooted praegu **mock-tarnijast** (46 pakkumist, 38 mudelit), mis on imporditud PostgreSQL-i. Pood on **prototüübirežiimis**: hoiatusriba, noindex, ainult testtellimused.

## 2. Tech stack

- **Next.js 16.4** (App Router, `cacheComponents: true`, `partialPrefetching: true`) + **React 19**, **TypeScript strict**
- **Tailwind CSS 4** (design tokenid CSS-muutujatena `src/app/globals.css`), lucide-react
- **zod 4** (kõik valideerimised), **Vitest** (`server-only` aliasitud stub'iks), **tsx** skriptidele (`--conditions=react-server`)
- **PostgreSQL (Neon)** + **Drizzle ORM 0.45** + drizzle-kit, draiver `pg`
- **sharp** (pilditöötlus), Open Icecat JSON API (pildid)
- Deploy: **Vercel** (push `main`-i → automaatne deploy), Vercel CLI: `npx --yes vercel@63.1.2 …` (projekt lingitud, `.vercel/`)
- Node 24 (min 22). Windows + PowerShell/Git Bash keskkond.

## 3. Arhitektuur (modulaarne monoliit)

```
src/
  app/(shop)/        avalik pood (avaleht, /sulearvutid, /toode/[slug], /ostukorv, /vordlus, /leia-sobiv, /tellimus, /info …)
  app/(checkout)/    /kassa (minimaalne päis)
  app/admin/         login + (panel)/… kaitstud admin
  components/        UI (admin/, cart/, checkout/, orders/, product/, layout/, ui/ …)
  domain/            PUHAS äriloogika, ei impordi server/app/components: catalog, pricing, discounts, checkout,
                     orders, shipping, settings, admin, time (Eesti aeg ↔ UTC), grade, money, images
  server/            server-only: db (skeem, klient, seed), catalog, auth, admin (DAL päringud + server action'id),
                     discounts, checkout, orders, settings, images (Icecat), payments (liides), logging
  integrations/      supplier (SupplierAdapter, MockSupplierAdapter, normaliseerimine), icecat
  client/            brauseri store'id (ostukorv, sooduskood, võrdlus — localStorage)
  proxy.ts           admini optimistlik kaitse (Next 16 "middleware")
scripts/             CLI: db:*, admin:*, icecat
drizzle/             migratsioonid 0000_init, 0001_discount_codes, 0002_orders
docs/                PROJECT_PLAN, ARCHITECTURE, DATABASE, ADMIN, DISCOUNTS, ORDERS, reports/
```

Põhimõtted: hinnad/summad arvutab **alati server**; raha **täisarvulised sendid**; puuduv tarnija väärtus = `NULL` (ei mõelda välja); admini muudatused **auditis samas tehingus**; staatused `text` + CHECK (mitte PG enum).

## 4. Valmis (faasid)

| Faas | Seis |
| --- | --- |
| 0 Analüüs, 1 UI prototüüp (filtrid, otsing, tooteleht, võrdlus, finder, hinnaliugur) | ✅ |
| 1b Icecati pildid kogu kataloogile (pildid Git'is `public/media/products`) | ✅ |
| 2 PostgreSQL + Drizzle, import, pood loeb DB-st | ✅ |
| 3 Admin-liides (auth, tooted, pildid, Icecat, andmekvaliteet, hinnastamine, seaded, logid, tervis) | ✅ |
| 3b Sooduskoodid | ✅ |
| 5a Kassa + tellimused **ilma makseta** (testtellimused) | ✅ — viimane faas |
| 4 Tarnija sync (Foxway), 5b tarneteenused, 6 maksed, 7 automaatika, 8–9 | ⏳ |

## 5. PostgreSQL / Neon / Drizzle

- **23 tabelit**: kataloog (`product_models`, `supplier_listings`, `product_images`, `product_identifiers`, `icecat_metadata`), admin (`admin_users`, `admin_sessions`, `login_attempts`, `audit_logs`, `system_logs`), seaded (`store_settings`, `pricing_rules`), sooduskoodid (`discount_codes`, `discount_manufacturers`, `discount_product_models`, `discount_supplier_listings`, `discount_redemptions`, `discount_validation_attempts`), tellimused (`orders`, `order_items`, `order_status_history`, `order_internal_notes`, `order_lookup_attempts`).
- Skeem: `src/server/db/schema.ts`. Ühendus: `src/server/db/client.ts` (`getDb()`, `createDb()`), URL-i lahendaja `src/server/db/database-url.ts` (sslmode → verify-full, ühendusstring redigeeritakse logides).
- Uus muudatus: `schema.ts` → `npm run db:generate -- --name=<nimi>` → vaata SQL üle → `npm run db:migrate`. Enne/pärast: `npm run db:counts`. **Migratsioonid on seni olnud ainult lisavad.**
- **Lokaalne arendus ja Vercel kasutavad SAMA Neoni andmebaasi** (live andmed!). Testandmed tuleb pärast käsitsi testi koristada.
- DB testid jooksevad päris Neonis **ajutises skeemis** `test_xxxx` (`src/test/test-db.ts`), mis kustutatakse; ilma `DATABASE_URL`-ita jäetakse vahele.
- Seis pärast viimast faasi: 38 mudelit, 46 pakkumist, 320 pilti, 0 sooduskoodi, 0 tellimust, 1 admin (kasutaja enda), 7 seadete võtit.
- Ilma DB-ta kasutab pood mock-andmeid (`catalog-service.ts`); admin vajab DB-d.

## 6. Admin-liides (`/admin`) — vt docs/ADMIN.md

- Auth: scrypt paroolid, DB sessioonid (küpsises juhuslik token, DB-s SHA-256), `__Host-admin_session` (httpOnly, Secure, SameSite=Strict, 8 h), login piirang (5/e-post, 20/IP, 15 min), `assertSameOrigin` CSRF. Kolm kaitsekihti: `src/proxy.ts` → `(panel)/layout.tsx` `requireAdmin()` → iga päring/action (`runAdminAction` → `requireAdminAction`).
- Admini kasutaja: **`npm run admin:create`** (varjatud parool või env), `admin:delete -- <email>`. Koodis vaikeparooli pole.
- Lehed: töölaud, tellimused, mudelid, konfiguratsioonid, pildid, andmekvaliteet, hinnastamine, sooduskoodid, seaded, tegevuslogi, logid, tervis. Kliendid/Tarnijad = „Tulekul“.
- Admini lehed: `export const instant = false` (Cache Components), päringud `src/server/admin/**/queries.ts` (kutsuvad ise `requireAdmin()`), action'id `src/server/admin/**/actions.ts`.

## 7. ProductModel / SupplierListing

- **ProductModel** (mudel, slug nt `lenovo-thinkpad-t14-gen-3`): pildid, identifikaatorid, kirjeldus, esiletõstmine. **SupplierListing** (konkreetne konfiguratsioon): CPU, RAM, SSD, seisukord, laoseis, ostuhind, müügihind. Avalik pakkumise ID = `${supplier}-${supplierProductId}` lowercase (nt `mock-ms-10231`), meie SKU `SP-10231`.
- **Tarnija väärtus + admini parandus**: tarnija veerud + `manual_overrides` JSONB; efektiivne väärtus = parandus ?? tarnija (`src/domain/catalog/overrides.ts`, `db-catalog-mapper.ts`). Sync/import kirjutab ainult tarnija veerge.
- Poes nähtav ainult: mudel + pakkumine ACTIVE, laoseis > 0, kohustuslikud väljad olemas.
- Pood: `'use cache'` + `cacheTag('catalog'|'settings')`; admini muudatus → `updateTag(...)` server action'is. Tellimuse admin-toimingud kasutavad `refresh()`.

## 8. Icecati pildid

- Pildid mudeli tasemel, Icecatist alla laaditud → thumbnail/medium/large WebP → `public/media/products/` (**Git'is**, Vercel serveerib). Hotlinki pole.
- Andmed DB-s (`product_images`, `icecat_metadata`), import `src/server/images/icecat-image-import.ts` + `DbImageRepository`.
- Admin: põhipilt, järjekord, peitmine, „Otsi uuesti“, käsitsi vaste eelvaatega, vaste eemaldamine. **Piltide allalaadimine ainult lokaalselt** (Vercelis pole püsivat salvestust; `!process.env.VERCEL`). Käsitsi üleslaadimine = „Tulekul“.
- Madala kindlusega vaste ei lähe kunagi automaatselt live'i (NEEDS_REVIEW).
- `npm run icecat` CLI kasutab VEEL vanu JSON-faile (`data/icecat`, `data/media`) — vt Known issues.

## 9. Sooduskoodid — vt docs/DISCOUNTS.md

- `evaluateDiscount()` (`src/domain/discounts/discount-engine.ts`) — **ainus** arvutuskoht (ostukorv, kassa, admini eelvaade, testid).
- Tüübid: PERCENTAGE (value = baaspunktid, + maksimum), FIXED_AMOUNT (sendid), FREE_SHIPPING. Kood tõstutundetu (`normalized_code` UNIQUE). Kehtivusala: kõik / tootjad / mudelid / konfiguratsioonid + välistused. Tegelik staatus (SCHEDULED/EXPIRED) arvutatakse. Marginaalikaitse `minimumAllowedPrice()` (hinnastamise miinimumkasum, vaikimisi sees).
- Ostukorv: brauser hoiab ainult koodi teksti; piirang 10 ebaõnnestunud / 10 min / IP. Kontroll EI suurenda kasutust; kasutus (`discount_redemptions`: reserve/confirm/cancel) tuleb päris tellimustega.

## 10. Kassa / tellimused — vt docs/ORDERS.md

- `/kassa` → `placeOrderAction` → `placeOrder()` (`src/server/orders/order-service.ts`): päritolu → zod vorm → **idempotentsus** (`checkoutAttemptId` räsi UNIQUE) → `computeCheckout()` (DB-st aktiivsus, hetkehind, laoseis, sooduskood uuesti, tarne seadetest) → kliendi nähtud ≠ arvutatud ⇒ **REVIEW** (tellimust ei looda) → üks tehing (orders + order_items snapshot + ajalugu).
- **Režiim**: prototüüp → TEST; prototüüp väljas ilma makseteenuseta → BLOCKED (`getConfiguredPaymentProvider()` = null). LIVE režiimi tellimusi praegu EI looda.
- Testtellimus: makset ei võeta, laoseis ei vähene, sooduskoodi kasutust ei looda, e-kirja ei saadeta (`NoopOrderNotificationService`).
- Number `SL-26-XXXXXX`. Kinnitusleht `/tellimus/[nr]/kinnitus` — httpOnly küpsis `order_access_<NR>` (token, DB-s räsi); `generateStaticParams` kohatäitjaga `SL-00-AAAAAA` (Cache Components nõue!). Otsing `/tellimus`: number + e-post, üldine vastus, piirang 10 / 15 min / IP.
- Admin: `/admin/orders` (+ detail): tühistamine (olekumasin `src/domain/orders/order-status.ts`), sisemärkmed (ainult lisamine), ajalugu, audit. PAID-i admin määrata ei saa.
- Tarne: üks meetod STANDARD, nimi/hind seadetest (vaikimisi 6,99 €), tasuta tarne piir seadetest.

## 11. Olulised arhitektuuriotsused

1. Drizzle (mitte Prisma 8 RC) — stabiilne, serverless'is kerge, SQL läbipaistev.
2. Tarnija veerud + `manual_overrides` → sync ei kirjuta admini parandusi üle.
3. DB sessioonid (mitte JWT) — saab kohe lõpetada.
4. Audit samas tehingus muudatusega.
5. Üks DiscountEngine; klient ei saada kunagi summasid.
6. OrderItem = snapshot; tellimus ei sõltu hiljem kataloogist.
7. Testtellimused eraldi (`is_test`), fail-safe kassa režiim.
8. Idempotentne tellimuse loomine (UNIQUE võti) + tehing.
9. Ajad DB-s UTC, admin Eesti ajas (`src/domain/time/tallinn.ts`).
10. Pildid Git'is kuni püsiva objektisalvestuseni (R13).

## 12. Keskkonnamuutujate NIMED (väärtusi mitte kunagi kuvada ega commit'ida)

- `DATABASE_URL`, `DATABASE_URL_UNPOOLED` — Vercel+Neon annab need nimedega **`database_DATABASE_URL`**, **`database_DATABASE_URL_UNPOOLED`** (lahendaja toetab mõlemat). Lokaalselt failis `.env.development.local` (`vercel env pull`), Git'is ei ole.
- `SITE_URL`
- `ICECAT_USERNAME`, `ICECAT_API_TOKEN`, `ICECAT_CONTENT_TOKEN` (lokaalselt `.env.local`; Vercelis seadistamata → Icecati toimingud seal välja lülitatud)
- `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD` — ainult `admin:create` käivitamise ajaks
- `LOG_LEVEL` (valikuline), Verceli: `VERCEL`, `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA`
- Prototüübirežiim EI OLE env — see on DB seadetes (admin → Seaded → Pood).

## 13. ÄRA muuda kogemata

- **Ära kuva/logi/commit'i saladusi** (DB URL, paroolid, tokenid, sessioonid). Kasutaja keelas ka küsida, et ta neid vestlusesse kleebiks.
- **Ära loo uut Neoni projekti/andmebaasi**; ära tee destruktiivseid migratsioone; live ja lokaalne jagavad DB-d.
- Ära lisa vaikeparooli/admin-kasutajat koodi; ära nõrgenda auth'i, CSRF-i, piiranguid.
- Ära lase kliendil saata hindu/summasid; ära kirjuta teist soodustuse arvutust.
- Ära muuda `PROTOTYPE`/kassa fail-safe'i nii, et päris tellimused avaneksid ilma makseteenuseta. Ära tee „fake“ makseviise.
- Ära muuda avaliku pakkumise ID-de, SKU-de ega tellimuse numbri vormingut (ostukorvid, lingid, tellimused sõltuvad).
- Ära eemalda `generateStaticParams` kohatäitjat kinnituslehelt ega `instant = false` admini lehtedelt (build/Cache Components).
- Drizzle'i alampäringus välise tabeli viide kirjuta täielikult kvalifitseerituna (`"orders"."id"`), kui päringus pole join'i.
- `"use server"` failid ekspordivad ainult async-funktsioone (konstandid eraldi failides).
- `AGENTS.md`: Next.js on uus versioon — loe enne Next-koodi `node_modules/next/dist/docs/`.
- Commit'id lõpevad: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Ära alusta Foxway'd ega makseid ilma kasutaja käsuta.

## 14. Known issues / TODO

- `npm run icecat` CLI kasutab veel JSON-faile (mitte `DbImageRepository`); üksikmudelid tehakse adminis.
- Püsiv pildisalvestus (R13, soovitus Cloudflare R2) puudub → admini piltide allalaadimine/üleslaadimine ainult lokaalselt.
- Icecati muutujad pole Vercelis seadistatud.
- Privaatsuspoliitika lõplik tekst, andmete säilitusaeg ja Neoni serveri regioon täpsustamata (ORDERS.md §14).
- Tarnehind 6,99 € on näidisväärtus (TODO: REAL PROVIDER DATA REQUIRED); ettevõtte andmed, garantii/tagastus seadetes täitmata.
- Marginaalikaitse piirab testandmete väikeste marginaalide tõttu protsendikoode (ootuspärane).
- Brauseri paan (Claude'i built-in browser) on sageli peidetud → React ei hüdreeru; enne JS-iga klikkimist tee screenshot (sunnib renderduse) ja oota.
- Dev-server võib näidata vana moodulit pärast suuri muudatusi → `preview_stop` + `preview_start`.
- Kliendikontod, arved, tagastused, tracking, e-kirjad — puuduvad (planeeritud).

## 15. Viimased commitid

```
d1c1014 docs(orders): ORDERS.md ja dokumentatsioon; fix: kinnituslehe build (Cache Components)
7347819 fix(orders): käsitsi testimisel leitud vead
a6756a8 test(orders): kassa, tellimuste, otsingu, admini ja turvalisuse testid (230 -> 265)
b6f3964 feat(admin): tellimused — nimekiri, detail, tühistamine, sisemärkmed, ajalugu, töölaud
d89e526 fix(tests): uued tarne seaded, tellimuste tabelid ja kasutuse välisvõti testides
3f6f5f1 feat(checkout): kassa, testtellimused PostgreSQL-is, kinnitusleht ja tellimuse otsing
f7bb5de docs+fix(discounts): DISCOUNTS.md, dokumentatsioon, mobiili ülevool ostukorvis
128bb9b feat(discounts): sooduskoodide süsteem (DiscountEngine, admin, ostukorv)
8018354 docs: PostgreSQL ja admin-liides
```

## 16. Testid ja kontrollid

- **265 testi / 26 faili — kõik läbivad** (`npm test`; DB testid vajavad `DATABASE_URL`-i ja võtavad ~1–2 min).
- `npm run typecheck` ✅ · `npm run lint` ✅ · `npm run build` ✅ (lokaalselt DB muutujatega: Git Bashis `set -a; . ./.env.development.local; set +a; npm run build`).
- Vercel deploy `d1c1014` → **Ready**; live pood, `/kassa`, `/tellimus` töötavad, `/admin/*` suunab login'i.

## 17. Working tree

Puhas (`git status` tühi) seisuga `d1c1014`; `main` = `origin/main`. (See HANDOFF.md fail commit'itakse eraldi.)

## 18. Viimane ülesanne

Faas **5a: kassa + tellimuste süsteem ilma makseteenuseta** — testtellimused PostgreSQL-is, serveripoolne arvutus, hinnamuutuse/laoseisu/koodi ülevaatus, idempotentsus, snapshot, kinnitusleht, avalik otsing, admini tellimused (tühistamine, märkmed, ajalugu), tarne seadetest, 35 uut testi, docs/ORDERS.md. Käsitsi testitud A–J (desktop + 375 px), testandmed koristatud. Kasutaja palus pärast seda **mitte alustada makseid ega Foxway'd** ilma uue käsuta.

## 19. Järgmine loogiline ülesanne (kasutaja otsustab)

1. **Makseteenus** (Montonio / Maksekeskus / Stripe): `PaymentProvider` implementatsioon, `CREATED → AWAITING_PAYMENT → PAID` webhook'iga (kontroll pakkuja API-st), `confirmRedemption`, LIVE režiimi avamine, tellimuse kinnituse e-kiri.
2. **Foxway tarnija sync**: `SupplierAdapter`, sync worker, SyncRun logid, hinnaajalugu, laoseisu reserveerimine, tarnija tellimus idempotentsusvõtmega.
3. Väiksemad: Icecati CLI → `DbImageRepository`, püsiv pildisalvestus (R2), pakiautomaadid, privaatsuspoliitika.
