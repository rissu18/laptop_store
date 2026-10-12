# Tech hinnakirja sync (teine päris tarnija)

Tech on Sülearvutid.ee teine päris tarnija. Techi laoseis on avalikus Google Sheetsi hinnakirjas, kus iga rida on **üks konkreetne füüsiline seade** (Tech ID + seerianumber). See dokument kirjeldab, kuidas hinnakiri jõuab poodi ja miks just nii.

> Seotud: [LAPTOPID_SYNC.md](LAPTOPID_SYNC.md) (esimene tarnija, samad ohutuspõhimõtted), [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE.md](DATABASE.md), [ADMIN.md](ADMIN.md), [ORDERS.md](ORDERS.md).

## 1. Põhimõte

```
Google Sheet "Used Laptops" (avalik)
  → XLSX eksport (MITTE CSV)                           src/integrations/tech/tech-client.ts
  → ExcelJS: väärtused + lahtrite taustavärvid           src/integrations/tech/tech-workbook.ts
  → tabid ja sektsioonid → sülearvutite read            src/integrations/tech/tech-parser.ts
  → rida → füüsiline seade (värv, märkused, valideerimine) src/integrations/tech/tech-normalizer.ts, tech-notes.ts
  → dedup Tech ID järgi → konfiguratsiooni grupid → kontroll  src/integrations/tech/tech-snapshot.ts
  → sync (lukk, üks tehing)                             src/server/catalog-sync/tech-sync.ts
  → PostgreSQL: product_models + supplier_listings + supplier_inventory_units
  → olemasolev catalog-service → pood, otsing, ostukorv, kassa
```

- **Pood ei loe Google Sheetsi kunagi.** Pood, otsing, ostukorv ja kassa loevad ainult PostgreSQL-i. Kui Google on maas või aeglane või eksport ebaõnnestub, müüakse edasi viimase eduka sync'i seisu.
- Google'i kontot ega API tokenit pole vaja — tabel on avalik.

| Kiht | Fail |
| --- | --- |
| Seadistus (TECH_SHEET_URL → XLSX URL) | `src/integrations/tech/tech-config.ts` |
| Allalaadimine (ainult server, XLSX kontroll) | `src/integrations/tech/tech-client.ts` |
| XLSX lugemine (ExcelJS, ainult server) | `src/integrations/tech/tech-workbook.ts` |
| Värvid, lahtrite kuju | `src/integrations/tech/tech-sheet.ts` |
| Tabid/sektsioonid/päis | `src/integrations/tech/tech-parser.ts` |
| Märkused (K/L) | `src/integrations/tech/tech-notes.ts` |
| Normaliseerimine, hind, NOT_LAPTOP | `src/integrations/tech/tech-normalizer.ts` |
| Dedup, grupid, snapshot'i kontroll | `src/integrations/tech/tech-snapshot.ts` |
| Sync-teenus (plaan + kirjutamine) | `src/server/catalog-sync/tech-sync.ts` |
| Päris käivitamine (admin/cron/CLI) | `src/server/catalog-sync/tech-runner.ts` |
| Cron-otspunkt | `src/app/api/cron/tech-sync/route.ts` |
| Admin "Sync now" | `src/server/admin/suppliers/actions.ts` (`syncTechNowAction`), `/admin/suppliers` |
| Tellimuse rida ↔ seade | `src/server/orders/order-units.ts` |
| Käsurida (+ kuivkäivitus) | `npm run tech:sync [-- --dry-run]` |

## 2. Seadistus

| Muutuja | Tüüp | Väärtus |
| --- | --- | --- |
| `TECH_SHEET_URL` | Config (mitte saladus) | `https://docs.google.com/spreadsheets/d/1XeME_gZ3zCGPIptu7P59wQiw4NLWQOAh0kYMswH2I4o/edit` |

