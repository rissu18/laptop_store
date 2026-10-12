# Foxway API sync (kolmas päris tarnija)

Foxway (Tartu ladu, B2B hulgimüüja) on Sülearvutid.ee kolmas päris tarnija. Imporditakse **ainult sülearvutid**: kasutatud PC- ja Mac-sülearvutid (`working`) ning uued (`new`, "Brand New"). Chromebookid, telefonid, tahvlid, lauaarvutid, monitorid, komponendid, tarvikud ja `refurbishing` kataloog **ei** tule poodi.

> Seotud: [LAPTOPID_SYNC.md](LAPTOPID_SYNC.md), [TECH_SYNC.md](TECH_SYNC.md) (samad ohutuspõhimõtted), [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE.md](DATABASE.md), [ADMIN.md](ADMIN.md), [ORDERS.md](ORDERS.md).

## 1. Põhimõte

```
Foxway API (4 hinnakirja päringut: working/new × PC 12 / Mac 54, DimensionGroup 11)
  → Zod-valideerimine (rida-haaval; vigane vastus = kogu sync FAILED)      foxway-client.ts, foxway-schema.ts
  → rida → normaliseeritud pakkumine + ohutus (hold)                       foxway-normalizer.ts, foxway-faults.ts
  → dedup SKU järgi üle kataloogide (kogust EI liideta)                    foxway-snapshot.ts
  → usaldusväärsus (kas puuduvaid tohib maha võtta)                        foxway-snapshot.ts
  → sync (lukk, üks tehing)                                                server/catalog-sync/foxway-sync.ts
  → PostgreSQL: product_models + supplier_listings
  → olemasolev catalog-queries (SQL-filtrid, LIMIT, ainult lehe pildid) → pood, otsing, ostukorv, kassa
```

- **Pood ei pöördu Foxway poole kunagi.** Supplier API → meie DB → storefront. Kui Foxway on maas, müüakse edasi viimase eduka sync'i seisu.
- **Storefront ei loe toorandmeid** (`raw_data`). Kõik poe jaoks vajalik on normaliseeritud veergudes (`grade`, `keyboard`, `resolution`, `stock` …) või struktureeritud `details` väljadel (kliendi märkused, laadija silt, aku garantii).

| Kiht | Fail |
| --- | --- |
| Seadistus (FOXWAY_API_BASE_URL, FOXWAY_API_KEY) | `src/integrations/foxway/foxway-config.ts` |
| API klient (ainult server) | `src/integrations/foxway/foxway-client.ts` |
| Vastuse skeem, feed'id, Dimension võtmed | `src/integrations/foxway/foxway-schema.ts` |
| Rikete/seisukorra klassifikaator | `src/integrations/foxway/foxway-faults.ts` |
| ProductName → mudel, Apple võtmed | `src/integrations/foxway/foxway-names.ts` |
| Rida → pakkumine (+ hold) | `src/integrations/foxway/foxway-normalizer.ts` |
| Hind | `src/integrations/foxway/foxway-pricing.ts` |
| Laadija lisatasu (kõigile tarnijatele) | `src/domain/catalog/charger.ts`, `power-class.ts` |
| Klaviatuuri register (kogu pood) | `src/domain/catalog/keyboard.ts` |
| Dedup, usaldusväärsus | `src/integrations/foxway/foxway-snapshot.ts` |
| Sync-teenus | `src/server/catalog-sync/foxway-sync.ts` |
| Päris käivitamine (admin/cron/CLI) | `src/server/catalog-sync/foxway-runner.ts` |
| Cron-otspunkt | `src/app/api/cron/foxway-sync/route.ts` |
| Admin "Sync now" | `src/server/admin/suppliers/actions.ts` (`syncFoxwayNowAction`) |
| Admini metaandmed (raw_data.foxway) | `src/integrations/foxway/foxway-meta.ts` |
| Käsitsi hange | `src/domain/orders/procurement.ts`, `src/server/orders/procurement.ts` |
| Käsurida (+ kuivkäivitus) | `npm run foxway:sync [-- --dry-run]` |

