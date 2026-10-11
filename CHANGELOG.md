# Muudatuste logi

Iga olulise funktsiooni valmimisel: mis lisati, miks, kas tekkis probleem ja kuidas see lahendati.
Seda logi kasutatakse lõputöö kirjaliku osa allikana.

---

## 2026-10-11 — Poe värvisüsteem: indigo-sinine

- Avaliku poe primary värv teal → indigo-sinine (`#2F4EE0`, valgel 6,4:1 — WCAG AA). Ainult värvid; paigutus, struktuur ja loogika ei muutunud.
- Tokenid: `.storefront` plokk `globals.css`-is (`--store-primary`, `--store-primary-hover`, `--store-primary-pressed`, `--store-primary-soft`, `--store-primary-border`, `--store-bg`, `--store-bg-alt`, `--store-surface`, `--store-text`, `--store-text-muted`, `--store-border`, `--store-success`, `--store-success-soft` jt), mis kaardistab olemasolevad semantilised tokenid ainult poe layout'ides (`(shop)`, `(checkout)`, wrapper `display: contents`). **Admin kasutab endiseid `:root` väärtusi** ja jäi muutmata.
- Roheline (`#047857`; `#059669` oli väikese teksti jaoks liiga hele, 3,8:1) jäi ainult semantiliseks: laos / kohe saadaval, kehtiv sooduskood, soodustuse rida, tellimuse kinnitus, A+ seisukord.
- Komponentides väikesed klassimuudatused: prototüübiriba (`bg-topbar`), nupu vajutatud olek, hero hele gradient, tootekaardi hover-piir, "Uus valikus" pehme sinine märk, valitud kiirfilter pehme sinine, lehekülgede aktiivne number ja sooduskoodi "Rakenda" sinised, seisukord A sinine / A+ roheline.
- Probleem: Turbopacki vahemälu serveeris dev-serveris vana CSS-i (uued reeglid puudusid); lahendus: `.next` kustutamine ja dev-serveri taaskäivitus.

## 2026-10-11 — Päris kataloog Laptopid.ee API-st

**Mis lisati**

- **Sync:** Laptopid.ee API (products.php + images.php) → zod-valideerimine → normaliseerimine → sync → PostgreSQL → olemasolev catalog-service. Pood, otsing, ostukorv ja kassa loevad ainult andmebaasi. Sync võtab luku (`catalog_sync_runs`), teeb kõik võrgutööd enne tehingut ja kirjutab kõik ühes tehingus. Sama vastus kaks korda ei muuda midagi (päris andmetega: 285 uut, siis 285 muutmata).
- **Andmebaas** (migratsioon `0003_laptopid_sync.sql`, ainult lisav):
  - uued tabelid `listing_images` ja `catalog_sync_runs`;
  - `supplier_listings` uued veerud `available`, `price_source`, `weight_kg`, `condition_notes`, `details` ja `last_seen_at`.
  - Arvud enne ja pärast samad (38 / 46 / 320).
- **Identiteet:** `supplier = 'laptopid'` + Laptopid toote ID (olemasolev UNIQUE). Slug ei ole identiteet.
- **Mudelid:** vaste kanoonilise nime järgi (ThinkPad "G3" → "Gen 3", "2in1" → "2-in-1"). Kui vastet pole, luuakse uus mudel. Sama mudeli konfiguratsioonid jäävad eraldi pakkumisteks. Tulemus: 122 uut mudelit ja 21 olemasolevat mudelit leiti.
- **Laoseis:** saadavus (`available`) on eraldi täpsest kogusest (`stock`). Laptopid annab ainult saadavuse, seega:
  - poes kuvatakse "Kohe saadaval" (mitte "1 tk");
  - tellida saab 1 tk rea kohta; rohkema korral kuvatakse selgitus.
  - Tulevane tarnija saab anda ka täpse koguse.
