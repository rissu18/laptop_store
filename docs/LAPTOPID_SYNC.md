# Laptopid.ee kataloogi sync

Sülearvutid.ee päris kataloog tuleb Laptopid.ee API-st. Selles dokumendis on kirjas, kuidas andmed liiguvad, kuidas neid kontrollitakse ja miks just nii.

> Seotud: [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE.md](DATABASE.md), [ADMIN.md](ADMIN.md), [ORDERS.md](ORDERS.md), [DISCOUNTS.md](DISCOUNTS.md).

## 1. Põhimõte

```
Laptopid.ee API (products.php + images.php)
  → valideerimine (zod) → normaliseerimine
  → sync-teenus (lukk, üks tehing)
  → PostgreSQL (product_models + supplier_listings + listing_images)
  → olemasolev catalog-service
  → avaleht, /sulearvutid, filtrid, otsing, tooteleht, võrdlus, finder, ostukorv, sooduskoodid, kassa, tellimused
```

- **Laptopid.ee API on upstream'i tõeallikas.** Poe tööaegne tõeallikas on **PostgreSQL**.
- Pood, kassa ega tellimused ei tee **kunagi** päringuid otse Laptopid.ee API-sse. Kassa loeb hinna ja saadavuse andmebaasist (sh admini parandused ja sooduskoodid).
- Laptopid.ee vana `/hinnavaatlus` XML-i ei puututa.
- Kood:

| Kiht | Fail |
| --- | --- |
| API klient (ainult server) | `src/integrations/laptopid/laptopid-client.ts` |
| Toorvastuse skeem | `src/integrations/laptopid/laptopid-schema.ts` |
| Normaliseerimine | `src/integrations/laptopid/laptopid-normalizer.ts` |
| Snapshot'i kontroll | `src/integrations/laptopid/laptopid-snapshot.ts` |
| Sync-teenus | `src/server/catalog-sync/laptopid-sync.ts` |
| Lukk ja käivituste ajalugu | `src/server/catalog-sync/sync-runs.ts` |
| Pildi mõõtude lugemine | `src/server/catalog-sync/image-probe.ts` |
| Admin "Sync now" | `src/server/admin/suppliers/actions.ts`, `/admin/suppliers` |
| Ajastatud otspunkt | `src/app/api/cron/laptopid-sync/route.ts` |
| Käsurida | `npm run laptopid:sync` |

## 2. Tegelik API (kontrollitud 2026-10-11)

Mõlemad otspunktid asuvad samas kataloogis ja neid kutsutakse päisega `X-API-Key`; ilma võtmeta vastus on `401 {"error":"Unauthorized"}`. Vastused on `Cache-Control: no-store` ja kujul **paljas JSON massiiv**: ümbrist, `count` välja ega `snapshot_complete` markerit ei ole.

- `products.php`: 305 toodet (arvu koodis kirjas ei ole). Väljad:
  - `id` (number);
  - `manufacturer`, `model`, `cpu`, `ram`, `storage`, `screen`, `gpu`, `os` (tekst, sageli lõputühikuga);
  - `usb_c`, `usb_2`, `usb_3` (arv);
  - `thunderbolt_3`, `thunderbolt_4`, `hdmi`, `displayport`, `vga`, `dvi`, `lan`, `sd_card_reader`, `smartcard_reader`, `webcam`, `ir_camera`, `fingerprint_reader`, `docking_support`, `backlit_keyboard`, `touchpad`, `pointing_stick`, `numpad`, `mobile_4g`, `privacy_screen`, `yoga` (0/1);
  - `refresh_rate` (arv, üks väärtus on 0);
  - `keyboard_layout` (SWE, ENG, GER, EST, SWE/RUS või "");
  - `new_price`, `sale_price` (tekst "749.00");
  - `defects`, `ports` (HTML-killud);
  - `mouse`, `video_outputs`, `pdf_url`, `slug` (tekst);
  - `guarantee` (kuud);
  - `battery_hours`, `weight` (tekst);
  - `grade` (A+, A, B, C, **New, Demo, Outlet**).