## 2. Seadistus ja API

| Muutuja | Tüüp | Väärtus |
| --- | --- | --- |
| `FOXWAY_API_BASE_URL` | Config | `https://foxway.shop` |
| `FOXWAY_API_KEY` | **Saladus** (Vercel Sensitive, Production + Preview; kohalikult `.env.local`) | päis `X-ApiKey` |

- Võtit ei ole repos, logides, veateadetes ega brauseri bundle'is (klient on `server-only`; veateated on võtmeta; testid kontrollivad). Puuduv/vigane seadistus → sync ei käivitu (`NOT_CONFIGURED`, cron 503).
- Kasutatav otspunkt: `GET /api/v1/catalogs/{working|new}/pricelist?dimensionGroupId=11&itemGroupId={12|54}` (Swagger `PricelistLine`).
- **Foxway API veidrus:** ilma `Accept-Encoding: gzip` päiseta tagastab API `HTTP 200` ja **tühja keha** (`Content-Length: 0`). Klient saadab päise alati ja käsitleb tühja keha veana (`EMPTY_BODY`) — mitte "tühja nimekirjana" (`[]` on tühi nimekiri, nt `new · PC`). Muidu tühjendaks üks vigane vastus kataloogi.
- Transport `node:https` + zlib (`foxway-transport.ts`), **mitte** Next.js-i paigatud `fetch`: esimesel tootmiskatsel jäi Vercelis paigatud `fetch` Foxway vastuse keha lugemisel ootama (TimeoutError 94 s järel; sync FAILED, kataloogi ei muudetud), `node:https`-iga võtavad 4 päringut tootmises ~1 s. Ajapiir 45 s kogu päringule, kuni 3 katset (võrk/5xx/429), ümbersuunamisi ei järgita. 401/403 → `AUTH`. Süsteemilogi (FOXWAY) näitab iga feed'i ridade arvu, võrgumahtu (gzip), katseid ja kestust.
- `POST /api/v1/sku/{urlSlug}/bulk-stock` (max 500 SKU, ~1 päring / 10 s) **ei kasutata**: täis-hinnakiri (≈ 760 rida, ~600 KB, 4 päringut kokku < 1 s) annab iga 30 min kõik vajaliku ja on lihtsam ning täielikum (uued SKU-d, seisukord, rikked). Tellimise/dropshippingu otspunkte ei kasutata.

## 3. Identiteet

- **SupplierListing identiteet = `foxway` + SKU** (`supplier_product_id` = Foxway SKU, `supplier_sku` = SKU, meie SKU `FX-<SKU>`, avalik ID `foxway-<sku>`).
- **ItemVariantId EI OLE identiteet.** Ühel ItemVariantId-l võib olla mitu SKU-d eri seisukorra, klaviatuuri, hinna, KM-tüübi, RAM/SSD/CPU, rikke ja laoseisuga — need on eri pakkumised. ItemVariantId salvestatakse (admin, hange).
- **Sama SKU mitmes kataloogis** (nt Brand New MacBook Pro nii `working` kui `new` feedis): üks pakkumine, **kogust ei liideta** — kanooniline rida (Brand New → `new`, muidu `working`). Andmete erinevus → konflikt (statistika + logi). Seisukorra määrab `Appearance`, mitte kataloog.
- Puuduv SKU, ProductName, vigane Quantity/Price või tundmatu tootja → rida jäetakse vahele (`invalidRows`, admin näeb). Kehtiva SKU-ga vigane rida loetakse "nähtuks": olemasolevat pakkumist ei võeta maha, vaid see läheb ülevaatusele.

## 4. Mis salvestatakse

