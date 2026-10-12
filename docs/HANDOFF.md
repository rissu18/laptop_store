# HANDOFF — üleandmine järgmisele Claude Code sessioonile

> Seis: **2026-10-12**, haru `main` = `origin/main`. Live: <https://laptop-store-rouge.vercel.app> · GitHub: <https://github.com/rissu18/laptop_store>
> Kasutaja kirjutab eesti keeles; vasta eesti keeles. Projekt on 12. klassi praktiline lõputöö — dokumentatsioon (docs/, CHANGELOG.md) on osa tööst.
> Püsireeglid: **AGENTS.md** (ainus juhiste fail). Detailid: docs/LAPTOPID_SYNC.md, **TECH_SYNC.md**, ARCHITECTURE.md, DATABASE.md, ADMIN.md, ORDERS.md, DISCOUNTS.md, PROJECT_PLAN.md.

## 1. Projekt

Custom e-pood **kasutatud äriklassi sülearvutitele** — **Sülearvutid.ee** (müüja Sülearvutid OÜ, sama ettevõte mis Laptopid.ee). Ilma WordPressi/Shopify jms platvormita. Päris kataloog tuleb **kahest tarnijast**: **Laptopid.ee API** ja **Techi Google Sheetsi hinnakiri** (mõlemad sync → PostgreSQL). Pood on **prototüübirežiimis**: hoiatusriba, noindex, ainult testtellimused, päris makseid pole.

## 2. Tech stack ja arhitektuur