- Vercelis Production, Preview ja Development (lisatud 2026-10-12, `--no-sensitive`). Kohalikult `.env.local`.
- XLSX ekspordi URL ehitatakse **ainult** failis `tech-config.ts`: `https://docs.google.com/spreadsheets/d/<id>/export?format=xlsx`. Lubatud on ainult `https://docs.google.com/spreadsheets/d/…`.
- Puuduv või vigane URL → sync ei käivitu (`NOT_CONFIGURED`, cron 503), pood töötab edasi.
- Vastus peab olema zip (XLSX algab baitidega `PK\x03\x04`). HTML (nt sisselogimisleht, kui tabel muutub privaatseks) → viga, kataloogi ei muudeta. Ümbersuunamine lubatud ainult `docs.google.com` / `*.googleusercontent.com` peale. Max 25 MB, timeout 30 s, kuni 2 kordust.
- ExcelJS on `serverExternalPackages` all (`next.config.ts`) ja seda impordivad ainult `server-only` failid — brauseri bundle'isse see ei jõua.

### Miks XLSX, mitte CSV

Müüdud seadmed on hinnakirjas tähistatud **Brand/Model lahtri taustavärviga**. CSV kaotab värviinfo — siis näiks kõik müüdud seadmed müügis olevat. Seepärast CSV-d ei kasutata ja **CSV varuvarianti pole**: kui XLSX-is stiiliinfot pole, sync ebaõnnestub (vt §9).

## 3. Tabid ja sektsioonid (ainult sülearvutid)

Tabelis on ka monitore, lauaarvuteid, dokke ja varuosi — neid kataloogi ei impordita.

| Tab (seis 2026-10-12) | Käsitlus |
| --- | --- |
| `Used Laptops ` (lõputühikuga), `Laptops 2` | pealkirjadeta, nimes "laptop" → kogu tab on sülearvutid |
| `Laptops 3` | sektsioonid Desktops / Doking stations / **Laptops** → ainult "Laptops" sektsioon |
| `Incoming 1 07.10`, `Incoming 2 07.10` | sektsioonid Monitors / (Desktops) / **Laptops** → ainult "Laptops" sektsioon |
| `Monitors`, `Desktops`, `Parts + Docking stations` | ignoreeritakse täielikult |

Reeglid (ei sõltu konkreetsest tabi nimest ega kuupäevast):

- Tab, mille nimes on monitor / desktop / parts / dock → ignoreeritakse.
- **Kategooria pealkiri** = ühendatud lahter B:K (või vähemalt 3 sama väärtusega lahtrit B…K). Sektsioon "Laptops" algab pealkirjast ja lõpeb järgmise pealkirja juures.
- Pealkirjadega tab → imporditakse ainult "Laptops" sektsioon(id).
- Pealkirjadeta tab → sülearvutid ainult siis, kui nimes on "laptop". Muu tab (nt uus "Incoming" ilma "Laptops" pealkirjata) → **ei impordita**, hoiatus. Ei oletata.
- Päisereas kontrollitakse veergude asukohta: B=Brand, E=Serial, F=Processor, G=RAM, H=HDD, I=Display, J=Resolution. Kui ei vasta → kogu tab jäetakse vahele (layout error) ja snapshot pole usaldusväärne (puuduvaid maha ei võeta).

### Veerud

| Veerg | Sisu | Kasutus |
| --- | --- | --- |
| B | Brand | tootja (`parseBrand`); **värv = müüdud** |
| C | Model | mudel; **värv = müüdud** |
| D | Tech ID | füüsilise seadme identiteet (5–9 numbrit) |
| E | Serial Nr. | seerianumber (ainult trim, ei tükeldata) — ainult admin |
| F | Processor | CPU (`i5-1135G7` → `Intel Core i5-1135G7`) |
| G | RAM(MB) | 16384 → 16 GB (ainult 1024 kordne; "4GB" ka lubatud, "4" ebaselge → vigane) |
| H | HDD(GB) | `256 SSD`, `2 x 500 SSD`; **tüüp peab olema SSD** (pood kuvab kõikjal "SSD") |
| I | Display | `W14"` → 14 |
| J | Resolution | resolutsioon, paneel (IPS), `Touchscreen` → puuteekraan |
| K, L | märkused | tunnused / defektid / info (§5) |
| M | Price | hinnakirja hind (päis võib puududa) |
| N | Video | GPU |

## 4. Müüdud seadmed — värv