`supplier_listings` (normaliseeritud, pood loeb): CPU (`Core i5` → `Intel Core i5`, `Ryzen` → `AMD Ryzen`, Apple M-kiibid muutmata), RAM, SSD (+ lisaketas `details.secondaryStorage`), GPU (`Integrated` → NULL, `GeForce …` → NVIDIA, eraldi graafika), ekraan (ProductName'ist), resolutsioon + nimi (`LCD Graphics array`), puuteekraan (`Touch` nimes), klaviatuur (kanooniline kood), seisukord, OS (`COA`), täpne laoseis, hind, tarne, garantii, `supplier_vat_margin`, `quality_hold` + põhjus.

`raw_data` (ainult admin/hange): `foxway` metaandmed (SKU, ItemVariantId, ProductName, kataloogid, Quantity, hind, valuuta, IsVatMargin, Appearance, Functionality, Boxed, Keyboard, Battery status, mõlemad rikked + klass, LCD, GPU, Drive, COA, värv, MPN/EAN, laadija otsus, hinnaarvutus, hold'i põhjused) + kõik toorread.

## 5. Seisukord

| Foxway Appearance | Meie klass | Poes |
| --- | --- | --- |
| Brand New | `NEW` | Uus |
| Grade A+ | `A+` | A+ |
| Grade A | `A` | A |
| Grade B | `B` | B |
| Grade C+ | `C+` (**uus eraldi klass**, mitte C) | C+ |
| Grade C | `C` | C |
| Grade D/E, NP, Incomplete … | — | BLOCKED (ei müüda) |
| tundmatu | — | REVIEW |

C+ lisati domeeni (`GRADE_CODES` järjekorras B ja C vahele, URL `c-plus`); andmebaasis on `grade` tekst, seega migratsiooni polnud vaja. Seisukorra kirjeldused on (nagu teistel klassidel) näidistekstid.

## 6. Rikked — ohutusklassifikaator (default closed)

**Katkiseid arvuteid ei müüda.** Üks keskne klassifikaator (`foxway-faults.ts`), string-võrdlusi mujal pole. Kontrollitakse **alati mõlemat**: `PC Fault Descriptions` ja `PC Additional Fault` — ka siis, kui Functionality on `Working` (päris feedis on rikkeid ka `Working` ridadel). Kui kasvõi üks on BLOCK, ei lähe kogu SKU poodi. Toorväärtus säilib alati.

| Klass | Tähendus | Rikked (päris feed 2026-10-12) |
| --- | --- | --- |
| **INFO** | müüki; rahulik märkus tootelehel | Minor cosmetic fault · Scratched on Purpose (= eemaldatud kleepsu jälg, MITTE "tahtlikult kriimustatud") · Discoloration by Sticker |
| **NOTICE** | müüki; märkus tootelehel + kaardil | Minor LCD fault · Minor LCD Fault (Spots) · Minor LCD Fault (Wearmarks) |
| **REVIEW** | poes ei kuvata, admin otsustab | Minor functional issues (liiga ebamäärane) · Minor cosmetic fault (loose parts) · Minor LCD Fault (Discoloration) · SIM Tray Missing · **Missing/broken pointer nub** (ThinkPadi TrackPointi nupp — väike, lihtsalt asendatav detail; muudetud BLOCK → REVIEW 2026-10-12, ka tundmatud kirjapildid nagu "Missing pointer nub", "TrackPoint cap") · **tundmatu tekst** |
| **BLOCK** | ei müüda | Severe LCD Damage · Cracked Display Glass · Black Screen/Dull Screen · Damaged Housing · Loose Hinge · Faulty speaker · Speaker Issue · Faulty camera / Faulty Camera · Cam Issue · Faulty port (USB) · Port Not Working (USB) · Faulty port · Broken Charging Socket · Faulty Touchscreen |

Lisareeglid: `Working*` ilma rikketa → REVIEW; Functionality "Not working"/"Faulty" … → BLOCK, tundmatu → REVIEW; tundmatu rikketekst rikke-sõnaga (faulty, broken, cracked, damaged, missing …) → BLOCK, muu tundmatu → REVIEW. Ka: `Keyboard = Missing Keyboard` → BLOCK; tahvel/detachable (Surface Pro/Book, IdeaPad Duet — sama reegel mis Techil, `form-factor.ts`) → BLOCK; mitte-EUR, mitte-SSD põhiketas, tundmatu Boxed, GPU "Not tested", puuduvad CPU/RAM/Drive → REVIEW.

Kui Foxway lisab homme uue rikketeksti: SKU läheb REVIEW/BLOCK alla, admin näeb seda Tarnijad → Foxway → "Tundmatud rikketekstid", logi WARN. Reegli lisamine = üks rida `FAULT_RULES` tabelis.

**Kliendile** (`details.conditionNotices`, eesti keeles, toortermineid nagu "Working*" ei kuvata):

- tootelehel seisukorra juures plokk "Seisukorra märkus" (NOTICE pehme kollakas, INFO neutraalne — mitte punane viga);
- tootekaardil ainult NOTICE: "Seisukorra märkus: ekraanil võivad esineda nõrgad laigud.";
- tekstid: "Võib esineda väikeseid kosmeetilisi kasutusjälgi." · "Korpusel võib olla kleepsu eemaldamisest jäänud kerge jälg." · "Korpusel võib olla varasemast kleepsust jäänud kerge värvitooni erinevus." · "Ekraanil võivad esineda nõrgad laigud või kasutusjäljed. Need on üldjuhul vähesed ega sega tavakasutust."

**Gate:** `supplier_listings.quality_hold` (`REVIEW` / `BLOCKED`) — poe SQL (catalog-queries `storefront` CTE) ja mapper (pood, tooteleht, ostukorv, kassa) näitavad ainult `quality_hold` efektiivse väärtusega NULL. Admin võib konfiguratsiooni lehel "Kvaliteedi kinnipidamine" teadlikult muuta (parandus `manual_overrides.qualityHold`; sync seda üle ei kirjuta).

## 7. Hind

```
IsVatMargin = false:  müügihind = Foxway hind (neto) + Eesti KM Foxway hinnalt (config/pricing.ts → vatRateBps, 24%) + 60 € + laadija
IsVatMargin = true:   müügihind = Foxway hind (ostuhind)                                                        + 60 € + laadija
```

Näide (laadija 0 €): Price 500 → tavaline 500 + 120 + 60 = **680 €**; erikord 500 + 60 = **560 €** (mitte 500 × 1,24 + 60).

- Foxway `Price` on **neto** tarnijahind. Täisarvulised sendid, arvutab ainult server; ümardamist ei tehta (see oleks eraldi äriotsus).
- `price_source = SUPPLIER` (admini hind = parandus), `vat_scheme` = **STANDARD** (IsVatMargin = false, hinnas täis-KM) või **MARGIN** (IsVatMargin = true, kasutatud kauba erikord), `supplier_price_cents` = Foxway hind + laadija (meie kulu; sooduskoodi marginaalikaitse arvestab MARGIN puhul KM-i marginaalilt).
- **Kampaania-/erihind:** Swagger eraldi välja ei anna ja tänases feedis seda pole → API `Price` on autoriteetne, Excelit ei kraabita. `foxwayEffectiveSupplierPriceCents(list, campaign)` on valmis: kui API hakkab selgesõnalist kampaaniahinda andma, kehtib see (madalamana).
- **IsVatMargin** on SKU tasemel (`supplier_vat_margin`, sama mudeli SKU-del võib erineda; mitte ProductModeli väli). IsVatMargin = true **ei blokeeri** pakkumist — ainult teine hinnastus ja KM-arvestus.
- **Erikorra kuvamine ja tellimuse andmed:** poes olemasolev märge "Kasutatud kauba erikord – käibemaksu arvel eraldi ei näidata" (`VatNote`); kassas rea juures "Kasutatud kauba erikord" ja selgitus, et KM-i eraldi ei näidata ega saa sisendkäibemaksuna maha arvata; eraldi 24% KM summat kogu müügihinnast ei kuvata kuskil. Tellimuse snapshot: `order_items.vat_scheme` (STANDARD / MARGIN) ja hankekirjel `order_item_procurements.supplier_vat_margin` — hilisem arveldus teab maksurežiimi (migratsioon 0006). Arvegeneraatorit/raamatupidamist selles etapis ei ehitatud.
- ⚠️ **Enne lõpliku arve-/raamatupidamismootori käivitamist peab KMS §41 (kasutatud kauba erikord) arvestuse raamatupidajaga kinnitama** — eriti juhul, kui kasutatud erikorra kaubale lisame meie poolt **uue laadija** (Unboxed): uus laadija ei ole kasutatud kaup ja selle osa maksustamine (tavakord vs komplekti osa) tuleb eraldi otsustada. Praegu on laadija lisatasu erikorra pakkumise müügihinnas ilma eraldi KM-ita.
- **Mitte-EUR** → automaatset hinda ei arvutata (`sale_price_cents` NULL) + REVIEW + logi.

Näited (päris feed 2026-10-12, KM 24%):

| Juhtum | Arvutus | Müügihind |
| --- | --- | --- |
| tavaline, laadijaga (ThinkPad X270, Charger included) | 73 + 17,52 + 60 + 0 | **150,52 €** |
| originaalkarp (Acer Nitro 5, Original Box) | 287 + 68,88 + 60 + 0 | **415,88 €** |
| tavaline Unboxed (Yoga 910) | 136 + 32,64 + 60 + 35 | **263,64 €** |
| tööjaam Unboxed (ThinkPad P52s) | 226 + 54,24 + 60 + 90 | **430,24 €** |

## 8. Laadija (Boxed)

| Boxed | Tähendus | Lisatasu | Kliendile |
| --- | --- | --- | --- |
| Original Box | originaalkarp + laadija | 0 € | "Originaalkarp ja laadija kaasas" |
| Charger included | laadija | 0 € | "Laadija kaasas" |
| Unboxed | laadijat Foxway hinnas pole → lisame | **35 €** tavaline (USB-C 65 W) / **60 €** keskmine (MacBook Pro 14") / **90 €** suure võimsusega | "Laadija kaasas" |

**Apple (Unboxed, `appleChargerProfile`):** MacBook / MacBook Air → 35 € · MacBook Pro 13" → 35 € · MacBook Pro 14" → 60 € · MacBook Pro 15" / 16" → 90 € · MacBook Pro tundmatu suurus → 90 € (ei alahinnata). Suurus tuleb ProductName'ist / mudelinimest (`16"`) või ekraani väljast — mitte CPU-st. Apple'i profiil ja üldine võimsusklass arvutatakse mõlemad, **kehtib suurem** (nt MacBook Pro 15" 2019 Radeon Pro → 90 € mõlemast).

Suur võimsus (`power-class.ts`, sama funktsioon mida kasutab ka "Sarnased tooted"): tööjaama seeria (Dell Precision, HP ZBook, Lenovo ThinkPad P, Fujitsu Celsius) või jõudlusgraafika (GeForce RTX/GTX, Quadro / RTX A / Ada, Radeon Pro/RX). **Ainult CPU nime järgi ei klassifitseerita.** Teadmata → tavaline 35 €. Profiilid on ühes kohas (`CHARGER_PROFILES`) (lisatud: Apple'i profiilid, keskmine 60 € profiil). Admin näeb Boxed toorväärtust, lisatasu ja põhjust. `charger_included = true` kõigil Foxway pakkumistel (laadija tuleb alati kaasa).

## 9. Laoseis ja tarne

- `stock = Quantity` (täpne), `available = Quantity > 0` — erinevalt Laptopid.ee teadmata kogusest. Ostukorv/kassa lubavad kuni laoseisuni (olemasolev `availability.ts`).
- Poes "Partnerlaos N tk" + **"Tarne 2–4 tööpäeva"** (Foxway Tartu ladu → meie Tallinna pood → kuller → klient). Ei kirjutata "Kohe saadaval" ega "Tallinnas olemas"; Foxway pakkumisi ei loeta avalehe "salongis kohe saadaval" arvu sisse.
- Kassa jääb serveripõhiseks (`computeCheckout`), Foxway API-t runtime'is ei kutsuta.

## 10. Garantii ja aku

- Foxway tarnijagarantii **ei ole** kliendi garantii. Kliendile: sülearvuti **vähemalt 12 kuud**; kui sama mudeli Laptopid.ee pakkumisel on pikem garantii (nt 36 kuud), kehtib pikem (`foxwayWarrantyMonths`). Aku garantii **6 kuud** (`details.batteryWarrantyMonths`, kuvatakse ostupaneelis ja tehnilistes andmetes).
- Foxway `Battery status` (Excellent / Holds Charge / High Cycle Count / Worn Battery / Untested) **ei ole** kliendi aku tööaja lubadus — ainult admin/toorandmed. Poes aku tööaega ei kuvata (seda ei kuvata ka teiste tarnijate puhul; mudelipõhine tööaeg oleks Laptopid.ee/mudeli andmetest — numbrit ei leiutata).

## 11. Klaviatuur (kogu poe jaoks)

- Uus register `src/domain/catalog/keyboard.ts` (kõik tarnijad): toorväärtus → kanooniline kood → silt. Näited: `SCA` → "Skandinaavia (SCA)", `DEU` → `DE` "Saksa (DEU)", `USA` → `US` "USA", `FRA` → "Prantsuse (FRA)", `INT` → "Rahvusvaheline (INT)", `SWE/FIN` → `SWE` "Rootsi/Soome (SWE)", `ARABIC` → "Araabia (ARABIC)". Varasemad koodid (SWE, NOR, EST, US, UK, DE) jäid samaks.
- Tundmatu kood → kuvatakse toorkujul (ei tõlgita valesti); puuduv → NULL; `Missing Keyboard` → BLOCK.
- Filter "Klaviatuur" (Täpsemad filtrid): valikud tulevad **SQL-ist** aktiivsete pakkumiste tegelikest väärtustest (tühje ei näidata), filtreerimine `kb_v` veerg `storefront` CTE-s — kogu kataloogi brauserisse ei tooda.

## 12. ProductModel ja pildid

Prioriteet (`planFoxwaySync`):

1. **täpne kanooniline slug** — sama jagatud resolver (`resolveModelRef`) mis Laptopid.ee/Tech → nt "Dell Latitude 5330 Touch 13.3"" = olemasolev `dell-latitude-5330`;
2. **Apple võtmed** — Laptopid.ee Apple'i mudelid on teise kirjapildiga ("MacBook Air M2 2022"): vaste, kui seeria + aasta + ekraani täisosa + kiibi põlvkond klapivad ja kandidaate on täpselt üks (`matchAppleModel`);
3. muidu **uus minimaalne mudel** (tootja, seeria, mudel, põlvkond, ekraan; kaal/pordid/Wi-Fi = NULL).

ProductName'i normaliseerimine (`foxway-names.ts`): eemaldatakse ekraani suurus, "Touch" ja kirjeldavad sulud ("(Intel)", "(2023)", "(12th Gen Intel)"), "(11th Gen)" → "Gen 11", seeria kirjapilt ("Thinkpad" → "ThinkPad"); mudelikoodid jäävad ("Vivobook 15 (X1502)" → "VivoBook 15 X1502"), et eri mudeleid kokku ei liidetaks. Apple: `MacBook Air 13" 2020 M1`, `MacBook Pro 13" 2020 (4 TBT3)`.

Olemasolevat mudelit Foxway ei muuda. Olemasoleva pakkumise mudeli seos on admini väli (sync ei muuda). **Pildid:** sama hierarhia mis Laptopid.ee/Tech — mudeli pildid (Icecat) → sama mudeli teise tarnija pakkumise pildid → illustratsioon. Foxway API pilte ei anna; suvalisi e-poe/Google'i pilte ei kasutata. Icecati automaatne vaste vajab GTIN/MPN-i (Foxway annab MPN-i vähestel ridadel) ja piltide püsiv salvestus (R13) puudub → rikastuseta mudelid on adminis nimekirjas, Icecati vaste lisatakse adminis. Poe pildid jäävad current-page-only / lazy / Next Image.

## 13. Snapshot'i ohutus

Kõik võrgutööd ja kontrollid on **enne** tehingut; kirjutamine on üks tehing.

| Olukord | Tulemus |
| --- | --- |
| ükski 4 päringust ebaõnnestub (võrk, 401/403, 5xx, tühi keha, mitte-JSON, mitte-massiiv) | **FAILED**, midagi ei muudeta |
| kõik feed'id tühjad | **FAILED** (`EMPTY_SNAPSHOT`) |
| vigaseid ridu üle max(10, 20%) | snapshot pole usaldusväärne → puuduvaid maha ei võeta |
| varem saadaval SKU-dest puudub üle max(20, 50%) | pole usaldusväärne (admin: "Luba suur muutus") |
| usaldusväärne | puuduv SKU → `stock = 0`, `available = false` (rida ja ajalugu jäävad, tagasi tulles taastub) |

Hard delete'i pole. Sync on idempotentne (sama snapshot → ainult ajatemplid). `manual_overrides`, `status`, `featured`, `description` ja olemasoleva pakkumise `product_model_id` jäävad puutumata.

## 14. Ajastamine

- **Admin → Tarnijad → Foxway → Sync now** (tühjendab poe vahemälu) + "Luba suur muutus".
- **`GET /api/cron/foxway-sync`** päisega `Authorization: Bearer <CRON_SECRET>`: 401 vale/puuduv, 503 seadistamata (`CRON_SECRET` või Foxway env), 200 SUCCESS/BUSY, 502 FAILED. Vastuses pole tooteandmeid ega saladusi. Muutuste korral `revalidateTag('catalog', { expire: 0 })`.
- **`npm run foxway:sync`** (CLI, ei tühjenda deploy'tud poe vahemälu) ja **`npm run foxway:sync -- --dry-run`** (ainult lugemine, raport: feed'id, SKU-d, rikked, hinnanäited).
- Lukk `catalog_sync_runs` allikas `FOXWAY` (eraldi Laptopid.ee ja Techi lukust).

### Upstash QStash (Europe/Tallinn)

| Schedule | Cron | |
| --- | --- | --- |
| `foxway-daytime-sync` | `CRON_TZ=Europe/Tallinn */30 8-23 * * *` | 08:00–23:30 iga 30 min |
| `foxway-nightly-sync` | `CRON_TZ=Europe/Tallinn 0 0-6/2 * * *` | 00:00–06:00 iga 2 h |

Sama muster mis Laptopid.ee: GET, edastatud `Authorization: Bearer <CRON_SECRET>`, korduskatseid 0. Verceli varu-cron'i Foxway jaoks ei lisatud (Hobby plaanis on üks igapäevane cron Laptopid.ee jaoks). Admini stale-hoiatus: päeval üle 45 min, öösel üle 150 min vana edukas sync.

## 15. Tellimine Foxwayst (käsitsi hange)

Automaatset Foxway tellimust, dropshippingut, tarnija kassat ega Foxway order API-t **ei kasutata** — tellime käsitsi, sest enne võib küsida erihinda. Admin peab aga nägema, mida tellida:

- Tellimuse loomisel (samas tehingus) luuakse igale Foxway reale `order_item_procurements` kirje: tarnija, **Foxway SKU, ItemVariantId**, Foxway tootenimi, **hinnakirja hind tellimuse hetkel** (snapshot). Kliendi müügihind on `order_items.unit_price_cents` (snapshot).
- Admin → tellimus → "Tarnijalt tellimine (Foxway)": **Tellida Foxwayst → Foxwayst tellitud → Tarnija saatnud → Meieni jõudnud** (kuupäevad täituvad ise), tarnija tellimuse viide, märkus, **tegelik ostuhind** (võib erineda hinnakirja hinnast — mõlemad säilivad), valikuline seerianumber (Foxway annab selle alles pärast tellimist). Muudatus läheb tegevuslogisse.
- Tarnijad → Foxway → "Tellida Foxwayst" loendur (päris tellimused; testtellimused eraldi).

## 16. Tootmisseis (2026-10-12)

- Esimene tootmissync 15:15 Eesti aeg (QStash ühekordne sõnum → `/api/cron/foxway-sync` → DELIVERED 200): **SUCCESS, 5,7 s**, usaldusväärne snapshot.
- Read: Working PC 642, Working Mac 100, Brand New PC 0, Brand New Mac 1 (sama SKU ka working feedis) → **741 SKU-d**, **1374 tk**; vigane rida 1 (Price 0).
- Poodi 630 · blokeeritud 94 · ülevaatus 17 · tundmatuid rikketekste 0 · IsVatMargin 83 SKU-l · pikem garantii (Laptopid.ee mudelilt, kuni 36 kuud) 26 SKU-l · Maci resolutsioon mudelist 20 SKU-l.
- Seisukord: B 341, C 292, A 93, C+ 9, A+ 5, Uus 1. Boxed: Charger included 380, Unboxed 334 (tavaline 35 € 275, suure võimsusega 90 € 59), Original Box 27.
- Klaviatuur: SCA 478, DE 71, US 60, ITA 33, FRA 29, ESP 19, INT 19, ARA 6, SWE 4, PRT 4, CZE 3, HUN 3, RUS 3, KOR/JPN/ISL/HRV/NOR/GRC 1, Missing Keyboard 3 (BLOCK).
- Mudelid: olemasolevad 71 (sh Apple MacBook Air M2 2022 ja MacBook Pro M2 Pro 2023), uued 248. Pildid (mudelid): taaskasutatud 50, Icecat 17, puudu 252.
- QStash schedule'id: `foxway-daytime-sync` `scd_5arBJLAS1ZjXS8HT7Y6GzkFwc3zT`, `foxway-nightly-sync` `scd_5ebTr88EVaeAJzetJ5vtqqPS3JS2`.

## 17. Testid

- `src/integrations/foxway/foxway.test.ts` (47) + `foxway-client.test.ts` (4: päised/URL, tühi keha vs `[]`, AUTH/JSON/skeem, kordused) — seadistus (võti ei leki), skeem, kõik rikkeklassid (Working ja Working*, primaarne + lisarike, tundmatu), seisukord (Uus, C+, D → BLOCK), laoseis, hind (KM + 60 + laadija, kampaaniahinna konks), laadija 0/35/90 (tööjaam, RTX vs MX), mitte-EUR, klaviatuur (SCA/DEU/FRA, tundmatu, Missing Keyboard), nimed ja slug'id, Apple M1/M2 (nimi, CPU filter, vaste), CPU/GPU/ekraan/ketas/OS, tahvlid, kriitilised väljad, dedup (working + new → üks, kogus ei kahekordistu; konflikt), tühi snapshot, usaldusväärsus.
- `src/server/catalog-sync/foxway-sync.db.test.ts` (16, sh tarnija andmata omadused ei kuvata "Ei"-na; päris PostgreSQL ajutises skeemis) — esimene sync (SKU, laoseis, hind, tarne, garantii 36 Laptopid.ee mudelilt, aku 6, C+), blokeeritud/ülevaatus poest väljas + märkused, dedup, mudeli + piltide taaskasutus, idempotentsus, muutused (laoseis, hind, rike, laoseis 0), puuduv SKU usaldusväärses snapshot'is, katkine snapshot ja suur kadu ei võta maha, admini parandused (hind, seisukord, avaldamine), kassa täpse laoseisuga, klaviatuuri filter SQL-ist + C+ filter, otsene tootelehe päring (MacBook "Retina"), suur fikstuur + lehekülgedeks jaotus, hankekirje tellimusel, lukk.
- `src/app/api/cron/foxway-sync/route.test.ts` (6), `src/domain/catalog/foxway-storefront.test.ts` (3).