- `images.php`: 1139 kirjet (`product_id`, `image_id`, `sort_order`, `image_url`). URL on kujul `https://laptopid.ee/images/product//<toode>/<pilt>/original.png` (topeltkaldkriipsuga). Samal aadressil on olemas ka `small.png` (200 px) ja `medium.png` (800 px). 4 pilti vastavad 404.

**Wi-Fi ja Bluetoothi välju API-s ei ole.** Eelmine `/api/products` lisas `wifi: true`, `bluetooth: true` ja asendas puuduva USB 0-ga. Sync seda ei tee: puuduv väärtus jääb `NULL`-iks.

### Seadistus

| Muutuja | Tüüp | Väärtus |
| --- | --- | --- |
| `LAPTOPID_API_BASE_URL` | Config | `https://laptopid.ee/api/sulearvutid/` |
| `LAPTOPID_API_KEY` | Secret | Laptopid.ee API võti — ainult server, ainult päises `X-API-Key` |

- Klient (`src/integrations/laptopid/laptopid-config.ts` → `laptopid-client.ts`) ehitab otspunktid URL API-ga: `new URL("products.php", base)` ja `new URL("images.php", base)`. Lõpu-kaldkriips lisatakse vajadusel, lubatud on ainult `https`.
- See on **ainus koht**, kust sync, admini diagnostika (`/api/products`) ja CLI URL-id saavad; mujal `products.php`/`images.php` aadresse koodis pole.
- Puuduv või vigane seadistus → kontrollitud viga `NOT_CONFIGURED` (sync = FAILED, logi). **Hardcoded tagavara-URL-i ei ole.** Pood töötab edasi viimase eduka andmebaasi seisuga, sest pood ei loe API-d kunagi.
- `NEXT_PUBLIC_LAPTOPID_*` muutujaid ei ole (võti ei tohi brauserisse jõuda).
- Vana ühe-URL-iline muutuja (`…/v1/products`, vastas 404) on Vercelist ja koodist eemaldatud (2026-10-11).

## 3. Identiteet