**Kui Brand (B) või Model (C) lahter on värvitud, on seade müüdud.** Värvi toon ei loe (punane, sinine, oranž, kollane, roheline, lilla, hall, must, helehall `#EFEFEF` …) — kõik tähendavad sama.

- Värvimata = täide puudub või valge (`FFFFFF`, teema "Background 1", indekseeritud valge). Läbipaistev = värvimata.
- Tundmatu täide (muster ilma loetava värvita) → värvitud (konservatiivne: pigem jääb seade müügist välja).
- Ainult hinna (M), märkuse (K/L) või muu lahtri värv **ei** tähenda müüdud.
- Päisrida (kollane) pole tooterida.
- Live-seis 2026-10-12: 248 värvitud rida 11 eri värviga, sh 30 helehalli (`#EFEFEF`) rida — need on spec'i järgi müüdud.

## 5. Märkused (K ja L)

Tõstutundetu, sõnapõhine (`tech-notes.ts`):

| Märkus | Tähendus | Mõju |
| --- | --- | --- |
| `bl` | taustavalgusega klaviatuur | tunnus `backlit`, eristab konfiguratsiooni |
| `id` | Smart Card / ID-kaardi lugeja (**mitte** sõrmejälg) | tunnus `smartcard` |
| `4g` | 4G/LTE | tunnus `lte` |
| `5g` | 5G (kasutaja otsus 2026-10-12) | tunnus `5g` |
| `dead battery`, `dead`, `no keyboard`, `missing keyboard`, `klava x`, `hinge`, `damage`, `laik`, `usb`, `fan`, `touchbar x`, `screen`, `scr` | defekt | **DEFECT** — aktiivsest laost välja (mitte "Grade B" all müüki) |
| `e`, `g`, `f`, `w`, `p` | Techi infokoodid (kasutaja otsus 2026-10-12: ei ole defekt) | ignoreeritakse, kliendile ei kuvata |
| `26%`, `19%` … | protsent (tähendus kinnitamata) | ignoreeritakse: ei mõjuta seisukorda, hinda, laoseisu; säilib toorandmetes |
| `hp 65w t.c.`, `65w blue`, `135w square` | laadija kirjeldus | ignoreeritakse (kõik Techi sülearvutid on laadijaga → `charger_included = true`) |
| **muu tekst** | tundmatu | **UNKNOWN_NOTE** — seade jääb müügist välja, admin näeb toorväärtust |

Tundmatut märkust ei tõlgendata — parem jätta seade välja kui müüa varjatud defektiga seadet. Live-seisus 31 sellist rida (Apple `n-650`/`sr-420`, `safety`, `new KB`, `type-c`, `L00164734`, `0`, `M.M.` …) — nende tähenduse saab lisada `tech-notes.ts` reeglitesse, kui see on kokku lepitud.

## 6. Mis ei lähe kataloogi

| Staatus | Põhjus |
| --- | --- |
| `SOLD` | Brand/Model värvitud |
| `NOT_LAPTOP` | tahvelarvuti või eemaldatava ekraaniga 2-in-1 (kasutaja otsus 2026-10-12): Tab M10, ZenPad, Toughpad / FZ-…, ElitePad, Elite x2, Pro x2, Surface Go/Pro/Book, Toughbook CF-20/CF-33, Miix, Latitude 7200/7210 2-in-1, Rugged Extreme Tablet, X1 Tablet; ekraan < 10" |
| `INVALID` | puudub/vigane Tech ID, seerianumber, mudel, CPU, RAM, salvestus (või tüüp pole SSD), ekraan või hind |
| `DEFECT` | defekt märkuses |
| `UNKNOWN_NOTE` | tundmatu märkus |
| `CONFLICT` | sama Tech ID mitmel real erinevate andmetega |
| `MISSING` | seade puudus usaldusväärsest täielikust snapshot'ist |

360° pööratava ekraaniga 2-in-1 (nt Latitude 7330 2-in-1, X1 Yoga, EliteBook x360) on sülearvuti ja jääb kataloogi.

## 7. Seisukord, hind, tarne, garantii

