# HANDOFF — üleandmine järgmisele Claude Code sessioonile

> Seis: **2026-10-12** (õhtu, rikastuse sprint), haru `main` = `origin/main`. Live: <https://laptop-store-rouge.vercel.app> · GitHub: <https://github.com/rissu18/laptop_store>
> Kasutaja kirjutab eesti keeles; vasta eesti keeles. Projekt on 12. klassi praktiline lõputöö — dokumentatsioon (docs/, CHANGELOG.md) on osa tööst.
> Püsireeglid: **AGENTS.md** (ainus juhiste fail). Detailid: docs/LAPTOPID_SYNC.md, **TECH_SYNC.md**, **FOXWAY_SYNC.md**, ARCHITECTURE.md, DATABASE.md, ADMIN.md, ORDERS.md, DISCOUNTS.md, PROJECT_PLAN.md.

## 1. Projekt

Custom e-pood **kasutatud äriklassi sülearvutitele** — **Sülearvutid.ee** (müüja Sülearvutid OÜ, sama ettevõte mis Laptopid.ee). Ilma WordPressi/Shopify jms platvormita. Päris kataloog tuleb **kolmest tarnijast**: **Laptopid.ee API**, **Techi Google Sheetsi hinnakiri** ja **Foxway API** (kõik sync → PostgreSQL). Pood on **prototüübirežiimis**: hoiatusriba, noindex, ainult testtellimused, päris makseid pole.

## 2. Tech stack ja arhitektuur