- **Next.js 16.4** (App Router, `cacheComponents`) + **React 19**, **TypeScript strict** — enne Next-koodi loe `node_modules/next/dist/docs/` (AGENTS.md). **Tailwind 4** (tokenid `src/app/globals.css`, poe värvid `.storefront` plokis), zod 4, Vitest, tsx.
- **PostgreSQL (Neon) + Drizzle 0.45**. **Lokaalne arendus ja Vercel kasutavad SAMA live-andmebaasi** — kirjuta andmebaasi ainult teadlikult.
- **Vercel Hobby** (push `main` → automaatne deploy; CLI `npx --yes vercel@63.1.2 …`). **Upstash QStash** käivitab sync'i. Node 24, Windows (PowerShell / Git Bash).
- Modulaarne monoliit: `src/domain` (puhas äriloogika), `src/server` (server-only: db, catalog, catalog-sync, auth, admin, checkout, orders …), `src/integrations` (laptopid, tech, supplier/mock, icecat), `src/components`, `src/client` (brauseri store'id), `src/config` (company, info-pages). Migratsioonid `drizzle/0000–0004` (kõik lisavad), 27 tabelit. XLSX lugemiseks **ExcelJS 4.4.0** (`serverExternalPackages`, ainult server).
- **PostgreSQL on poe tööaegne tõeallikas.** Pood, otsing, ostukorv, kassa ja tellimused loevad ainult andmebaasi (`catalog-service`, `computeCheckout`) — mitte kunagi Laptopid.ee API-d ega Google Sheetsi. Raha arvutab ainult server (täisarvulised sendid).

## 3. Olulised äri- ja andmereeglid

- **ProductModel ≠ SupplierListing.** Mudel = tootja/seeria/mudel + mudeli pildid; pakkumine = konkreetne müüdav konfiguratsioon (CPU, RAM, SSD, seisukord, hind, saadavus). Sama mudeli konfiguratsioonid jäävad **eraldi kaartideks**.
- **Tarnija andmed on konfiguratsiooni tõeallikas.** Puuduv tarnija väärtus jääb **NULL**-iks — vaikeväärtusi ei leiutata.
- **Admini parandused** (`manual_overrides`; kehtiv = parandus ?? tarnija) elavad sync'i üle. Sync ei puuduta `manual_overrides`, `status`, `featured`, `description`.
- **Saadavus** (`src/domain/catalog/availability.ts`): Laptopid toode nimekirjas → `available = true`, täpne `stock = NULL`. Teadmata kogust **ei näidata ega käsitleta kui "1 tk"** (poes "Kohe saadaval"); automaatselt saab tellida **max 1 tk pakkumise kohta** (rohkema korral selgitus).
- **Hinnad:** Laptopid `sale_price` = müügihind (`price_source = SUPPLIER`), **ei ole ostuhind** — `supplier_price_cents` jääb NULL; `new_price` ainult kontekst. Hinnastamismootor neid ei puuduta; sooduskoodi marginaalikaitse on "kontrollimata".
- **Seisukord:** Laptopid `New` / `Demo` / `Outlet` → meie `NEW` ("Uus"); tarnija algne klass säilib (`details.sourceGrade`, `raw_data`), admin näeb seda. A+/A/B/C kirjeldused on veel näidistekstid.
- **Lenovo V-seeria** (nt ID 1670 V330-14IKB → seeria `V Series`, pealkiri "Lenovo V330-14IKB"); tundmatu seeria → tagavara-seeria + hoiatus, toodet välja ei visata.
- **Lenovo kuvanimi `Gen N` → `GN`** (`src/domain/catalog/display-name.ts`) **ainult kliendile kuvamisel** (kataloogi mapper: kaart, tooteleht, võrdlus, ostukorv, kassa, tellimuse snapshot). Andmebaasi mudelinimi, slug, SKU, Laptopid ID ja sync'i mudelite sobitamine jäävad **`Gen N`** kujule (muidu tekiks duplikaate). Otsing leiab mõlemad ("T14 G4" ja "T14 Gen 4").
- **Icecat** = mudeli piltide / rikastuse varuallikas (`product_images`, `icecat_metadata`); ei kirjuta kunagi pakkumise CPU/RAM/SSD/seisukorda jms üle. Pildid: **Laptopid pakkumise pildid (`listing_images`) esmased → mudeli (Icecat) pildid → illustratsioon** (`imagesForDisplay`).

- **Tech (teine tarnija):** iga hinnakirja rida = füüsiline seade (`supplier_inventory_units`: Tech ID + seerianumber, **ainult admin**). Sama konfiguratsiooni + hinnaga müügis seadmed = üks SupplierListing, **täpne laoseis** ("Partnerlaos 4 tk"). Brand/Model lahtri värv = müüdud. Seisukord **B**, hind **M + 60 €**, ostuhind **M − 20 €**, KM **MARGIN**, tarne **1–2 tööpäeva** (pakkumise `delivery_min/max_days`), garantii NULL. Defekt / tundmatu märkus / tahvel / detachable / vigased andmed / mitte-SSD → välja. Täpselt: docs/TECH_SYNC.md.
- **Mudeli piltide varu:** kui mudelil Icecati pilte pole, kasutatakse sama mudeli teise müügis pakkumise tarnija pilte (nt Techi pakkumisel Laptopid.ee fotod).

## 4. Laptopid.ee sync — praegune seis

Täielik kirjeldus: **docs/LAPTOPID_SYNC.md**.

- **305 / 305** Laptopid pakkumist ACTIVE + `available = true` (kontrollitud 2026-10-11); 177 mudelit; 46 mock-pakkumist ARCHIVED (testide jaoks, poes pole).
- API: `products.php` + `images.php`, päis `X-API-Key`; seadistus `LAPTOPID_API_BASE_URL` (Config) + `LAPTOPID_API_KEY` (Secret).
- Sync: DB-lukk (`catalog_sync_runs`; samaaegne → BUSY), võrgutööd enne tehingut, üks tehing, idempotentne; API viga / vigane vastus → kataloog jääb samaks; puuduvad tooted maha ainult usaldusväärse snapshot'iga.
- **Automaatne sync: Upstash QStash, prototüübi ressursisäästlik ajastus (Eesti aeg, `CRON_TZ=Europe/Tallinn`):** 08:00–23:30 iga 30 min (schedule `scd_696gjRsEk4PkPVQdGeFCn4qGKqco`, `*/30 8-23 * * *`) ja 00:00–06:00 iga 2 h (`scd_76f6zhpjE9tY9t4yedt6aR67Q94x`, `0 0-6/2 * * *`) — 36 käivitust ööpäevas (enne iga 5 min = 288), et säästa Neoni compute'i; enne päris poe avamist vaata sagedus üle. → `GET /api/cron/laptopid-sync` päisega `Authorization: Bearer <CRON_SECRET>` (401 vale/puuduv, 503 seadistamata, 200 SUCCESS/BUSY, 502 FAILED), korduskatseid 0. **Verceli igapäevane cron** (`vercel.json`, 03:00 UTC) on varuvõrk.
- `CRON_SECRET` on Vercelis Secret-tüüpi (roteeritud 2026-10-11, väärtust ei saa lugeda). QStashi token (`QSTASH_TOKEN`, `QSTASH_URL`) on ainult kohalikus `.env.local` failis schedule'i haldamiseks.
- Käsitsi: admin → Tarnijad → **Sync now** (tühjendab ka poe vahemälu) või `npm run laptopid:sync`. Admin → Tarnijad → "Sync'i seis" näitab hoiatust "Automaatne sünkroonimine ei ole ajakohane.", kui edukas sync on Eesti aja järgi päeval (08–00) üle 45 min või öösel (00–08) üle 150 min vana (ainult adminis).

## 4b. Tech hinnakirja sync — praegune seis

Täielik kirjeldus: **docs/TECH_SYNC.md**.

- Allikas `TECH_SHEET_URL` (Config, Vercel Production/Preview/Development + `.env.local`) → **XLSX** (mitte CSV). Tabid: `Used Laptops `, `Laptops 2` tervikuna; `Laptops 3` ja `Incoming …` ainult "Laptops" sektsioon; Monitors/Desktops/Parts ignoreeritakse.
- Seis 2026-10-12: 730 sülearvuti rida → müüdud 248, ei ole sülearvuti 106, defekt 9, tundmatu märkus 31, vigased 12 → **324 müügis seadet, 203 pakkumist poes** (206 andmebaasis, 3 laoseisuga 0); 712 seadet tabelis; 140 mudelit (45 olemasolevat, 95 uut; rikastus puudub 96-l). Poes kokku 508 sülearvutit (305 Laptopid + 203 Tech).
- Kasutaja otsused (2026-10-12): `e/g/f/w/p` ignoreeritakse; tahvlid **ja** detachable'id (Surface Go/Pro/Book, Elite x2, CF-33 …) välja; KM režiim MARGIN; `5g` = 5G tunnus.
- Käivitamine: admin → Tarnijad → Tech → **Sync now**; `GET /api/cron/tech-sync` (CRON_SECRET); `npm run tech:sync`; **`npm run tech:sync -- --dry-run`** (ainult lugemine, raport seerianumbriteta). Eraldi DB-lukk (allikas TECH).
- **QStash (Europe/Tallinn, loodud 2026-10-12):** `tech-daytime-sync` `scd_7hqHyNqCKnHByUNQWUeNp1xW6RAk` (`0 10-20 * * 1-5`, E–R 10–20 iga täistund) ja `tech-nightly-sync` `scd_65FBLYuSP43Y4143US4v6XSMt8eP` (`0 3 * * *`). GET `/api/cron/tech-sync`, edastatud `Authorization: Bearer <CRON_SECRET>` (sama mis Laptopid schedule'itel, kopeeritud kuvamata), korduskatseid 0, timeout 300 s. Kontrollitud: ühekordne QStashi sõnum → DELIVERED HTTP 200, `catalog_sync_runs` TECH CRON SUCCESS. Laptopid.ee schedule'id muutmata.
- Seerianumbrid: admin konfiguratsiooni leht (seadmete nimekiri) ja tellimuse leht (`order_item_units`, admin määrab). Testtellimus ei kuluta laoseisu. Kliendile ei kuvata (testitud + live-HTML 0 tabamust).

## 5. Storefront, kassa, sisu

- **Disaini suund (2026-10-12):** *äriklassi sülearvutite spetsialist + päris suur Tallinna salong*. Indigo `#2F4EE0` + väga hele sinakashall canvas `#F6F7FB` (valged kaardid), salongifotod `public/brand/showroom/*.webp` (register `src/components/brand/showroom-photos.ts`; originaalid `pildid/` on gitignore'is). Avaleht: hero salongifotoga → usaldusriba → "Milleks sülearvutit vajad?" (→ olemasolev leidja `?eesmark=`) → parimad pakkumised → äriklassi seeriad → salongiplokk → viimati lisatud → kontakt. **Tooteleht desktopis: info vasakul (45%), galerii paremal (55%, kleepuv)**; mobiilis eraldi järjestus (nimi → seisukord → galerii → hind/ost → konfiguratsioonid → andmed). "Miks valida see mudel?" = deterministlikud reeglid (`domain/catalog/model-fit.ts`). Menüüs "Salong ja kontakt". Usaldusribal ei väideta garantii pikkust ega "20-punkti kontrolli" (pole kinnitatud). Prototüübiriba: "toodete, hindade ja saadavuse andmed on live. Tellimused on testtellimused …". **noindex** aktiivne.
- **Tootekaardid:** mitme pildiga kaardil mobiilis pühkimine (scroll-snap), desktopil hover-nooled; pühkimine/nool ei ava tootelehte, puudutus/klõps avab; ühe pildiga kaardil navigeerimist pole; laetakse nähtav pilt + naabrid (`product-card-images.tsx`, `card-gallery-logic.ts`).
- **Võrdlus (mobiil):** leht ei veni enam horisontaalselt (kerimisala `relative` — lahtrite absoluutsed `sr-only` elemendid venitasid lehte), sticky veerg ekraani servas, z-index parandatud. Erinevad väärtused pehmete taustadega rühmiti (sama väärtus = sama toon, `--store-diff-1..4`), võrdne rida neutraalne (`compare-diff.ts`).
- **Filtrid** (`facets.ts`, `cpu-filter.ts`): Lenovo ThinkPadi alamseeriad tuletatakse mudelinimest (live'is E/L/P/T/X/X1/X13 + ThinkBook, V-seeria, Yoga); vana `?series=thinkpad` töötab edasi. CPU perekond/põlvkond tuleb andmebaasist, puudumisel tuletatakse CPU nimest (Apple M2 / M2 Pro, Core Ultra 9, Ryzen AI 7) — valikud genereeritakse kataloogist, mitte hardcode'itud nimekirjast. Põlvkonnad tootja kaupa, uuem eespool (numbriliselt).
- **Kassa ja tellimused** (docs/ORDERS.md): `computeCheckout` arvutab serveris (hind, saadavus, kood, tarne); hinnamuutus → ülevaatus; idempotentne loomine; **OrderItem = muutumatu snapshot**. Režiimid TEST / LIVE / BLOCKED; makseteenust pole (`getConfiguredPaymentProvider()` → null), seega ainult **testtellimused** (live'is 1). Kohustuslik märkeruut „Olen tutvunud ja nõustun E-poe tingimustega.“ — kontroll ka serveris (`acceptTerms` skeemis → `placeOrderAction`), nõustumist tellimusse ei salvestata.
- **Sooduskoodid** (docs/DISCOUNTS.md): üks `evaluateDiscount()`; kasutuste reserveerimine/kinnitamine/vabastamine (`reserveRedemption` / `confirmRedemption` / `cancelRedemption`) on valmis; **testtellimus kasutust ei loo**.
- **Tarne:** tarneaeg kõikjal **1–10 tööpäeva**; kassa tarnehind **6,99 € on näidis** (otsustamata).
- **Juriidiline sisu ja kontaktid** (`src/config/company.ts`, `src/config/info-pages.ts`): Laptopid.ee live-sisu põhjal (E-poe tingimused, Garantii, Tarne, Tagastamine, Isikuandmed ja privaatsus, Kontakt). Kliendile nähtav e-post **ainult `info@sylearvutid.ee`**. Meist: Ristjan Rikk — Developer, Virgo Rikk — Developer. Privaatsusleht kirjeldab tegelikku salvestust (juurdepääsuküpsis, localStorage ostukorv/võrdlus/sooduskood, sessionStorage kassakatse); **analüütikat ega jälgimist pole**. Tolmust puhastamise hind on mõlemalt lehelt eemaldatud (vastuolu 35 € / 25 € kadus).
- Ettevõtte andmed tulevad `company.ts`-ist — admini Seaded → "Üldine" ettevõtte välju poes ei kuvata.

## 6. Testid ja kontrollid

- **502 testi / 49 testifaili — kõik läbivad** (`npm test`, DB testid päris Neonis ajutises skeemis `test_xxxx`, ~45 s).
- `npm run typecheck` ✅ · `npm run lint` ✅ · `npm run build` ✅ (Git Bashis: `set -a; . ./.env.development.local; . ./.env.local; set +a; npm run build`).
- Viimane production deploy: storefronti värskendus (HEAD, vt `git log`) — kontrolli Verceli staatust.
- Dev-serveri vana CSS (Turbopacki vahemälu) → peata server, kustuta `.next`, käivita uuesti. `next start` ei loe `.env.development.local` faili (kassa/DB ei tööta) — brauseris testimiseks kasuta `dev`. Brauseripaan on sageli peidetud → Suspense jääb `hidden` alla ja `requestAnimationFrame`/kerimissündmused ei käi; tee enne kuvatõmmis.

## 7. Viimased commitid

```
(HEAD)   perf: jõudluse sprint (SQL-filtrid + LIMIT, otsene tooteleht, /api/catalog) — 4 commit'i, vt git log
40d1451  feat(storefront): sülearvutispetsialist + salong — hero foto, leidja, seeriad, info vasakul / galerii paremal
1224031  docs: Tech sync'i QStash ajastus (tööpäeviti 10–20 + öösel 03:00) ja deploy kontroll
6d67317  feat(tech): teine tarnija — Tech hinnakiri (Google Sheets XLSX → PostgreSQL)
9f8994d  fix(admin): stale-sync hoiatus järgib QStashi päeva/öö ajastust
727671c  docs: Laptopid.ee sync'i QStash ajastus prototüübi säästurežiimis
f1e8df2  perf: kitsam poe kataloogipäring ja piiratud pildilaiused
be11d1d  feat(storefront): kaardi pildisirvija, mobiilse võrdluse parandus, filtrid, Lenovo G-nimed
c4ba28f  content: tolmust puhastamise hind eemaldatud (Garantii ja E-poe tingimused)
5457435  feat(checkout): kohustuslik E-poe tingimustega nõustumine; tingimuste ja infolehtede parandused
664dbbd  docs: Laptopid.ee sync iga 5 min Upstash QStashiga
9d9242a  content: juriidiline info, garantii ja kontaktid Laptopid.ee live-lehe põhjal
89b5eef  chore: production-cleanup — prototüübiriba, ausad maksetekstid, sync'i seis adminis
a77e106  fix(laptopid): "Uus" seisukord, Lenovo V-seeria ja LAPTOPID_API_BASE_URL
```

## 8. Lahtised teemad (ära lahenda omal algatusel)

- **Foxway** integratsioon — alustamata.
- **Tech — tundmatud märkused (31 seadet müügist väljas):** Apple `n-650`/`sr-420` (aku tsüklid?), aastad, `safety`/`saf`, `new KB`/`new lcd`, `type-c`, `L00164…`, `0`, `M.M.`, `kolonki`, `5min`, `1 aku ok`, `war 35` — tähendus vajab kasutaja kinnitust, siis lisada `src/integrations/tech/tech-notes.ts` reeglitesse. Nimekiri: admin → Tarnijad → Tech.
- **Tech — rikastus:** 96 mudelil pole pilte ega mudeliandmeid (Tech ei anna GTIN/MPN-i, Icecati auto-vaste pole võimalik, püsiv pildisalvestus R13 puudub) → poes illustratsioon. Lahendus: käsitsi Icecati vasted adminis või tulevikus muu allikas.
- **Tech — hinnamuutus:** M muutub → uus pakkumine (hind on identiteedi osa), vana jääb laoseisuga 0 ja selle admini parandus ei kandu üle. Kui see segab, arutada (nt paranduse ülekandmine).
- **Storefront (2026-10-12 redesign'i järel):** "300+ sülearvutit kohapeal" = "Kohe saadaval" pakkumiste arv (Laptopid.ee, teadmata kogus = sama ettevõtte salong; Techi pakkumised on partneri laos) — kui salongi tegelik väljapanek erineb, muuda `src/domain/storefront/showroom.ts`. Leidjas pole "Mängimiseks" eesmärki (lisamine = uus reegel `domain/finder`). Kui garantii (nt "vähemalt 1 aasta") või kvaliteedikontrolli väide kinnitatakse, lisa see admini usaldusribale. Dev-režiimis teatab Next `/info/[slug]` kohta "params accessed outside of Suspense" (build'i ei mõjuta; leht on staatiline).
- **Tech — LIVE faas:** seadme/seerianumbri reserveerimine ja kulutamine makse kinnitusega samas tehingus; Techi samaaegse müügi käsitlus (vt TECH_SYNC.md §12).
- **Tech — admini UI brauseris kontrollimata:** admini lehed (Tarnijad → Tech, konfiguratsiooni seadmed, tellimuse seerianumbrid, Sync now) on build'i, tüüpide ja server-testidega kaetud, aga sessioonis ei saanud admini parooliga sisse logida — vaata üle.
- **Tech — mudelinimede kirjapildid:** nt "Toughbook CF-54MK2" vs "CF-54 MK2", "Surface Laptop 3 15icnh" tekitavad eraldi mudeleid; 13 mudelit tundmatu seeriaga (taksonoomia hoiatus).
- **Päris maksed** (makseteenus, webhook, `confirmRedemption`) — alustamata; **prototüüp → LIVE** lülitus tulevikus.
- **Tarnehind** (6,99 € näidis) vajab enne avamist lõplikku otsust; pakiautomaadid puuduvad.
- **Garantii/tagastuse/tingimuste** lõplik juriidiline ülevaatus enne avamist (nt p 9.12–9.13 tellimuskinnitus/müügipakkumiste nõusolek, 9.2–9.3 kaardimaksed kirjeldavad tulevikku).
- **Tolmust puhastamise hind:** hind eemaldati teadlikult mõlemalt lehelt; kui see lisatakse tagasi, tuleb valida üks hind.
- **Privaatsus:** IP-aadress salvestatakse sooduskoodi- ja tellimuse otsingu katsete piiramiseks — võiks privaatsustekstis eraldi mainida.
- **Flaky test:** Laptopid sync'i DB-test ("API viga … eelmine kataloog jääb alles") kukkus korra täiskäivitusel, kordustel läbis.
- **Otsingu täpsus:** "X1 Carbon Gen 10" (12) ja "X1 Carbon G10" (11) annavad veidi erineva arvu (sõnaalguse vaste "10").
- **Jõudlus (sprint 2026-10-12, vt CHANGELOG + ARCHITECTURE → Kataloogi päringud):** filtrid/tahud/LIMIT SQL-is (`catalog-queries.ts`), tooteleht üks mudel, filtriklikk = `GET /api/catalog` JSON (~5 KB gzip). Järgmised sammud (P2, kasutaja otsus): **Verceli funktsioonide regioon `fra1`** (praegu iad1 ↔ Neon Frankfurt, ~90 ms iga DB-ring); `'use cache: remote'` (serverless'is mälu-vahemälu päringute vahel ei püsi); 10 000+ pakkumise jaoks filtri võtmed/otsingutekst salvestatud veergudesse (sync arvutab) + indeksid; laptop finder loeb veel kogu kataloogi; otsingusoovitused ~150 ms (otsingutekst arvutatakse päringus). Auditi ootel (kasutaja otsustab Neon/Vercel Usage põhjal): sync'i sagedus / Neoni autosuspend, `'use cache: remote'`, muutumata pakkumiste `lastSeenAt` uuendused, `system_logs` / `catalog_sync_runs` säilitus, otsingu `s-maxage`.
- Väiksemad: A+/A/B/C kirjeldused näidistekstid; `battery_hours` ei kuvata; Laptopid pildid märgitud illustratiivseks (4 pilti Laptopid.ee poolel 404); Hobby pildioptimeerimise limiit 5000/kuu; `npm run icecat` CLI kasutab JSON-faile, püsiv pildisalvestus (R13) puudub.

## 9. Mida EI TOHI omal algatusel teha

- Foxway, maksed / makseteenus, LIVE režiimi avamine, e-kirjad, kliendikontod.
- Töötava storefronti redesign või admini ümberkujundamine.
- Vercel plaani / env muutujate, `CRON_SECRET`-i või QStashi schedule'i muutmine; uute väliste teenuste lisamine.
- Destruktiivsed migratsioonid, andmete kustutamine, uue Neoni projekti loomine.
- Saladuste kuvamine/logimine/commit'imine; kasutajalt paroolide küsimine.

## 10. Next session

Järgmine sessioon:
- loeb **AGENTS.md** + selle HANDOFF-i + ülesandega seotud docs;
- kontrollib `git status` ja `git log`;
- ei eelda varasemate chat'ide konteksti;
- ei alusta Foxwayd, makseid ega muid suuri faase ilma kasutaja selge käsuta;
- ei redesign'i töötavat storefronti omal algatusel;
- ootab kasutajalt järgmist ülesannet.