- **Hinnad:** `sale_price` on tarnija müügihind (`price_source = SUPPLIER`). Admini hind salvestub parandusena ja sync uuendab ainult tarnija väärtust. `new_price` on ainult kontekst. Ostuhind jääb NULL-iks ja hinnastamismootor neid pakkumisi ei puuduta.
- **Täielik snapshot:** puuduv toode võetakse maha (`available = false`) ainult usaldusväärse vastusega ja tagasi tulles taastub. API viga, vigane või tühi vastus, korduvad ID-d või palju skeemivigu → kataloog jääb samaks. Ebaloogiliselt suur kadu → puuduvaid maha ei võeta (admin saab teadlikult lubada).
- **Pildid:** Laptopid.ee pildid on pakkumise tasemel kaug-URL-idena (small/medium/original) ja kuvatakse Next/Image kaudu. `remotePatterns` lubab ainult `laptopid.ee/images/product/**`. Mõõdud loetakse HTTP Range päringuga. Git'i pilte ei laeta. Icecat jääb mudeli piltide varuallikaks.
- **Pood:**
  - uued tootjad (Fujitsu, Samsung, Apple) ja seeriad (XPS, ThinkBook, Yoga, LifeBook, Galaxy Book, MacBook);
  - tehnilistes andmetes konfiguratsiooni pordid, kaal, DisplayPort, privaatsusekraan, värskendussagedus, TrackPoint ja veebikaamera;
  - tarnija defektimärkus ("Märkus: Üks USB-C ei tööta").
- **Admin:**
  - uus leht **Tarnijad** (`/admin/suppliers`): viimane sync, arvud, vahele jäetud tooted, käivituste ajalugu, **Sync now**, "Luba suur muutus";
  - konfiguratsiooni lehel saadavus, hinna allikas ja tarnija hinna parandus koos "Taasta" nupuga;
  - süsteemilogi uus allikas LAPTOPID.
- **Ajastamine:**
  - `GET /api/cron/laptopid-sync` (kaitstud `CRON_SECRET`-iga, ilma selleta ei käivitu);
  - `vercel.json` igapäevane cron;
  - CLI `npm run laptopid:sync`;
  - mock-andmete arhiveerimine `npm run catalog:archive-mock`.
- **Testid:** 265 → 305.
- Dokumentatsioon: uus docs/LAPTOPID_SYNC.md; uuendatud README, ARCHITECTURE, DATABASE, ADMIN, PROJECT_PLAN ja AGENTS.md.

**Probleemid ja lahendused**

- **Verceli `LAPTOPID_API_URL` vastas 404.** Töötavad otspunktid leiti GitHubis lisatud `route.ts` failist (products.php + images.php, päis `X-API-Key`). Need on nüüd koodis konstandid.
- **Avalik `/api/products`:**
  - see avaldas võtmega kaitstud tarnija voo kõigile (CDN `s-maxage=300`);
  - see mõtles välja väärtusi (`wifi: true`, `bluetooth: true`, puuduv USB → 0).
  - Nüüd on see ainult admini diagnostika, kasutab sama jagatud laadijat ja `no-store` vahemälu.
- **Laptopid ei anna laokogust.** "Nimekirjas = 1 tk" oleks olnud vale väide. Lahendus: eraldi saadavus ja kogus; teadmata koguse korral tellitav 1 tk koos selgitusega.
- **5-minutiline automaatne sync:** Vercel Hobby lubab cron'i kõige rohkem kord päevas. Võltslahendust ei tehtud: on "Sync now", kaitstud otspunkt ja dokumenteeritud järgmine etapp (Pro või väline ajastaja).
- **Konfiguratsiooni pildid ja mudeli pildid:** kui Laptopid.ee pildid oleks pandud mudeli piltide tabelisse, oleks admini ja Icecati järjestamine need ümber nummerdanud. Seepärast on neil eraldi tabel `listing_images`.
- **Kassa kogusepiir:** esimene versioon piiras kassas ka teadaoleva laokoguse 10-ni (ostukorvi piir). Olemasolev test tuvastas selle. Lahendus: kassa kasutab laoseisu (`availableForOrder`), ostukorv oma 10 tk piiri.
- **Tellimuse ülevaate teade "(saadaval 1)"** oleks teadmata koguse korral väitnud, et laos on 1 tk. Lisati `quantityKnown` ja kogust kuvatakse ainult siis, kui see on teada.
- **4 Laptopid.ee pilti vastavad 404:** pilti ei lisata, toode jääb korda ja järgmine sync proovib uuesti.
- **20 toodet jäeti vahele:** 13 × "New", 5 × "Demo", 1 × "Outlet" (meie seisukorraklassid on A+/A/B/C) ja 1 × tundmatu seeria (V330). Seisukorra vastet ei mõeldud välja; lahendus vajab otsust.