- **Seisukord: alati B** (`grade = 'B'`), sest Techi hinnakirjas seisukorda pole. Ei tuletata värvist, hinnast, mudelist ega protsendist. Admin saab parandada (`manual_overrides.grade`).
- **Hind** (`tech-normalizer.ts`):

  | | Valem | Näide M = 380 € |
  | --- | --- | --- |
  | Hinnakirja hind | M | 380 € (`details.sourcePriceCents`) |
  | Techi ostuhind | M − 20 € | 360 € → `supplier_price_cents` |
  | Meie müügihind | M + 60 € | 440 € → `sale_price_cents` (`price_source = SUPPLIER`) |

  440 € on kliendi lõpphind koos käibemaksuga — eraldi KM-arvutust ei tehta. M puudub, pole number või ≤ 20 € → seade `INVALID` (hinda ei leiutata).
- **KM režiim: `MARGIN`** (kasutatud kauba erikord, kasutaja otsus 2026-10-12). Tootelehel kuvatakse olemasolev märge "Kasutatud kauba erikord – käibemaksu arvel eraldi ei näidata". Režiim on vajalik, et sooduskoodi marginaalikaitse saaks Techi päris ostuhinda kasutada (Laptopid.ee: ostuhind NULL → "kontrollimata", muutmata).
- **Tarne: 1–2 tööpäeva** — pakkumise tasemel `delivery_min_days = 1`, `delivery_max_days = 2` (üldine väli, mitte `if supplier === "tech"`). Poes "Tarne 1–2 tööpäeva". Laptopid.ee pakkumistel tarneaega pole → endiselt "Kohe saadaval".
- **Garantii:** Tech ei anna → `warranty_months = NULL` (ei leiutata). Üldine garantiipoliitika (info leht) kehtib edasi.

## 8. Füüsilised seadmed, grupid ja laoseis

### Seadmed (`supplier_inventory_units`)

- Iga hinnakirja rida kehtiva Tech ID-ga = **üks füüsiline seade**. Identiteet: `(supplier, external_unit_id)` = `('tech', D)`, UNIQUE.
- Salvestatakse: seerianumber (algkujul), seos pakkumisega, `available`, `status`, `sold_by_color`, põhjus (`excluded_reason`), tab ja rida, toorandmed (märkused, värvid — **ilma seerianumbrita**), `first_seen_at`, `last_seen_at`.
- Seerianumber ei ole identiteet ega pakkumise ID.
- Sama Tech ID mitmes tabis: identsed andmed → üks seade; erinevad andmed → `CONFLICT` (müügist väljas, logitakse). Korduv seerianumber eri Tech ID-del → loendatakse hoiatusena.
- Ajalugu ei kustutata: müüdud/defektiga/kadunud seade jääb tabelisse (`available = false` + põhjus) ja sama konfiguratsiooni pakkumisega seotuks.

### Grupid → SupplierListing

- Sama müüdava konfiguratsiooni **ja** sama hinnakirja hinnaga müügis seadmed = **üks SupplierListing** (üks tootekaart). Klient näeb "Partnerlaos 4 tk", seerianumbreid mitte.
- Grupi võti: tootja, mudel (kanooniline slug), CPU, RAM, salvestus + tüüp, ekraani suurus, resolutsioon, paneel, puuteekraan, GPU (ühtlustatud: "Intel® Iris® Xe Graphics" = "Intel Iris Xe"), `bl`, `id`, `4g`, `5g`, hinnakirja hind M. Seerianumber ja Tech ID ei kuulu võtmesse.
- **Pakkumise identiteet** = `sha256(konfiguratsioon + hind)` → `supplier_product_id` (20 hex), SKU `TC-XXXXXXXXXX`, avalik ID `tech-<räsi>`. Ei sõltu reast, tabist ega seerianumbrist → sync on idempotentne.
- NB: kui Tech muudab seadme **hinda** (M), on see uus konfiguratsioon → uus pakkumine; vana pakkumine saab laoseisu 0 (ei kustutata). Admini parandused on pakkumise küljes, seega need uuele pakkumisele üle ei kandu.
- **Laoseis on täpne:** `stock` = müügis seadmete arv, `available = stock > 0`. Kui viimane seade müüakse, kaob pakkumine poest (`available = false`), aga rida jääb alles. Seade tagasi müüki → laoseis taastub.
- Ostukorv ja kassa kasutavad olemasolevat teadaoleva koguse loogikat (`availability.ts`): laoseis 7 → kogus 1–7, 8 → viga. Laptopid.ee (kogus teadmata, max 1) on eraldi ja muutmata.