- **Allikas + väline ID:** `supplier_listings.supplier = 'laptopid'` ja `supplier_product_id = '<Laptopid id>'`, nt `6678`. Unikaalsuse tagab olemasolev indeks `supplier_listings_supplier_product_uq (supplier, supplier_product_id)`.
- Avalik pakkumise ID on `laptopid-6678` (sama vorming mis mock'il). Meie SKU on `LP-6678`.
- Sama ID järgmises sync'is uuendab sama rida. Uut rida ei teki (testitud ka päris andmetega).
- **Slug ei ole identiteet.** Laptopid.ee slug salvestatakse ainult viitena (`details.upstreamSlug`).

## 4. ProductModel ja SupplierListing

- Iga Laptopid.ee toode on **üks SupplierListing** (müüdav konfiguratsioon). Näiteks 11 ThinkPad X1 Carbon G10 konfiguratsiooni on 11 eraldi pakkumist **ühe mudeli all**. Toodet ei grupeerita.
- **Mudeli leidmine on konservatiivne.** Tootja, seeria ja mudel viiakse kanoonilisele kujule:
  - `parseBrand`, `splitSeries`, `canonicalModelName` (failis `src/integrations/supplier/model-names.ts`);
  - Lenovo ThinkPad "T14 G3" → "T14 Gen 3" (Lenovo ametlik nimi, mock'is juba nii);
  - "2in1" → "2-in-1".

  Neist arvutatakse slug täpselt samamoodi nagu olemasolevatel mudelitel. **Vaste = täpselt sama slug.** Kui vastet pole, luuakse uus mudel ("parem uus kui vale merge"). Näiteks "Latitude 7420 Carbon" ja "Latitude 7420" on eraldi mudelid.
- Laptopid.ee ei anna GTIN-i ega tootja koodi (MPN), seega identifikaatoritega võrrelda ei saa.
- Esimese sync'i tulemus: 285 pakkumist, **122 uut mudelit** ja **21 olemasolevat mock-mudelit** (nt `dell-latitude-5430`, `lenovo-thinkpad-t14-gen-3`). Olemasolevatel mudelitel jäävad alles Icecati pildid ja admini otsused.
- Kui tarnija hiljem mudeli nime muudab, mudeli seost sync ei muuda. See on admini otsus (`product_model_id`); sync loendab juhtumid (`modelMismatches`).

### Tundmatu tootja, seeria või seisukord

- Lisatud tootjad: Fujitsu (LifeBook), Samsung (Galaxy Book) ja Apple (MacBook Air/Pro).
- Lisatud seeriad: XPS, ThinkBook, Yoga ja **Lenovo V-seeria** (`V Series`).
- Tundmatu **tootja**, tühi mudel või tundmatu **seisukord** → kirje lükatakse tagasi ja on nähtav adminis (Tarnijad → "vahele jäetud").

### Lenovo V-seeria

Lenovo V-seeria (V330-14IKB, V340-17IWL, V14 G2 ITL, V15-IIL) tuvastatakse konservatiivse mustriga, mis kehtib ainult tootjale Lenovo: `V` + kolm numbrit + `-NN` + tähed, või `V13`/`V14`/`V15`/`V17`. Mitte iga V-ga algav nimi ei kuulu siia (nt Delli "Vostro" ei kuulu).

- Seeria on `V Series` (filtris "Lenovo V-seeria"), mudel kogu nimi (`V330-14IKB`) ja pealkiri **"Lenovo V330-14IKB"**: seeriat pealkirja ei korrata (`src/domain/catalog/title.ts`). Slug on `lenovo-v330-14ikb`.
- Fuzzy-vastet olemasoleva Lenovo mudeliga ei tehta.

### Tundmatu seeria (tagavara)

Kui tootja ja mudel on korras, aga seeria taksonoomia on tundmatu, **toodet välja ei visata**:
- seeria = mudelinime esimene sõna (nt "IdeaPad"), mudel = kogu nimi, pealkiri = tootja + mudel;
- luuakse uus mudel; vale mudeliga kokku ei panda;
- sync logib hoiatuse (`taxonomyWarnings`, WARN) ja admin näeb seda (Tarnijad → "Imporditud hoiatusega"), et seeria vajadusel parandada.

### Seisukord "Uus" (New / Demo / Outlet)

| Laptopid.ee `grade` | Meie klass (`supplier_listings.grade`) | Kliendile |
| --- | --- | --- |
| `New`, `Demo`, `Outlet` | `NEW` | **Uus** |
| `A+`, `A`, `B`, `C` | sama | A+ · Nagu uus … C · Rahuldav |

- Kliendi filtris on "Uus", A+, A, B, C. Demo ja Outlet eraldi valikuna ei kuvata.
- **Tarnija algne klass säilib:** `details.sourceGrade` (nt `"Demo"`) ja toorandmetes `raw_data.product.grade`. Admin näeb seda konfiguratsiooni lehel ("Seisukord (tarnija algne)"). Tavapärane admini parandus (`manual_overrides.grade`) töötab edasi ja sync seda ei puutu.
- Seisukordade selgitus ei väida, et seade on avamata tehasepakendis: "Uus" võib olla ka demo- või outlet-seade (nt avatud pakendiga).
- Seisukorrad on failis `src/domain/grade/grades.ts`, Laptopid vastendus on `mapLaptopidGrade` (`laptopid-normalizer.ts`).

## 5. Väljade omanik

| Tase | Väljad | Kust |
| --- | --- | --- |
| **SupplierListing** (konfiguratsioon) | CPU, RAM, SSD, GPU, ekraan (suurus, resolutsioon, paneel, puutetundlikkus), OS, klaviatuur, seisukord, garantii, müügihind, saadavus, kaal, defektid; tunnused (`features`): sõrmejälg, Smart Card, taustavalgus, numpad, IR-kaamera, 4G, Thunderbolt, USB-C, HDMI, LAN, SD, 2-in-1 | iga Laptopid.ee toode eraldi |
| SupplierListing `details` (JSONB) | USB-A/USB-C arv, Thunderbolt 3/4, DisplayPort, VGA, DVI, veebikaamera, TrackPoint, dokk, privaatsusekraan, värskendussagedus, CPU max MHz, aku tunnid, videoväljundid, pordid vabatekstina, PDF, `new_price`, allikas | iga toode eraldi (`details.source = "LAPTOPID"`) |
| **ProductModel** | tootja, seeria, mudel, põlvkond, ekraani suurus, kaal, USB-A/USB-C arv | **sagedaseim väärtus** selle mudeli Laptopid.ee pakkumistest; Wi-Fi/Bluetooth = NULL |

- Konfiguratsioonist sõltuvaid omadusi (puuteekraan, sõrmejälg, Smart Card, taustavalgus, privaatsusekraan, 4G, värskendussagedus, numpad, IR-kaamera) **ei panda mudeli universaalseteks omadusteks**.
- Tootelehel eelistatakse konfiguratsiooni väärtust (USB arv, kaal) ja mudeli väärtus on varuvariant.
- Struktureeritud väljad on esmased. `ports` vabatekst on ainult `details.portsText` (varuvariant, poes ei kuvata).
- `defects` teisendatakse lihttekstiks (HTML eemaldatud). Poes kuvatakse see kui "Märkus" (nt "Üks USB-C ei tööta").
- `battery_hours` salvestatakse, aga **poes ei kuvata**: pole teada, kas see on tootja väide või mõõdetud tööaeg.
- Toorandmed on `raw_data` veerus (koos normaliseerija versiooniga) silumiseks ja muutuste tuvastamiseks.

## 6. Laoseis: saadaval, aga kogus teadmata

Laptopid.ee **ei anna laokogust**. Kui toode on aktiivses nimekirjas, on vähemalt 1 tk füüsiliselt Laptopid.ee laos, aga tegelikult võib neid olla ka 2, 5 või 10.

| | `available` | `stock` (kogus) |
| --- | --- | --- |
| Laptopid.ee, nimekirjas | `true` | `NULL` (teadmata, **mitte 1**) |
| Laptopid.ee, puudus usaldusväärsest snapshot'ist | `false` | `NULL` |
| Tulevane tarnija täpse kogusega | `true` | nt `7` |
| Vana mock | `NULL` | nt `3` (käitumine nagu enne) |

Reeglid on failis `src/domain/catalog/availability.ts` (`resolveStock`, `orderQuantityLimit`, `stockLabel`):

- **Poes:** "Kohe saadaval". Kunagi ei kuvata "Laos 1 tk" ega "Ainult 1 tk".
- **Ostukorv:** teadmata koguse korral on automaatselt lubatud **1 tk rea kohta**. Kui klient proovib rohkem, jääb kogus 1-ks ja kuvatakse teade: *"Täpne laokogus ei ole automaatselt teada. Rohkema kui ühe seadme saadavuse kontrollimiseks võta meiega ühendust."* Me ei väida, et laos on ainult üks.
- **Kassa:** sama piir serveris. Kogus > 1 → tellimust ei looda, sama teade, ja kogust ("saadaval 1") ei näidata.
- Admin saab vajadusel seada täpse koguse parandusena (`stock` override).

## 7. Hinnad

- `sale_price` → `supplier_listings.sale_price_cents` (sentides, ilma ujukomata) ja `price_source = 'SUPPLIER'`.
- `new_price` → `details.newPriceCents`. See on **ainult kontekst** (nt uue seadme hind). Seda **ei kuvata** läbikriipsutatud "enne" hinnana, sest see pole meie varasem hind.
- **Kumbki ei ole ostuhind.** `supplier_price_cents` (cost) jääb `NULL`.
- Hinnastamismootor (`/admin/pricing`) `price_source = SUPPLIER` pakkumisi **ei puuduta**.
- Sooduskoodid: ostuhind on teadmata → marginaalikaitse (`minimumAllowedPrice`) jääb rakendamata ("kontrollimata", olemasolev loogika). DiscountEngine töötab uute pakkumistega muutmata kujul (testitud: 10% kood → −74,90 €).

## 8. Admini parandused

Olemasolev süsteem on tarnija väärtus veerus pluss parandus `manual_overrides` all; kehtiv väärtus = parandus ?? tarnija väärtus.

- Sync kirjutab ainult tarnija veerge ega puuduta kunagi `manual_overrides`, `status`, `featured` ega `description` välju.
- Tarnija hinnaga pakkumisel on müügihind **tarnija väli**, seega admini hind salvestub parandusena (`listingOverridableFields('SUPPLIER')`).
- Näide, mida testiti ka käsitsi päris andmetel:
  - API hind on 749 €, admin seab 719 € → kehtib 719 €;
  - API hind muutub 769 €-ks → tarnija väärtus 769 €, kehtib endiselt 719 €;
  - admin vajutab "Taasta" → kehtib 769 €.

## 9. Täielik snapshot ja puuduvad tooted

API-s pole `snapshot_complete` markerit, seega on kontroll konservatiivne (`laptopid-snapshot.ts`).

**Kogu sync ebaõnnestub ja andmebaas ei muutu**, kui:
- võtit pole, autentimine ebaõnnestub, tekib timeout, võrguviga või HTTP viga (kumbagi otspunkti puhul);
- vastus pole JSON massiiv;
- toodete nimekiri on tühi;
- ID-d korduvad;
- skeemivigaseid kirjeid on üle 5% (API vorming muutus).

**Puuduvaid tooteid maha ei võeta**, kui varem saadaval olnud pakkumisi puudub rohkem kui `max(10, 25% varem saadaval olnutest)`. Siis uuendatakse ainult vastuses olevaid tooteid ja logitakse hoiatus (WARN).

- Admin saab suure muutuse teadlikult kinnitada: "Luba suur muutus" (`allowLargeDrop`, kirjutatakse tegevuslogisse).
- Vastuses olev, aga vigane või tagasi lükatud kirje **ei ole "puuduv"**: selle eelmine seis jääb alles.

**Usaldusväärse snapshot'iga:**
- puuduv pakkumine saab `available = false` → kaob poest, otsingust ja ostukorvist; kassa blokeerib selle ("Toode ei ole enam saadaval.");
- tagasi tulnud pakkumine saab `available = true` (`reactivated`).

## 10. Sync'i sammud, lukk ja idempotentsus

1. Lukk: `catalog_sync_runs` tabelis võib allika kohta olla üks `RUNNING` rida (osaline UNIQUE indeks). Lukk aegub 5 minutiga (katkenud serverless-funktsioon), siis võetakse see üle. Kui teine sync käib, tulemus on `BUSY`.
2. API (mõlemad otspunktid paralleelselt, timeout 20 s, kuni 2 kordust ajutiste vigade korral).
3. Valideerimine.
4. Normaliseerimine.
5. Mudelid (vaste või uus mudel; mudeli tarnija veerge uuendatakse ainult muutuse korral).
6. Pakkumiste upsert. Muutust tuvastatakse `raw_data` järgi (toorandmed + pildid + normaliseerija versioon).
7. Pildid: uutel loetakse mõõdud, eemaldatud kustutatakse, muutunud uuendatakse.
8. `last_seen_at` ja `last_synced_at` kõigile vastuses olnud pakkumistele.
9. Puuduvad → `available = false` (ainult usaldusväärse snapshot'iga).
10. Logi (`system_logs`, allikas `LAPTOPID`) ja tulemus `catalog_sync_runs` tabelisse.

Kõik võrgutööd (API, pildi mõõdud) tehakse enne tehingut ja kõik kirjutamised on **ühes tehingus**.

**Idempotentne:** sama vastus kaks korda → teisel korral `created 0, updated 0, unchanged 285`, ainult `last_seen_at` muutub (kontrollitud päris andmetega).

Logitakse: algus, lõpp, `received`, `valid`, `rejected`, `created`, `updated`, `unchanged`, `reactivated`, `madeUnavailable`, `missingNotDeactivated`, mudelite ja piltide arvud, `imageErrors`, kestus, edu või viga ning tagasi lükatud kirjete näidis. API võtit ei logita kunagi (see on ainult päises).

## 11. Pildid ja Icecat

- Laptopid.ee pildid on **pakkumise tasemel** (iga toode oma galeriiga) ja lähevad eraldi tabelisse `listing_images`. Mudeli pildid (`product_images`, Icecat) jäävad eraldi, et admini/Icecati järjestamine neid ei segaks.
- Faile **Git'i ei laeta**. Salvestatakse kaugaadressid: thumbnail = `small.png`, medium = `medium.png`, large = `original.png`. Mõõdud loetakse originaali päisest HTTP Range päringuga (~30 baiti, mitte 1 MB faili).
- Poes kuvatakse kaugpildid Next/Image kaudu (`StoredImage` → `next/image`, `fill` + `sizes`), mis optimeerib 0,4–2 MB PNG-d WebP/AVIF-iks õiges laiuses. `remotePatterns` lubab **ainult** `https://laptopid.ee/images/product/**`; `maximumRedirects: 0` ja `minimumCacheTTL` on 31 päeva (Laptopid annab muutunud pildile uue ID).
- Puuduv või katkine pilt toodet katki ei tee: mõõtude lugemine ebaõnnestub → pilti ei lisata (järgmine sync proovib uuesti; praegu 4 katkist pilti), poes kuvatakse ülejäänud pildid, mudeli Icecati pildid või illustratsioon.
- Kuvamise järjekord: pakkumise pildid → mudeli (Icecat) pildid → illustratsioon.
- Laptopid pildid on tüübiga `MODEL_GENERIC`, mitte `ACTUAL_UNIT`, sest pole kinnitatud, et foto on täpselt müüdavast eksemplarist. Seetõttu kuvatakse "illustratiivne" märge.
- **Icecat** jääb mudeli piltide varu- ja rikastusallikaks ega kirjuta kunagi pakkumise konfiguratsiooni andmeid üle (Icecati import puudutab ainult `product_images` ja `icecat_metadata` tabeleid).

## 12. Vahemälu ja värskus

```
Laptopid.ee muutus
  → products.php / images.php        (Cache-Control: no-store — kohe)
  → sync                              (Sync now / ajastatud / CLI — vt §13)
  → PostgreSQL                        (üks tehing)
  → kataloogi vahemälu               'use cache' + cacheTag('catalog'), cacheLife('max'):
                                        admin "Sync now" → updateTag('catalog') (alati)
                                        cron → revalidateTag('catalog', { expire: 0 }) (kui midagi muutus)
  → pood                              järgmine päring loeb värske kataloogi
  → kassa                             loeb pakkumised OTSE andmebaasist (vahemäluta) → kohe pärast sync'i
```

- **Järjestikuseid 5-minutilisi vahemälusid ei ole.** Upstream on `no-store`, sync ei lisa vahemälu, kataloogi vahemälu tühjendatakse sildiga ja kassa ei kasuta vahemälu.
- Eelmine `/api/products` (avalik, `s-maxage=300`) oli lisakiht, mida pood ei kasutanud. See on nüüd ainult admini diagnostika (`no-store`).
- Käsurea sync (`npm run laptopid:sync`) ei saa deploy'tud poe vahemälu tühjendada. Pärast seda vajuta adminis "Sync now" (tühjendab alati) või tee deploy.
- Pildid: Next/Image optimeeritud pilt on vahemälus kuni 31 päeva (pildi URL muutub koos pildi ID-ga).

**Värskus = sync'i sagedus** (§13). Pärast sync'i on pood ja kassa kohe ajakohased.

## 13. Ajastamine (automaatne ja käsitsi)

- Projekt on **Vercel Hobby** plaanil. Hobby cron töötab **kõige rohkem kord päevas** ja täpsus on ±59 min; tihedama ajakavaga deploy ebaõnnestub. **5-minutilist automaatset sync'i Hobby plaanil ei saa.** Võltslahendust (nt sync iga lehe avamisel) ei tehtud.
- Tehtud on:
  - **Admin → Tarnijad → "Sync now"**: kaitstud nagu kõik admini toimingud (sessioon + päritolu/CSRF), `maxDuration` 300 s;
  - **`GET /api/cron/laptopid-sync`**: kaitstud `Authorization: Bearer <CRON_SECRET>` päisega, ajast sõltumatu võrdlusega; ilma `CRON_SECRET`-ita vastab 503 (fail-closed);
  - **`vercel.json`**: üks igapäevane cron (`0 3 * * *`, UTC), mis töötab alles siis, kui Vercelis on seadistatud `CRON_SECRET` (vähemalt 16 märki);
  - **`npm run laptopid:sync`**: käsurida (`-- --allow-large-drop`).
- **Järgmine etapp (vajab otsust):** 5-minutiline sync. Valikud:
  - Vercel Pro (cron iga minut);
  - väline ajastaja (nt GitHub Actions `*/5`, mis kutsub cron-otspunkti `CRON_SECRET`-iga; privaatses repos kulutab see Actionsi minuteid);
  - oma server/VPS worker (Phase 9 plaan).

  NB: Hobby on Verceli tingimustes mõeldud mitteäriliseks kasutuseks.

## 14. Mock-kataloog

- Mock-tarnija andmed (`supplier = 'mock'`, 46 pakkumist) **jäävad alles**: testid, arendus ilma andmebaasita ja vanad viited.
- Tootmise ümberlülitusel arhiveeritakse need (`status = ARCHIVED`): `npm run catalog:archive-mock -- --confirm`. Midagi ei kustutata ja iga muudatus läheb tegevuslogisse. Tagasi saab adminis (staatus → Aktiivne).
- Mudeleid ei arhiveerita, sest kataloog põhineb pakkumistel. Ilma aktiivse pakkumiseta mudel poes ei kuvata, aga mock-mudelile võib hiljem tulla Laptopid pakkumine (sama kanooniline nimi).

## 15. Testid

`src/integrations/laptopid/laptopid.test.ts`, `src/domain/catalog/availability.test.ts`, `src/server/catalog-sync/image-probe.test.ts` ja `src/server/catalog-sync/laptopid-sync.db.test.ts` (päris PostgreSQL, ajutine skeem `test_xxxx`, API asendatud päris vastuse kujuga testandmetega).

Kaetud on:
- **API ja normaliseerimine:** skeemi valideerimine, allikas + väline ID, struktureeritud pordid ja omadused, piltide vastendamine;
- **sync:** esimene sync loob, teine ei tekita duplikaate, muutunud andmed uuendavad, sama mudeli konfiguratsioonid jäävad eraldi, admini parandus jääb alles, sync'i lukk;
- **hinnad ja laoseis:** sale_price/new_price ei ole ostuhind, puuduv ostuhind on NULL, nimekirjas olev toode = saadaval, täpne kogus jääb teadmata, UI ei väida "1 tk", kogus 1 on lubatud, kogus > 1 käsitletakse õigesti;
- **snapshot:** API viga ja vigane vastus jätavad vana kataloogi alles, poolik snapshot ei võta midagi maha, usaldusväärne snapshot võtab puuduva maha, tagasi tulnud toode taastub;
- **pood ja kassa:** imporditud toode on kataloogis ja otsingus, ostukorvis on täpne SupplierListing, kassa loeb hinna andmebaasist, kassa tuvastab hinnamuutuse, mitte saadaval toode blokeeritakse, vana tellimuse snapshot ei muutu, sooduskood töötab ilma ostuhinnata.