## 2026-10-11 — Kassa ja tellimused (ilma makseta)

**Mis lisati**

- **Andmebaas** (migratsioon `0002_orders.sql`, lisav): `orders`, `order_items` (snapshot), `order_status_history`, `order_internal_notes`, `order_lookup_attempts`, välisvõti `discount_redemptions.order_id → orders`. Uus käsk `npm run db:counts` kinnitas, et olemasolevad andmed jäid samaks (38 / 46 / 320, admin, seaded).
- **Testtellimused:** prototüübis tekivad ainult testtellimused (`is_test`). Need ei võta makset, ei lähe tarnijale, ei vähenda laoseisu, ei kuluta sooduskoodi kasutust ega saada e-kirja. Kui prototüüp lülitatakse välja ilma makseteenuseta, kassa sulgub.
- **Kassa** (`/kassa`): külalisost, minimaalne päis, kontakt/tarne/ettevõte/märkus, kokkuvõte paremal (mobiilis enne nuppu), nupp „Esita testtellimus“, topeltklikkide kaitse.
- **Serveripoolne arvutus:** pakkumised otse PostgreSQL-ist (aktiivsus, hetkehind, laoseis), sooduskood uuesti DiscountEngine'iga, tarne seadetest (Standardtarne + tasuta tarne piir). Hinnamuutuse, kadunud toote, laoseisu või kehtetu koodi korral tellimust ei looda ja klient kinnitab uue summa.
- **Idempotentsus:** `checkoutAttemptId` räsi on andmebaasis UNIQUE. Sama esitus annab sama tellimuse, ka samaaegsete päringute korral.
- **Tellimuse loomine** ühes tehingus: tellimus, read (snapshot), sooduskoodi snapshot ja ajalugu. Tellimuse number on kujul `SL-26-XXXXXX`.
- **Kinnitusleht** (`/tellimus/[nr]/kinnitus`) avaneb ainult httpOnly juurdepääsuküpsisega ja töötab ka pärast värskendust.
- **Tellimuse otsing** (`/tellimus`): number + e-post, üldine vastus, piirang 10 katset / 15 min / IP, ainult avalikud väljad.
- **Admin:** `/admin/orders` (otsing, filtrid, järjestus, TEST-märk), detailvaade, tühistamine (olekumasin, ajalugu, audit), sisemärkmed (ainult lisamine), töölaual testtellimuste arvud, seadetes tarneviis ja hind.
- **Liidesed tulevikuks:** `PaymentProvider` (pakkujat pole, võltsmakset ei tehtud), `OrderNotificationService` (Noop), `ShippingMethod`.
- **Testid:** 230 → 265.
- Dokumentatsioon: uus docs/ORDERS.md; uuendatud README, ARCHITECTURE, DATABASE, ADMIN, PROJECT_PLAN ja DISCOUNTS.

**Probleemid ja lahendused** (vt ka ORDERS.md §16)

- **Kliendi hind ei tohi määrata tellimuse summat:** testis saadeti `priceCents: 1`. Server ignoreeris seda ja kasutas andmebaasi hinda. Kliendi nähtud hindu kasutatakse ainult muutuse tuvastamiseks.
- **Topeltesitus:** kolm kiiret esitust lõid ühe tellimuse (UNIQUE-võti ja olemasoleva tellimuse tagastamine).
- **Kood muutus kassa ajal kehtetuks:** käsitsi testis lülitati kood välja ajal, mil kassa oli avatud. Server näitas põhjust ja uut summat ega loonud tellimust.
- **Drizzle'i alampäring:** admini nimekirjas oli toodete arv 0, sest ilma join'ita oli välise tabeli veerg alampäringus kvalifitseerimata (`"id"` → `order_items.id`). Parandatud täieliku viitega, lisatud regressioonitest.
- **Admini leht ei uuenenud** pärast tühistamist ja märkust. Lahendus: `refresh()` server action'is (Next.js 16).
- **React lähtestab vormi** pärast server action'it ja otsingu väljad tühjenesid. Lahendus: sisestatud väärtused tulevad vastusega tagasi.
- **Uus välisvõti muutis vana testi kehtetuks** (väljamõeldud `order_id`). Test loob nüüd päris tellimused.
- **`"use server"` fail tohib eksportida ainult async-funktsioone:** küpsise nime konstant tõsteti eraldi faili.