## 9. Snapshot'i ohutus

Kõik võrgutööd ja kontrollid tehakse **enne** andmebaasi tehingut. Fataalne probleem → sync `FAILED`, **midagi ei muudeta**, pood müüb eelmist seisu:

| Kood | Millal |
| --- | --- |
| `NOT_CONFIGURED`, `NETWORK`, `HTTP`, `NOT_XLSX`, `TOO_LARGE` | allalaadimine / vorming |
| XLSX parse error | fail ei avane |
| `NO_LAPTOP_SECTIONS` | ühtegi sülearvutite tabi/sektsiooni ei leitud |
| `NO_STYLE_INFO` | sülearvutite tabides pole ühtegi värvitud lahtrit (stiiliinfo kadunud) — **ei eeldata, et kõik on müügis** |
| `NO_ROWS` | sülearvutite ridu pole |
| `COLOR_DROP` | eelmises edukas sync'is oli ≥ 10 värvitud rida, nüüd 0 |
| `PRICE_PARSE`, `ID_PARSE`, `SERIAL_PARSE` | alla 70% värvimata ridadest on loetava hinna / Tech ID / seerianumbriga |
| `CONFLICTS` | konflikte üle max(5, 10% seadmetest) |
| `LARGE_DROP` | müügist kaoks korraga üle max(20, 50%) varem müügis olnud seadmetest (admin saab teadlikult lubada: "Luba suur muutus") |

Mitte-fataalne → `snapshot_trusted = false`: vastuses olevad seadmed uuendatakse, aga **hinnakirjast puuduvaid maha ei võeta** (need jäävad müüki ja laoseisu):

- mõni sülearvutite tab jäi layout'i tõttu lugemata;
- puuduvaid on üle max(10, 25%) varem müügis olnutest.

Usaldusväärse snapshot'iga: hinnakirjast kadunud seade → `MISSING`, `available = false`. Värvitud (müüdud) ja defektiga seadmed võetakse maha alati (need on selged signaalid, mitte puudumine).

## 10. ProductModel ja rikastus

- Mudeli vaste on sama mis Laptopid.ee-l: jagatud `resolveModelRef` (`src/integrations/supplier/model-resolver.ts`) → kanooniline slug. **Vaste = täpselt sama slug**; fuzzy-vastet ei tehta ("parem uus mudel kui vale merge").
- Techi kirjapildi ühtlustus enne seda (`techModelName`): "X1 Carbon 10th Gen" → "X1 Carbon Gen 10", "Thinkpad" → "ThinkPad", "Zbook" → "ZBook". Lenovo "Gen 3" jääb andmebaasi, kliendile kuvatakse "G3" (olemasolev `display-name.ts`).
- Lisatud tootjad: Microsoft, Panasonic, ASUS, Acer, Getac (`BRAND_CODES`).
- **Olemasolevat mudelit Tech sync ei muuda** (Laptopid.ee / Icecat / admini andmed jäävad). Uus mudel luuakse ainult tootja, seeria, mudeli, põlvkonna ja ekraani suurusega; kaal, pordid, Wi-Fi, Bluetooth jm = NULL (ei leiutata).
- Tech on konfiguratsiooni tõeallikas (CPU, RAM, SSD, ekraan, GPU, bl/id/4g, hind, laoseis). Mudeli rikastus seda üle ei kirjuta — need on eri tabelites.
- **Pildid:** pakkumise pildid → mudeli (Icecat) pildid → **sama mudeli teise müügis pakkumise tarnija pildid** (nt Laptopid.ee fotod) → illustratsioon. Kolmas samm lisati Techi jaoks (`db-catalog-mapper.ts`): Techil endal pilte pole, aga sama mudeli Laptopid.ee fotod sobivad illustratiivseks pildiks (märge "Tootepildid on illustratiivsed" kuvatakse).
- **Icecat:** automaatne Icecati vaste vajab GTIN-i või tootja koodi (MPN), mida Techi hinnakiri ei anna (PROJECT_PLAN R14), ja piltide püsiv salvestus (R13) puudub. Seetõttu sync Icecati ei käivita — admin näeb rikastuseta mudeleid (Tarnijad → Tech → "Rikastus puudub") ja saab Icecati vaste käsitsi lisada. Statistika: olemasolev / Icecat / puudub.
- Live-seis 2026-10-12: 140 mudelit, neist 45 olemasolevat (28 Laptopid/mock piltidega, 16 Icecatiga) ja 95 uut; rikastus puudub 96-l.