- **Next.js 16.4** (App Router, `cacheComponents`) + **React 19**, **TypeScript strict** — enne Next-koodi loe `node_modules/next/dist/docs/` (AGENTS.md). **Tailwind 4** (tokenid `src/app/globals.css`, poe värvid `.storefront` plokis), zod 4, Vitest, tsx.
- **PostgreSQL (Neon) + Drizzle 0.45**. **Lokaalne arendus ja Vercel kasutavad SAMA live-andmebaasi** — kirjuta andmebaasi ainult teadlikult.
- **Vercel Hobby** (push `main` → automaatne deploy; CLI `npx --yes vercel@63.1.2 …`). **Upstash QStash** käivitab sync'i. Node 24, Windows (PowerShell / Git Bash).
- Modulaarne monoliit: `src/domain` (puhas äriloogika), `src/server` (server-only: db, catalog, catalog-sync, auth, admin, checkout, orders …), `src/integrations` (laptopid, tech, foxway, supplier/mock, icecat), `src/components`, `src/client` (brauseri store'id), `src/config` (company, info-pages). Migratsioonid `drizzle/0000–0006` (kõik lisavad), 28 tabelit. XLSX lugemiseks **ExcelJS 4.4.0** (`serverExternalPackages`, ainult server).
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
- **Icecat** = mudeli piltide / rikastuse varuallikas (`product_images`, `icecat_metadata`); ei kirjuta kunagi pakkumise CPU/RAM/SSD/seisukorda jms üle. Pildid: **mudeli koondgalerii** (2026-10-13, `domain/images/model-gallery.ts`) — kõik sama mudeli konfiguratsioonid näevad sama galeriid: oma/admini pildid → Laptopid.ee fotod (kõigilt müügis pakkumistelt) → teised tarnijad → Icecat; dedupe URL + visuaalne räsi; tühjad (BLANK) ja katkised (BROKEN) välja, kui paremaid on; illustratsioon ainult siis, kui pilte pole. Analüüs: `npm run images:analyze` (ka `enrich:catalog --images`).

- **Tech (teine tarnija):** iga hinnakirja rida = füüsiline seade (`supplier_inventory_units`: Tech ID + seerianumber, **ainult admin**). Sama konfiguratsiooni + hinnaga müügis seadmed = üks SupplierListing, **täpne laoseis** ("Partnerlaos 4 tk"). Brand/Model lahtri värv = müüdud. Seisukord **B**, hind **M + 60 €**, ostuhind **M − 20 €**, KM **MARGIN**, tarne **1–2 tööpäeva** (pakkumise `delivery_min/max_days`), garantii NULL. Defekt / tundmatu märkus / tahvel / detachable / vigased andmed / mitte-SSD → välja. Täpselt: docs/TECH_SYNC.md.
- **Hinnad kliendile (2026-10-13):** alati täisarv eurodes — üks reegel `money.ts → roundToEuro` (tavaline ümardamine, x,50 → üles): mapper (müügi- ja võrdlushind), kataloogi SQL (filter/sort/hinnavahemik), soodustused (summa ja jaotus täiseurodes, `floorToEuro` lagi/marginaal) ja tarne (seadetes 6,99 € → 7 €). Tarnija täpne hind jääb andmebaasi. Hinna all alati "Hind sisaldab käibemaksu"; erikorra (MARGIN) teksti kliendile ei näidata (backendis `vat_scheme` alles).
- **Konfiguratsioonid tootelehel:** alati kõik nähtaval (näita/peida nuppu pole); rida "i5-1345U · 16 GB · 256 GB", alarida "Seisukord A · Skandinaavia (SCA) · 14" · WUXGA · Tarne 2–4 päeva" (`domain/catalog/configuration-line.ts`; Laptopid.ee → "Poes kohapeal").
- **Kataloogi filtrid Tarne ja Tarnija (2026-10-13):** SQL tahud `delivery` (Poes kohapeal / Tarne 1–2 / 2–4 päeva) ja `supplier` (Laptopid.ee / Techvision / Foxway), paneelis kõige ees; URL `?delivery=kohapeal&supplier=tech,foxway`. Pakkumise tasemel (kaart = pakkumine). Vt ARCHITECTURE.md → Kataloogi päringud.
- **Piltide katte diagnostika (2026-10-13):** `npm run images:diagnose` (ainult lugemine). 116 / 397 müügis mudelit on pildita, kõik Tech/Foxway-only. Põhjused, REVIEW triaaž ja TOP 3 lahendust: docs/reports/image-coverage-2026-10-13.md. Ühtegi lahendust pole veel tehtud (kasutaja otsus).
- **Konfiguratsioonide järjestus ja vaikevalik** (`domain/catalog/configuration-order.ts`): esmalt "Poes kohapeal" (hind ↑), siis kõik ülejäänud (hind ↑, tarneaeg eelist ei anna); võrdse hinna korral SKU → id (stabiilne). Vaikimisi valitud = odavaim kohapeal variant, selle puudumisel odavaim saadaval variant; QuickSpecs, seisukord, tarne, hind ja ostukorv lähtuvad sellest. "Poes kohapeal" silt ja järjestus kasutavad sama `isInStore` reeglit.
- **Foxway (kolmas tarnija, 2026-10-12):** identiteet **foxway + SKU** (ItemVariantId ei ole identiteet); sama SKU working + new → üks pakkumine, kogust ei liideta. **Täpne laoseis** (Quantity), tarne **2–4 tööpäeva**, hind: **IsVatMargin = false → Foxway hind + KM 24% + 60 € + laadija**, `vat_scheme = STANDARD`; **IsVatMargin = true → Foxway hind + 60 € + laadija** (kasutatud kauba erikord, `vat_scheme = MARGIN`, KM marginaalilt; ei blokeeri). Laadija: 0 / 35 / 60 / 90 € (Apple: Air/MacBook/Pro 13" 35, Pro 14" 60, Pro 15–16" ja tundmatu suurusega Pro 90). Tellimuse snapshot `order_items.vat_scheme` + hankekirjel `supplier_vat_margin`. **KMS §41 arvestus (eriti erikorra kaubale lisatud uus laadija) tuleb enne arvemootorit raamatupidajaga kinnitada.** TrackPointi nupu rike (pointer nub) = REVIEW, mitte BLOCK. Seisukord Appearance'ist: Brand New → Uus, A+/A/B/**C+**/C (C+ on uus eraldi klass). **Rikete ohutus** (`foxway-faults.ts`): mõlemad rikkeväljad alati; INFO/NOTICE → müüki + eestikeelne "Seisukorra märkus"; REVIEW (ebamäärane/**tundmatu**) ja BLOCK (katkine riistvara) → `quality_hold`, poes ei kuvata. Garantii max(12, sama mudeli Laptopid.ee garantii), aku 6 kuud. Foxway "Battery status" kliendile ei kuvata. Tellimine Foxwayst **käsitsi** (hankekirje tellimusel, automaatset tellimust pole). Täpselt: docs/FOXWAY_SYNC.md.
- **Klaviatuur kogu poes:** üks register `src/domain/catalog/keyboard.ts` (SCA, DEU → "Saksa (DE)", FRA, INT, Laptopid.ee `ENG` = "Inglise (ENG)" (US/UK täpsustamata) ja `SWE/RUS` …; tundmatu kood toorkujul; "Missing Keyboard" = eraldi kvaliteediprobleem), filtri valikud SQL-ist (kõik tarnijad).
- **CPU perekond/põlvkond:** üks parser `cpu-filter.ts → parseCpuInfo` (sync'id + filter): Core i, Core seeria 1 (`core-1`), Core m, Ultra, Ryzen (turunduse seeria), Ryzen AI, Apple M (`apple-N`, Pro/Max perekonnas), Snapdragon X (`snapdragon-1`); ebakindel (Intel N, AMD A, "Ryzen 7") → NULL.
- **Rikastus (LOCAL-FIRST, 2026-10-12):** meie andmebaas → Laptopid.ee andmed (sync'itud pakkumised ja fotod) → Icecat; käib offline (`npm run enrich:catalog [-- --dry-run|--images|--specs|--icecat]`, admin → Andmekvaliteet → "Rikasta kataloogi"), tulemus `product_images` (allikas LAPTOPID/ICECAT), `product_models.enrichment`, `supplier_listings.enrichment`. Pood loeb ainult andmebaasi; efektiivne = parandus ?? tarnija ?? rikastus. Vaste konservatiivne (`model-match.ts`, ebakindel → REVIEW). Täpsemalt ARCHITECTURE.md → Kataloogi rikastus.
- **Icecati pildid nime järgi (2026-10-12, Phase 2):** GTIN/MPN puudumisel tootja + mudeli identiteet Open Icecati indeksist (`files.index.xml.gz` voona, ei salvestata; `ICECAT_PASSWORD` `.env.local`-is) + kohustuslik JSON pealkirja kontroll (Gen, s-täht, x360/Yoga/Rugged/Chromebook, Dell seeria, ekraan, CPU ajastu). Müügis mudelid, mille galeriis < 5 pilti → max 10 pilti, admini/Laptopid.ee pildid ees. Ebakindel → REVIEW (`icecat_metadata` NEEDS_REVIEW), Apple → REVIEW. Käivitus: `npm run enrich:catalog -- --images --icecat [--dry-run]` **lokaalselt**, seejärel commit `public/media/products` + push (uus deploy loeb kataloogi värskelt). Tulemus: 0 pildiga mudeleid 343 → 190, 5–10 pildiga 50 → 246. Täpsemalt ARCHITECTURE.md → "Icecat: tootja + mudeli identiteet".
- **Kiirusindeks ja maks. sagedus (2026-10-12):** Laptopid.ee `cpu_3dmark06` / `gpu_3dmark11` + CPU tekstis maks. turbo → `details`; teistele tarnijatele ainult täpse CPU/GPU vastega (`enrich:catalog` → `enrichment`). Tooteleht "Tehnilised andmed → Jõudlus": Protsessor, Maks. sagedus, Kiirusindeks ⓘ, põlvkond, Mälu, Salvestus, Graafika, Kiirusindeks ⓘ (`benchmarks.ts`, `info-tip.tsx`). Tähti / 1–5 taset veel ei tehta (vaja enne jaotust).
- **Tootelehe kiirinfo kastid:** `domain/catalog/quick-specs.ts` — Protsessor, Mälu, Salvestus, Ekraan, Klaviatuur, Graafika ("Integreeritud graafika", kui tarnija ütles Integrated ja täpsemat pole); tühja lahtrit ei jää.
- **Tarnija omadused, mida ei antud** (HDMI, sõrmejälg …) on poes NULL (rida ei kuvata) — varem näitas tehniliste andmete tabel Techi ja Foxway pakkumistel neid ekslikult "Ei" (parandatud mapperis).

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

## 4c. Foxway API sync — praegune seis

Täielik kirjeldus: **docs/FOXWAY_SYNC.md**.

- API `GET /api/v1/catalogs/{working|new}/pricelist?dimensionGroupId=11&itemGroupId={12|54}`, päis `X-ApiKey`. Seadistus `FOXWAY_API_BASE_URL` (Config) + `FOXWAY_API_KEY` (Vercel Sensitive, Production + Preview; kohalikult `.env.local`). **NB:** ilma `Accept-Encoding: gzip` päiseta annab API HTTP 200 + tühja keha → klient saadab päise alati, tühi keha = viga. Transport on `node:https` (Next.js-i paigatud fetch jäi Vercelis vastuse keha lugemisel ootama).
- **Esimene tootmissync 2026-10-12 15:15 (QStash → cron, SUCCESS, 5,7 s, usaldusväärne):** Working PC 642, Working Mac 100, Brand New PC 0, Brand New Mac 1 rida → **741 unikaalset SKU-d** (1 duplikaat working + new, konflikte 0), **1374 tk** laos; vigaseid ridu 1 (Price 0). Poodi **630**, blokeeritud **94**, ülevaatus **17**, tundmatuid rikketekste 0. Mudelid: olemasolevad 71 (sh 2 Apple'i vastet), uued 248; pildid (mudelid): taaskasutatud 50, Icecat 17, puudu 252. Poes kokku 1128 pakkumist (Laptopid + Tech + Foxway).
- **QStash (Europe/Tallinn, loodud 2026-10-12):** `foxway-daytime-sync` `scd_5arBJLAS1ZjXS8HT7Y6GzkFwc3zT` (`*/30 8-23 * * *`) ja `foxway-nightly-sync` `scd_5ebTr88EVaeAJzetJ5vtqqPS3JS2` (`0 0-6/2 * * *`), GET `/api/cron/foxway-sync`, edastatud `Authorization: Bearer <CRON_SECRET>` (sama mis teistel schedule'itel, kopeeritud kuvamata), korduskatseid 0. `CRON_SECRET`-i roteerimisel uuenda kõiki **kuut** schedule'it.
- Käsitsi: admin → Tarnijad → Foxway → **Sync now**; `npm run foxway:sync [-- --dry-run]`. Ülevaatusel/blokeeritud: admin → Konfiguratsioonid → Tarnija Foxway + Avaldamine; admin saab "Kvaliteedi kinnipidamine" parandusega teadlikult avaldada.

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

- **739 testi / 62 testifaili — kõik läbivad** (koondgalerii sprint 2026-10-13) — enne **725 testi / 60 testifaili** (Icecati Phase 2; NB: `cart.test.ts` 2 testi kukuvad, kui `.env.local` on shelli laetud — `cacheTag()` sõltub keskkonnast, oli ka enne) — enne: **694 testi / 57 testifaili** (kiirusindeksi sprint) — enne: **680 testi / 56 testifaili** (2026-10-12 rikastuse sprint; enne 591) — varasem kirjeldus: **578 testi / 54 testifaili** (Foxway: 51 ühik- + klienditesti, 16 andmebaasitesti, 6 cron-testi, 3 poe kuvamise testi) (`npm test`, DB testid päris Neonis ajutises skeemis `test_xxxx`, ~45 s).
- `npm run typecheck` ✅ · `npm run lint` ✅ · `npm run build` ✅ (Git Bashis: `set -a; . ./.env.development.local; . ./.env.local; set +a; npm run build`).
- Viimane production deploy: Foxway integratsioon (HEAD, vt `git log`). Jõudlus pärast Foxway importi (1128 pakkumist, lokaalselt → Neon, soe): kataloogi lehekülg 134 ms (enne 86 ms / 500 pakkumist), filter 107 ms (79), lk 3 112 ms (75), tooteleht 29 ms (30), otsing 270 ms (151); lehekülje andmemaht sama (24 kaarti). Tootmises filtri JSON 1,6–6,9 KB gzip.
- Dev-serveri vana CSS (Turbopacki vahemälu) → peata server, kustuta `.next`, käivita uuesti. `next start` ei loe `.env.development.local` faili (kassa/DB ei tööta) — brauseris testimiseks kasuta `dev`. Brauseripaan on sageli peidetud → Suspense jääb `hidden` alla ja `requestAnimationFrame`/kerimissündmused ei käi; tee enne kuvatõmmis.

## 7. Viimased commitid

```
(HEAD)   feat(storefront): mudeli koondgalerii, kõik konfiguratsioonid nähtaval, täiseuro hinnad (2026-10-13)
66abfcf  content(images)+docs: Icecati pildid 237 mudelile (Phase 2 tootmisrikastus)
b1d716c  feat(images): Icecati pildid tootja + mudeli identiteedi järgi (GTIN/MPN pole enam eeltingimus)
(varem)  feat(catalog)+feat(enrichment)+docs: CPU parser, klaviatuur, LOCAL-FIRST rikastus, GPU kast (2026-10-12, vt git log)
7b42d64  fix(foxway): erikorra (IsVatMargin) hinnastus, Apple'i laadija profiil, TrackPoint → REVIEW
(varem)  feat/fix/docs(foxway): Foxway integratsioon — 6+ commit'i, vt git log (skeem+klient → sync → storefront → admin+hange → transport → docs)
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

- **Kiirusindeks:** CPU väärtus puudub 466 / GPU 614 müügis konfiguratsioonil (Laptopid.ee-s pole täpselt sama CPU/GPU-d: AMD Ryzen 3/5, vanemad Intelid, AMD Radeon, Apple). Järgmine samm (kasutaja otsus): benchmarkide jaotuse põhjal kasutajasõbralik jõudlustase. Laptopid.ee andmetes kahtlased: i7-10510U 4800 MHz (ametlik 4,9), Core Ultra 7 255U 4800 MHz (ametlik 5,2), i5-8350U GPU "Intel HD 520" (tegelikult UHD 620).

- **Rikastus (pärast Icecati Phase 2, 2026-10-12):** 190 mudelil pole pilti — 126 Icecatis vasteta (MSI/ASUS/Acer tarbijamudelid, HP kodumudelid, Microsoft/Huawei/Panasonic/Razer/Xiaomi pole Open Icecati sülearvutite kategoorias), 48 REVIEW (sh 22 Apple — vaja GTIN/MPN-i või käsitsi vastet; ülejäänud: põlvkonnata nimed X13/L15/P15, Latitude vs Precision, Rugged, MSI CPU ajastu jne). REVIEW: admin → Pildid → Icecat "NEEDS_REVIEW". 67 mudelil 1–4 pilti (Icecatil rohkem erinevaid häid pilte polnud). `public/media/products` ~172 MB Git-is — püsiv objektisalvestus (R13) otsustamata. 9 vana orbfaili (`hp-elitebook-850-g8` 07–09) on Git-is ilma kirjeta — võib eemaldada. 8 mudelit "Pildivaste vajab ülevaatust" (7310 vs 7310 Carbon, L15/X13/P15 ilma Gen-ita jne) — admin otsustab. X1 Carbon Gen 6: Icecati MPN vaste ülevaatusel (pealkirjas pole "Gen 6"). Tech hinnakirjas pole klaviatuuri veergu (206 "tundmatut") ja Laptopid.ee annab 27-l tühja väärtuse — ei arvata; vajadusel kasutaja otsus (nt Techi vaikepaigutus). Laptopid.ee `ENG` ei ütle US vs UK. Apple "Retina" resolutsiooni ei leitud ühestki allikast (79 Foxway pakkumist) — kuvatakse "Retina". CPU põlvkond NULL 19-l (Intel N/Celeron, AMD A, "Ryzen 7") — teadlikult. CLI ei tühjenda poe vahemälu (järgmine muutev cron või admini nupp).

- **Tech — tundmatud märkused (31 seadet müügist väljas):** Apple `n-650`/`sr-420` (aku tsüklid?), aastad, `safety`/`saf`, `new KB`/`new lcd`, `type-c`, `L00164…`, `0`, `M.M.`, `kolonki`, `5min`, `1 aku ok`, `war 35` — tähendus vajab kasutaja kinnitust, siis lisada `src/integrations/tech/tech-notes.ts` reeglitesse. Nimekiri: admin → Tarnijad → Tech.
- **Tech — rikastus:** 96 mudelil pole pilte ega mudeliandmeid (Tech ei anna GTIN/MPN-i, Icecati auto-vaste pole võimalik, püsiv pildisalvestus R13 puudub) → poes illustratsioon. Lahendus: käsitsi Icecati vasted adminis või tulevikus muu allikas.
- **Tech — hinnamuutus:** M muutub → uus pakkumine (hind on identiteedi osa), vana jääb laoseisuga 0 ja selle admini parandus ei kandu üle. Kui see segab, arutada (nt paranduse ülekandmine).
- **Storefront (2026-10-12 redesign'i järel):** "300+ sülearvutit kohapeal" = "Kohe saadaval" pakkumiste arv (Laptopid.ee, teadmata kogus = sama ettevõtte salong; Techi pakkumised on partneri laos) — kui salongi tegelik väljapanek erineb, muuda `src/domain/storefront/showroom.ts`. Leidjas pole "Mängimiseks" eesmärki (lisamine = uus reegel `domain/finder`). Kui garantii (nt "vähemalt 1 aasta") või kvaliteedikontrolli väide kinnitatakse, lisa see admini usaldusribale. Dev-režiimis teatab Next `/info/[slug]` kohta "params accessed outside of Suspense" (build'i ei mõjuta; leht on staatiline).
- **Tech — LIVE faas:** seadme/seerianumbri reserveerimine ja kulutamine makse kinnitusega samas tehingus; Techi samaaegse müügi käsitlus (vt TECH_SYNC.md §12).
- **Tech — admini UI brauseris kontrollimata:** admini lehed (Tarnijad → Tech, konfiguratsiooni seadmed, tellimuse seerianumbrid, Sync now) on build'i, tüüpide ja server-testidega kaetud, aga sessioonis ei saanud admini parooliga sisse logida — vaata üle.
- **Tech — mudelinimede kirjapildid:** nt "Toughbook CF-54MK2" vs "CF-54 MK2", "Surface Laptop 3 15icnh" tekitavad eraldi mudeleid; 13 mudelit tundmatu seeriaga (taksonoomia hoiatus).
- **Foxway — avatud teemad:** (1) 252 mudelil pole pilte (Foxway pilte ei anna; Icecati auto-vaste vajab GTIN/MPN-i, R13 püsisalvestus puudub) → illustratsioon; lisa Icecati vasted adminis. (2) 17 SKU-d ülevaatusel (Minor functional issues, loose parts, LCD discoloration, SIM tray, HDD, GPU "Not tested") — äriotsus, kas mõni reegel muuta. (3) KMS §41: erikorra kauba + meie lisatud uue laadija maksustamine — kinnitada raamatupidajaga enne arvemootorit. (4) Hinnad pole ümardatud (nt 150,52 €) — ümardamine oleks äriotsus. (5) Paljud Foxway mudelid on tarbijaklassi (IdeaPad, VivoBook, Galaxy Book …, 153 tundmatu seeriaga mudelit) — seeriafiltris on need oma nimega. (6) Otsing kasvas 270 ms-ni — otsingutekst/filtri võtmed salvestatud veergudesse (sync arvutab) oleks järgmine samm.
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

- Foxway automaatne tellimine / dropshipping / Foxway order API, maksed / makseteenus, LIVE režiimi avamine, e-kirjad, kliendikontod.
- Töötava storefronti redesign või admini ümberkujundamine.
- Vercel plaani / env muutujate, `CRON_SECRET`-i või QStashi schedule'i muutmine; uute väliste teenuste lisamine.
- Destruktiivsed migratsioonid, andmete kustutamine, uue Neoni projekti loomine.
- Saladuste kuvamine/logimine/commit'imine; kasutajalt paroolide küsimine.

## 10. Next session

Järgmine sessioon:
- loeb **AGENTS.md** + selle HANDOFF-i + ülesandega seotud docs;
- kontrollib `git status` ja `git log`;
- ei eelda varasemate chat'ide konteksti;
- ei alusta Foxway automaattellimist, makseid ega muid suuri faase ilma kasutaja selge käsuta;
- ei redesign'i töötavat storefronti omal algatusel;
- ootab kasutajalt järgmist ülesannet.