## 2026-10-11 — Sooduskoodid

**Mis lisati**

- **Andmebaas** (migratsioon `0001_discount_codes.sql`, 6 uut tabelit): `discount_codes` (`normalized_code` UNIQUE, tuletatud veerg `active`, CHECK piirangud), tootjate/mudelite/konfiguratsioonide seosed (INCLUDE/EXCLUDE), `discount_redemptions` (snapshot, valmis tellimustele), `discount_validation_attempts` (piirang).
- **DiscountEngine** (`src/domain/discounts/discount-engine.ts`): üks puhas funktsioon ostukorvile, eelvaatele, testidele ja tulevasele kassale. Toetab protsenti (+ maksimum), fikseeritud summat ja tasuta tarnet. Kontrollib olekut, kehtivusaega serveri kella järgi, kasutuspiirangut, sobivaid ridu, välistusi ja miinimumsummat. Jaotab soodustuse ridadele ning hoiab kokkusumma alati ≥ 0.
- **Marginaalikaitse:** `minimumAllowedPrice()` hinnastamismootoris kasutab olemasolevat miinimumkasumi reeglit, nii et soodustus ei vii hinda alla lubatud piiri.
- **Ostukorv:** sooduskoodi väli, kehtiv kood koos summaga ja nupp „Eemalda“, korraga üks kood, kood püsib pärast värskendust. Kui kood enam ei kehti, eemaldatakse see ja kuvatakse põhjus. Summa arvutab server.
- **Admin:** `/admin/discounts` (otsing, filtrid, järjestus, tegelik staatus), loomine ja muutmine (koodi genereerimine, kehtivusala ja välistused otsinguga, Eesti aeg), aktiveeri / lülita välja / arhiveeri, duplikaat (mustand), eelvaade, töölaua kokkuvõte, audit.
- **Kasutuste arhitektuur:** `reserveRedemption` / `confirmRedemption` / `cancelRedemption` tehingus koos rea lukuga.
- **Testid:** 184 → 230.
- Dokumentatsioon: uus docs/DISCOUNTS.md; uuendatud ADMIN, DATABASE, ARCHITECTURE, PROJECT_PLAN ja README.

**Probleemid ja lahendused**

- **Ajavöönd:** Vercel töötab UTC-s, brauser kohalikus ajas ja admin mõtleb Eesti ajas. Lahendus: andmebaasis `timestamptz` (UTC) ja oma teisendus Europe/Tallinn ↔ UTC (`src/domain/time/tallinn.ts`), mis arvestab suveaja vahetust ja on testitud.
- **Avaliku koodi olemasolu ei tohi lekkida:** mustand, arhiveeritud ja olematu kood annavad sama vastuse („Sooduskoodi ei leitud.“).
- **Vorm saadeti enne lehe laadimist GET-päringuna:** kui vormi saata enne, kui React on lehe üle võtnud, saadab brauser vormi tavalise GET-päringuna ja andmed jõuavad URL-i. Lahendus: salvestusnupp on lukus, kuni leht on laaditud (`useSyncExternalStore`).
- **Marginaalikaitse päris andmetega:** testkoodi `DELL10` (10%) soodustus Dell Latitude 5430-le piirati 48,90 €-lt 41,53 €-ni, sest madalaim lubatud hind (447,47 €) oleks muidu ületatud. See on ootuspärane ja eelvaade näitab seda.
- **Mobiili ülevool ostukorvis:** ruudustikul puudus `grid-cols-1` (`minmax(0,1fr)`), mistõttu leht oli 375 px ekraanil 397 px lai. Parandatud.
- **Arendusserveri vahemälu:** uus olekumärk („Aegunud“) kuvati vana moodulina „EXPIRED“. Dev-serveri taaskäivitus lahendas (tootmisbuild ei olnud mõjutatud).

## 2026-10-11 — PostgreSQL ja admin-liides

**Mis lisati**