## 11. Seerianumbrite privaatsus

Seerianumber ja Tech ID on **ainult serveris ja adminis**:

- tabelis `supplier_inventory_units` (poe kataloogipäring seda ei loe);
- pakkumise `raw_data`/`details` ei sisalda seerianumbreid;
- admin: konfiguratsiooni leht (seadmete nimekiri), tellimuse leht (määratud seadmed), Tarnijad (näidistes ainult Tech ID).

Ei ole: tootekaardil, tootelehel, kliendi kataloogiandmetes, JSON-LD-s, otsingu API-s, ostukorvis, kassas, kinnituslehel ega tellimuse otsingus (testid + live-HTML kontroll 2026-10-12: 0 tabamust).

## 12. Tellimus ja seerianumber

- Tabel `order_item_units` seob tellimuse rea ühe või mitme seadmega. Admin → tellimus → "Seerianumbrid": vali müügis seade sama konfiguratsiooni alt; kogus 3 → 3 eri seadet. Kontrollid: sama pakkumine, seade müügis, mitte rohkem kui kogus, mitte juba mõne teise **päris** (mitte test, mitte tühistatud) tellimuse küljes. Määramine ja eemaldamine lähevad tegevuslogisse (ainult Tech ID).
- See on **käsitsi märge**: seadet ei reserveerita, ei märgita müüduks ja Techi hinnakirja ei muudeta. Testtellimus ei kuluta laoseisu.
- Tellimuse rida (`order_items`) on edasi muutumatu snapshot (mudel, CPU, RAM, salvestus, seisukord, hind, soodustus). Seerianumber on eraldi, ainult admini seos.
- **TODO (päris maksed / LIVE):** makse kinnitamisel tuleb seadme reserveerimine ja kulutamine siduda tellimuse ja makse tehinguga (nt reserveeritud seade loetakse laoseisust maha kuni Tech märgib selle müüduks), lisada konfliktide käsitlus (Tech müüs seadme vahepeal mujal) ja automaatne määramine. Seda selles etapis ei tehtud.

## 13. Admin

Admin → **Tarnijad** → sektsioon **Tech (hinnakiri)** (Laptopid.ee kaart on eraldi ja muutmata):

- viimane edukas sync, viimane katse ja tulemus;
- lähteread, müüdud, ei ole sülearvuti, defekt, tundmatu märkus, vigased, konfliktid;
- müügis seadmed, pakkumised, uued / muutunud / muutmata / maha võetud;
- mudel olemasolev / uus; rikastus olemasolev / Icecat / puudub;
- näidised: tundmatu märkus, defekt, vigased (tab!rida, Tech ID, põhjus, toorväärtus), konfliktid, rikastuseta mudelid, tabide hoiatused;
- käivituste ajalugu, süsteemilogi (allikas TECH);
- **Sync now** (sama kaitse: sessioon + päritolu/CSRF) + "Luba suur muutus".

Konfiguratsiooni leht (Tech pakkumine): hinnakirja hind M, ostuhind M − 20, müügihind M + 60 / kehtiv (parandusega), täpne laoseis, seisukord, tarne, müügis seadmete arv, näidis-seerianumber ja lahtikäiv seadmete nimekiri (Tech ID + seerianumber + staatus/põhjus + tab/rida).

Admini parandused (`manual_overrides`) töötavad nagu Laptopid.ee puhul: sync uuendab ainult tarnija veerge, parandus jääb kehtima kuni "Taasta".

## 14. Ajastamine