- **Andmebaas:** Neon PostgreSQL (Verceli projektiga seotud) + **Drizzle ORM**, 12 tabelit (`admin_users`, `admin_sessions`, `login_attempts`, `product_models`, `product_identifiers`, `supplier_listings`, `product_images`, `icecat_metadata`, `pricing_rules`, `store_settings`, `audit_logs`, `system_logs`), migratsioon `drizzle/0000_init.sql`. ORM valiku põhjendus: docs/DATABASE.md.
- **Import:** `npm run db:seed` viis praeguse kataloogi andmebaasi. ENNE = PÄRAST: 38 mudelit, 46 konfiguratsiooni, 320 pilti, Icecat 34/3/1, 123 identifikaatorit. Import on idempotentne ega kirjuta üle admini muudatusi. `npm run db:verify-catalog` kinnitas, et andmebaasist ehitatud poe kataloog on 46/46 sama (ID-d, hinnad, spetsifikatsioonid, pildid).
- **Pood loeb andmebaasist** (`'use cache'` + `cacheTag`). Poe nimi, ettevõtte andmed, prototüübirežiim ja usaldusriba tulevad seadetest; esiletõstmine on mudeli tasemel (hardcode'itud SKU-sid pole). Ilma `DATABASE_URL`-ita kasutatakse mock-andmeid.
- **Admin** (`/admin`): sisselogimine, töölaud, mudelid, konfiguratsioonid, pildid, Icecat, andmekvaliteet, hinnastamine, seaded, tegevuslogi, logid, tervis. Vt docs/ADMIN.md.
- **Turvalisus:** scrypt paroolid, andmebaasi sessioonid (küpsises juhuslik token, andmebaasis räsi), `__Host-` küpsis (httpOnly, Secure, SameSite=Strict), sisselogimise piirang e-posti ja IP järgi, CSRF päritolu kontroll, kontroll igas server action'is, vea ID stack trace'i asemel. Admin luuakse käsuga `npm run admin:create`, vaikeparooli pole.
- **Tarnija vs admin andmed:** tarnija veerud + `manual_overrides` (JSONB). Admin näeb mõlemat väärtust, "Taasta" viib tagasi tarnija väärtusele ja sync ei kirjuta parandusi üle.
- **Audit:** iga muudatus (vana → uus) samas tehingus.
- **Testid:** 133 → 184. Andmebaasi testid jooksevad päris PostgreSQL-is ajutises skeemis.

**Probleemid ja lahendused**

- **Verceli + Neoni muutujate nimed:** integratsioon lisas muutujad eesliitega `database_` (`database_DATABASE_URL`). Lahendus: `resolveDatabaseUrl()` eelistab `DATABASE_URL`-i ja kasutab muul juhul `database_`-varianti. Väärtusi ei kuvata kunagi; veateadetes asendatakse ühendusstring `[DATABASE_URL]`-iga.
- **pg hoiatus `sslmode=require`:** asendatakse `verify-full`-iga, et sertifikaati päriselt kontrollitaks.
- **Migratsiooni SQL ei läinud Git'i:** `.gitignore`-is oli `*.sql`. Lisatud erand `!/drizzle/*.sql`.
- **Next.js 16 Cache Components ja admin:** sessiooni lugemine (küpsised, kellaaeg) ei tohi jõuda staatilisse eelrenderdusse. Lahendus: admini sisu on `<Suspense>`-i sees, `connection()` enne sessiooni kontrolli ja `export const instant = false` admini lehtedel (admin on alati päringupõhine).
- **Serverikomponent ei saa anda funktsiooni kliendikomponendile:** seadete vorm oli algul kavandatud render-funktsiooniga. Lahendus: kogu seadete redaktor on kliendikomponent, mis saab andmed props'ina.
- **Testid poe andmeid ei puutu:** iga andmebaasi testifail loob ajutise skeemi (`test_xxxx`), käivitab sinna migratsiooni ja kustutab skeemi lõpus.
- **Brauseri testimine:** peidetud brauseripaneelis ei hüdreerunud React (`requestAnimationFrame` ei käi). Kliendipoolsed vormid testiti nähtava paneeliga; serveripoolsed toimingud on kaetud automaattestidega.
- **Turvapäis töötab:** mobiilivaate kontroll iframe'idega ebaõnnestus, sest admin saadab `X-Frame-Options: DENY`. Lehed kontrolliti ükshaaval.

**Teadaolevad piirangud**

- Piltide allalaadimine ja käsitsi üleslaadimine adminis töötab ainult lokaalselt, kuni on püsiv salvestusruum (R13).
- `npm run icecat` CLI kasutab veel JSON-faile. Üksikmudelite toimingud tehakse adminis.
- Icecati muutujad pole Vercelis seadistatud, seega on Icecati toimingud seal välja lülitatud (tervise leht näitab seda).

## 2026-10-10 — UX parandused (hinnaliugur, tooteleht, võrdlus, finder)

**Mis muutus**

- **Hinnafilter:** kahe käepidemega liugur (2 natiivset range-sisendit: hiir, puude, klaviatuur, ekraanilugeja), samm 10 €, piirid aktiivsest kataloogist, rakendub vabastamisel; +/- nuppe pole.
- **Kiirinfo kastid:** lühike selgitus deterministlikest reeglitest (`src/domain/catalog/spec-explanations.ts`), ilma benchmark-väideteta.
- **Tehnilised andmed:** CPU/RAM/SSD ei kordu; lisatud "Protsessori põlvkond"; tühjad väärtused ("–", "N/A", null) peidetakse; CSS veerud gridi asemel → ei teki auke.
- **Sarnased sülearvutid:** `src/domain/catalog/similar.ts` — hind ±25% (kohustuslik), seejärel ekraan, CPU klass, RAM, SSD, kasutusklass, teise tootja boonus; üks pakkumine mudeli kohta.
- **Mobiili võrdlus:** omaduse veerg sticky, toodete veerud 150 px ja keritavad tabeli sees, kerimisvihje, 32 px eemaldusnupp; lehe ülevoolu pole (375/390/430 px).
- **Laptop Finder:** 4-sammuline wizard (`src/domain/finder/finder.ts`), skoor + põhjendused, Parim / Soodsaim / Võimsaim, "Muuda vastuseid", "Alusta uuesti", link kõigile sobivatele.
- **Mock vs päris andmed:** tarneaeg tuleb tarnija pakkumisest (`deliveryDays`), mitte poe vaikeväärtusest; puudumisel null ja UI peidab. "ID-kaardilugeja" → "Smart Card lugeja".

**Probleemid ja lahendused**

- **Seisukorra klasside leht "ei töötanud":** Next.js 16 peidab navigeerimisel eelmise lehe (React `<Activity>`) selle eemaldamise asemel. Seisukorra selgituse modaalne `<dialog>` jäi avatuks ja tegi uue lehe kasutamatuks (inert). Lahendus: Dialog suletakse alati efekti puhastamisel + link sulgeb dialoogi.
- **Mobiili filtrid:** dialoogi sisualal puudus `min-h-0`, flex-laps ei kahanenud ja viimased valikud jäid nähtamatuks. Lisatud ka safe-area alumine vahe.
- **Desktopi filtrid:** kõrguspiiranguga kleepuv külgriba jäi lehe ülaosas ekraanist välja ja lühikese nimekirja korral ei kinnitunud kunagi → filtrid kerivad nüüd koos lehega.
- **Testid leidsid vea:** `cpuTier("intel-core-i5")` kontrollis lõppu "-5" → Inteli Core i-seeria klass oli alati tundmatu (mõjutas selgitusi, sarnaseid ja finderit).
- Dev-serveri vana vahemälu näitas eemaldatud koodi viga → puhas taaskäivitus.

## 2026-10-10 — Icecati pildid kogu kataloogile

**Mis lisati**

- Import kõigile 38 ProductModelile (üks päring mudeli, mitte konfiguratsiooni kohta): 34 MATCHED, 1 NEEDS_REVIEW, 3 NOT_FOUND, 0 ERROR → pildikate 89,5%, keskmiselt 9,4 pilti mudeli kohta.
- Staatused MATCHED / NEEDS_REVIEW / NOT_FOUND / ERROR (+ REJECTED) ja põhjuse väli (`reason`).
- `ProductImage.isHidden` (admin saab eksitava pildi peita) ja `contentHash` (täpsete duplikaatide eemaldamine).
- Põhipildi prioriteet: ametlik HighPic → hea galeriipilt → Pic500x500 → LowPic → placeholder.
- Uus märge: "Tootepildid on illustratiivsed. Seadme tegelik konfiguratsioon ja kosmeetiline seisukord vastavad tootekirjelduses märgitule."
- Galerii: kuni 6 pisipilti + "+N"; tootekaardi srcset ainult 300/700 px.
- Data Quality: mõõdikud ja "Mudelid ilma pildita" (CLI, raport, arenduse vaade `/admin/andmekvaliteet`).
- Raport `docs/reports/icecat-catalog-report.md`.

**Miks nii**

- Icecati vaste on tihti teise klaviatuuri / RAM-i / puuteekraaniga SKU — Icecatist võetakse ainult pildid, seadme andmed tulevad tarnijalt.
- Mudelinimi + bränd ei ole Icecati JSON API-s otsitav; identifikaatorid koguti käsitsi (tarnija feed peab need hiljem andma).

**Probleemid ja lahendused**

- HP lisab Icecatis nimesse ekraani suuruse ("EliteBook 860 16 G10") ja Dell kirjutab "Hybrid (2-in-1)" → pealkirja kontroll tunneb need nüüd ära (testidega).
- L14 Gen 2 jaoks leitud Icecat ID oli tegelikult ThinkPad E14 Gen 2 → pealkirja kontroll pani selle NEEDS_REVIEW, vale pilti live'i ei läinud.
- Testide võlts-allalaadija andis kõigile piltidele sama faili → uus duplikaatide eemaldus võttis need kokku; testid kasutavad nüüd erinevaid faile.
- TypeScript ei kitsendanud liitstaatusega tüüpi → staatuste käsitlus ümber järjestatud.
- Tootelehe jõudluse mõõtmine peidetud brauseripaneelis ei andnud LCP-d → pildimaht arvutati production-serveri HTML-ist ja failisuurustest.

## 2026-10-10 — Tootepildid Open Icecatist

**Mis lisati**

- Icecati JSON API klient (ainult server; tokenid ainult päistes; timeout, piiratud retry, 404 ei korrata).
- Vaste otsija: GTIN → MPN + bränd → Icecat ID; Icecati pealkirja kontroll; kindlus ja staatus (MATCHED / NEEDS_REVIEW / NOT_FOUND / …).
- Pildi import: põhipilt + galerii, duplikaatide eemaldamine, sisu kontroll, variandid 300 / 700 / 2000 px WebP, SEO-failinimed, alt-tekstid.
- `ImageStorageAdapter` + `LocalImageStorageAdapter`; S3-ühilduv adapter on ette valmistatud.
- Tootelehe galerii: mobiilis pühkimine, desktopil nooled, pisipildid, täisekraan + suum, illustratiivsuse märge.
- Data Quality ja admini toimingud käsurealt (`npm run icecat -- status | confirm | reject | retry | refresh`).
- Testraport 10 mudeliga: 9 leitud, 9 põhipildi ja galeriiga (`docs/reports/icecat-test-report.md`).

**Miks nii**

- Pildid on mudeli omad, sest kõik konfiguratsioonid näevad välja ühtemoodi; seega üks import mudeli kohta.
- Vale sülearvuti pilt on hullem kui placeholder → live'i ainult kindel ja pealkirjaga kontrollitud vaste.
- Icecat nõuab piltide allalaadimist ja ise hostimist; hotlink võib olla IP-piiratud.

**Probleemid ja lahendused**

- Icecati JSON API ei toeta nimepõhist otsingut → GTIN/MPN koodid koguti testmudelitele käsitsi Icecati avalikelt lehtedelt; tootmises peab need andma tarnija feed.
- HP EliteBook 840 G8 esimesed kaks koodi andsid "datasheet is not yet released" → leiti kolmas kood (GTIN), mis töötab. EliteBook 845 G8 kõik 7 koodi jäid leidmata.
- Icecati LowPic on 200 px — Retina tootekaardi jaoks liiga väike → variandi allikaks valitakse prioriteedi järgi esimene piisavalt suur pilt ja vähendatakse.
- Paralleelsed impordid kirjutasid sama JSON faili üle ja Windowsis tekkis `EPERM` → failipõhine lukk + atomaarne ümbernimetamine kordamisega.
- Üks galerii "pilt" oli 500×49 logoriba → mitte-tootefotod jäetakse mõõtude järgi välja enne allalaadimist.
- Pildi järjekorra muutumisel oleks uus pilt võinud üle kirjutada teise pildi faili → kasutusel olevad failinimed on kaitstud.
- Test leidis, et pealkirja kontroll võttis arvesse ka `ProductName` välja, mistõttu vastuoluline andmeleht oleks läbi läinud → kontrollitakse ainult `Title`.
- Galerii venitas mobiilis lehe laiemaks (CSS grid'i automaatne veerulaius) → `grid-cols-[minmax(0,1fr)]`.

## 2026-10-10 — Phase 0: analüüs ja planeerimine

**Mis lisati**

- `docs/PROJECT_PLAN.md` — nõuete analüüs, Greenfox.ee ja Laptopid.ee UX-analüüs, riskid, route'id, komponendid, roadmap.
- `docs/ARCHITECTURE.md` — modulaarne monoliit, adapterite kiht, sync'i ja tellimuse elutsükkel, turvalisus.
- `docs/DATABASE.md` — andmemudeli esimene versioon.

**Olulisemad otsused**

- Andmemudel **Product → ProductVariant → SupplierListing**: kasutatud ühikud tulevad ja kaovad, mudelileht jääb (SEO). Vajab kinnitust.
- Taustatöödeks **pg-boss** (järjekord PostgreSQL-is) eraldi worker-protsessis — Redis'it pole vaja.
- Raha alati **sentides täisarvuna**.
- Käibemaksukäsitlus (tavakord vs kasutatud kauba erikord) on toote omadus, mitte globaalne konstant.

**Probleemid**

- Arvutis polnud Node.js-i ega Git'i → paigaldati winget'iga (Node 24 LTS, Git).
- `create-next-app` ei lubanud suurtähtedega kaustanime ("Claude") → projekt loodi ajutisse kausta ja kopeeriti üle.

## 2026-10-10 — Phase 1: UI prototüüp (1. versioon)

**Mis lisati**

- Design token süsteem (`globals.css`): kõik värvid/raadiused/varjud CSS muutujatena, Tailwind kasutab ainult neid.
- Avaleht: hero otsinguga, väärtuspakkumised, parimad pakkumised, "Leia sobiv", värskelt hulgilaost, brändid koos päris arvudega, hariv sektsioon.
- Tootenimekiri `/sulearvutid` ja brändilehed: serveripoolsed filtrid koos loenduritega, kiirfiltrid, aktiivsete filtrite chip'id, sorteerimine, lehekülgede navigeerimine, mobiilis bottom sheet.
- Tooteleht `/toode/[slug]`: galerii (täisekraan + suum), konfiguratsiooni valik, seisukorra selgitus, kiirspetsifikatsioonid, rühmitatud tehnilised andmed, mobiilis kleepuv ostunupp, Product/Offer/Breadcrumb structured data.
- Otsingu autocomplete (`/api/search`), ostukorv (hind arvutatakse serveris), toodete võrdlus (max 4, "näita ainult erinevusi").
- `SupplierAdapter` liides + `MockSupplierAdapter` (~45 realistlikku sülearvutit + üks meelega vigane kirje).
- Hinnastamismootor (vahemikupõhine juurdehindlus, KM tava- ja erikord, makseteenuse tasu, ümardamine, miinimumkasumi kaitse).
- 50 unit/integratsioonitesti.

**Miks nii**

- Prototüüp läbib juba praegu sama ahela kui tulevane sync: tarnija toorandmed → valideerimine → normaliseerimine → hinnastamine → kataloog. Phase 2-s vahetub ainult andmeallikas.
- Ühtegi kinnitamata turundusväidet ei kuvata tootmisrežiimis (`confirmed: false` + `PROTOTYPE_MODE`).
- Tootepiltide asemel neutraalne illustratsioon, mitte võltsfotod. Varasemat hinda ei näidata (pole päris hinnaajalugu).

**Probleemid ja lahendused**

- Next.js 16 kasutab vaikimisi *Cache Components* režiimi: `searchParams`-i lugev sisu peab olema `<Suspense>`-is ja `dynamicParams` segmendi seadistus pole lubatud → filtritega nimekiri loetakse Suspense'i sees, ülejäänud leht eelrenderdatakse (Partial Prerendering).
- ESLint tõlgendas funktsiooni `useCaseHref` React hook'ina (nimi algab `use`) → nimetati ümber `hrefForUseCase`.
- "Uus valikus" / "Lisatud täna" sõltub kellaajast; serveris vahemällu salvestatud HTML võiks näidata aegunud silti → arvutatakse brauseris.
- Mobiilis võttis kleepuv header koos otsinguga liiga palju ruumi → mobiilis kleepub ainult nimekirja filtririba.