Käivitusviisid (kõik kutsuvad sama `runTechSync`, sama DB-lukk ja üks tehing):

- **Admin → Tarnijad → Tech → Sync now** (tühjendab poe vahemälu);
- **`GET /api/cron/tech-sync`** päisega `Authorization: Bearer <CRON_SECRET>`: 401 vale/puuduv, 503 seadistamata (`CRON_SECRET` või `TECH_SHEET_URL`), 200 SUCCESS/BUSY, 502 FAILED. Vastuses pole tooteandmeid, seerianumbreid ega saladusi. Muudatuste korral `revalidateTag('catalog', { expire: 0 })`;
- **`npm run tech:sync`** (CLI; ei saa deploy'tud poe vahemälu tühjendada) ja **`npm run tech:sync -- --dry-run`** (ainult lugemine, raport ilma seerianumbriteta).

Lukk: `catalog_sync_runs` allikas `TECH` — eraldi Laptopid.ee lukust (osaline UNIQUE indeks allika kohta). Tech ei jookse iseendaga topelt (teine käivitus → BUSY); Tech ja Laptopid võivad joosta samaaegselt.

### Upstash QStash (Europe/Tallinn)

| Schedule | Cron | Käivitused |
| --- | --- | --- |
| `tech-daytime-sync` | `CRON_TZ=Europe/Tallinn 0 10-20 * * 1-5` | E–R 10:00–20:00 iga täistund (11 korda) |
| `tech-nightly-sync` | `CRON_TZ=Europe/Tallinn 0 3 * * *` | iga päev 03:00 |

Sihtkoht `GET https://laptop-store-rouge.vercel.app/api/cron/tech-sync`, edastatud päis `Authorization: Bearer <CRON_SECRET>` (`Upstash-Forward-Authorization`), korduskatseid 0. Laptopid.ee schedule'e ei muudetud. Schedule ID-d: vt HANDOFF.md / CHANGELOG.md.

Admini stale-hoiatus Techi kohta: viimane edukas sync üle 26 h vana (öine sync käib iga päev).

## 15. Testid

- `src/integrations/tech/tech.test.ts` — seadistus, värvid (punane/sinine/hall/kollane/roheline/lilla/helehall/kogu rida → müüdud; täideta/valge/ainult hind → müügis; teema/indekseeritud), märkused (kõik defektid, bl/id/4g/5g, e/g/f/w/p, protsendid, laadija, tundmatu), hind (380 → 360/440, 500 → 480/560, vigane → INVALID), RAM/salvestus/ekraan/CPU/GPU, SSD nõue, NOT_LAPTOP, tabid ja sektsioonid, layout error, grupeerimine (4 → 1 × 4; bl → 2; hind → 2; värvitud → 3; dead battery → 3), deterministlik ID, dedup/konflikt, snapshot'i kontroll (stiiliinfo puudub, COLOR_DROP, hind, tabe pole, suur kadu, palju puuduvaid).
- `src/integrations/tech/tech-workbook.test.ts` — päris XLSX (ExcelJS) värvidega: Brand/Model värv loetakse, hinna värv ei loe, segatabi sektsioonid.
- `src/server/catalog-sync/tech-sync.db.test.ts` (päris PostgreSQL, ajutine skeem `test_xxxx`) — esimene sync, mudeli taaskasutus, rikastuseta mudel (NULL, illustratsioon), teise tarnija varupildid, idempotentsus, müük → laoseis −1 → viimane → poest väljas → taastub, defekt/puuduv/taastumine, admini parandus, ostukorv/kassa (4 lubatud, 5 viga), marginaalikaitse (Tech alampiir vs Laptopid kontrollimata), tellimuse seerianumbrid (kogus 2 → 2, kolmas keelatud, testtellimus ei kuluta), seerianumbri privaatsus (kataloog, otsing, ostukorv, kassa, kinnitusleht), stiiliinfota/allika viga → FAILED ja seis samaks, lukk.
- `src/app/api/cron/tech-sync/route.test.ts` — 401 / 503 / 200 / BUSY / 502.

Testandmetes on fiktiivsed Tech ID-d ja seerianumbrid (`TESTSN…`); päris hinnakirja seerianumbreid repos pole.
