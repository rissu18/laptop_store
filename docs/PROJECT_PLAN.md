# Projekti plaan

> Kasutatud äriklassi sülearvutite e-pood, mis põhineb automaatselt sünkroniseeritaval hulgilaol.
> 12. klassi praktiline lõputöö — aga ehitatud päris tootmises kasutamiseks.

Dokument kirjeldab **PHASE 0** analüüsi tulemust: nõuete analüüs, referentslehtede UX-ülevaade, riskid ja otsused, lehtede ning komponentide nimekiri ja arendusetapid.

Seotud dokumendid:

- [ARCHITECTURE.md](ARCHITECTURE.md) — süsteemi ülesehitus, moodulid, andmevood
- [DATABASE.md](DATABASE.md) — andmemudel ja selle põhjendused
- [../CHANGELOG.md](../CHANGELOG.md) — mis, millal ja miks lisati

---

## 1. Spetsifikatsiooni kokkuvõte

Pood on **vahendaja**: kaup tuleb välisest hulgilaost, meie süsteem impordib tooted, arvutab müügihinna, võtab vastu tellimuse ja makse ning edastab tellimuse automaatselt hulgilattu. Kauba saadab hulgiladu, jälgimisinfo jõuab meie kaudu kliendini.

Kolm asja, millest sõltub projekti edu:

1. **Hulgilao integratsioon** (sync + tellimuse edastus) — projekti tehniline tuum.
2. **Leitavus** — otsing, filtrid, võrdlus ja "leia sobiv" peavad 600 arvuti hulgast valiku lihtsaks tegema.
3. **Usaldus** — seisukord, garantii, tarne ja hind peavad olema ausad ja tõestatavad. Ühtegi turundusväidet ei kuvata, mida süsteem ei suuda tõestada.

## 2. Referentslehtede UX-analüüs

Analüüsitud 10.10.2026. Lehti kasutati ainult UX-referentsina — kujundust, teksti ega pilte ei kopeeritud.

### Greenfox.ee

**Hästi:**

- Rahulik, puhas üldmulje; palju valget ruumi.
- Hero sees otsing + populaarsete mudelite chip'id — kasutaja saab kohe tegutseda.
- Tootekaardil seisukord sõnaliselt ("Väga hea") ja tähega; hind selgelt nähtav; laoseis ("Laos: 1 tk") ja tarneaeg kaardil.
- Nimekirjas "Näidatakse 1–25 / 148" ja "Näita rohkem" — kasutaja teab, kui palju valikut on.
- **Maksutüübi filter (24% KM vs erikord)** — oluline vihje, et kasutatud kauba käibemaks ei ole alati sama (vt riskid, punkt R1).
- Tootelehel ostu juures lühike garantii/tagastus/tarne plokk.

**Puudused, mida meie väldime:**

- Tootekaardil puudub CPU/RAM/SSD nimekirja vaates osaliselt; tooteid tuleb avada.
- Sama info (garantii pikkus, tarneaeg) on eri kohtades erinev — üks andmeallikas (`SystemSetting`) lahendab selle.
- Spetsifikatsioon on tootelehel kaks korda (loend + tabel).
- Seisukorra selgitus on lühike, puudub võrdlus klasside vahel.
- Sülearvutispetsiifilisi filtreid on vähe (pole CPU põlvkonda, ekraani suurust, klaviatuuri).

### Laptopid.ee

**Hästi:**

- Väga põhjalikud filtrid: CPU pere ja põlvkond, ekraan, kaal, ID-kaardilugeja, numpad, 4G, klaviatuur, GPU, pordid.
- Tootekaardil üherealine täisspetsifikatsioon (CPU, RAM, SSD, ekraan, GPU, kaal, garantii, klaviatuur, grade).
- Võrdlusnupp igal kaardil ja võrdluse loendur headeris.
- "Leia sobiv" — kasutusotstarve + bränd + hinnavahemik + seisukord.
- Juhendid ("Kuidas valida sülearvutit", grade'i selgitus).
- Tootelehel märge, et pildid on illustratiivsed.

**Puudused, mida meie väldime:**

- Visuaalselt vananenud; karussell-bänner; palju korduvaid nuppe.
- Filtrite ja toodete pikk ühelehekülje nimekiri ilma lehekülgede/sortimiseta.
- Mitu "vana hinda" korraga (tavahind + tootja soovitushind) ja ajaliselt piiratud pakkumise surve.
- Tehnilised andmed ühe pika loendina, mitte rühmitatult.
- Tootelehel pole "sobib hästi" infot tavakasutajale.

### Järeldus meie lahenduse jaoks

| Valdkond | Meie lahendus |
| --- | --- |
| Avaleht | Kompaktne hero + otsing + 4 tõestatavat väärtuspakkumist; mitte karussell |
| Tootekaart | Pilt, max 2 badge'i, nimi, 4 põhispetsi, seisukord + klaviatuur, hind, laoseis, tarne, "Lisa korvi" + "Võrdle" |
| Filtrid | Laptopid.ee sügavus, aga: tühjad filtrid peidetakse, loendurid igal valikul, aktiivsed filtrid chip'idena, kiirfiltrid ülaosas |
| Tooteleht | Konfiguratsioonivalik samal mudelil, rühmitatud tehnilised andmed, klikitav seisukorra selgitus, sticky mobiili-CTA |
| Usaldus | Iga väide tuleb seadistusest; puuduva info korral väidet ei kuvata |
| Hind | Ainult päris varasem hind; mitte väljamõeldud "tavahind" |

## 3. Riskid ja otsused, mis tuleb enne tootmist läbi mõelda

Märgistus: 🔴 mõjutab ärimudelit või arhitektuuri — vajab sinu otsust; 🟡 tehniline otsus, mille tegin ise ja dokumenteerisin.

### 🔴 R1. Käibemaks ja kasutatud kauba erikord

Eesti standardmäär on **24%** (alates 01.07.2025). Kasutatud kaupa võib müüa ka **kasutatud kauba erikorra** (KMS § 41¹) alusel — siis maksustatakse ainult juurdehindlust ja arvel ei tohi käibemaksu eraldi näidata. Greenfox kasutab mõlemat ("24% KM" ja "0% vahendusmüük").

Mõju: hinnastamise valem, arve vorm, "Hind sisaldab käibemaksu" tekst, B2B kliendid (KM tagasiarvestus on võimalik ainult tavakorra puhul).

**Lahendus koodis:** iga pakkumine kannab välja `vatScheme: "STANDARD" | "MARGIN" | "UNKNOWN"`. Hinnastamismootor toetab mõlemat. `UNKNOWN` korral ei kuvata KM-teksti üldse.

**Vaja:** raamatupidaja/maksunõustaja kinnitus ja tarnija arvete käibemaksukäsitlus. *TODO: REAL PROVIDER DATA REQUIRED.*

### 🔴 R2. Müüja vastutus, garantii ja tagastus vahendusmüügis

- E-poel peab olema müüjaks juriidiline isik (OÜ või FIE) — see on vajalik ka makseteenuse lepinguks.
- Tarbijal on **14-päevane taganemisõigus** (VÕS) ja **seadusjärgne müüja vastutus** (kasutatud kaubal kokkuleppel vähemalt 1 aasta). See on eraldi asi kui "garantii". UI-s ei tohi neid segi ajada.
- Kuna kaupa meie laos ei ole, tuleb lahendada: kuhu klient tagastab, kes maksab tagastussaatmise, kas tarnija võtab tagastusi vastu.

**Vaja:** tarnijaga kokkulepe tagastuste kohta; garantii pikkus; juriidiline isik.

### 🔴 R3. Andmemudel: Product vs ProductVariant vs SupplierListing — **soovitus**

Kasutatud sülearvuti on sageli **unikaalne või väikese kogusega ühik** (konkreetne CPU/RAM/SSD/seisukord/klaviatuur). Sama mudel ("ThinkPad T14 Gen 3") esineb tarnija juures paljude konfiguratsioonidena.

Soovitan kolmetasandilist mudelit:

```
Product            "Lenovo ThinkPad T14 Gen 3"           mudel (stabiilne, SEO leht)
 └─ ProductVariant  i5-1235U · 16 GB · 512 GB · A · SWE   müüdav konfiguratsioon (meie hind, laoseis)
     └─ SupplierListing  Tarnija A SKU 88231              tarnija pakkumine (ostuhind, tarnija laoseis)
```

**Miks:**

1. **SEO:** kasutatud ühikud tulevad ja kaovad päevadega. Kui iga ühik oleks eraldi indekseeritav leht, tekiks pidevalt 404-lehti. Mudelileht `/toode/lenovo-thinkpad-t14-gen-3` on stabiilne ja kogub aja jooksul autoriteeti.
2. **Kasutaja:** tootelehel näeb kõiki saadaolevaid konfiguratsioone ja valib sobiva (nagu riiete suurus).
3. **Mitu tarnijat:** sama konfiguratsiooni võivad pakkuda kaks tarnijat — `ProductVariant` saab valida soodsama/saadaoleva `SupplierListing`-u.
4. **Filtrid** töötavad variandi tasemel (RAM, SSD, CPU), mudeliinfo (kaal, mõõdud) tuleb Product'ist.

**URL:** `/toode/lenovo-thinkpad-t14-gen-3?konfiguratsioon=<id>` — canonical on alati mudelileht ilma parameetrita. Seega URL-is pole RAM-i, SSD-d ega hinda.

**Kompromiss:** keerulisem kui "üks toode = üks rida". Automaatne sobitamine (milline tarnija SKU kuulub millise mudeli alla) vajab normaliseerimise reegleid ja adminis käsitsi ühendamise võimalust.

Prototüüp (Phase 1) on juba selle mudeli järgi ehitatud. **Palun kinnita**, et see sobib.

### 🔴 R4. Tarnija API võimekus on teadmata

Kogu automaatika sõltub tarnija API-st. Enne Phase 4 on vaja teada:

- Kas on tellimuste API (`createOrder`)? Kas see toetab meie viidet / idempotency võtit?
- Kas on staatuse ja jälgimiskoodi API või webhook?
- Rate limit? Autentimine? Testkeskkond (sandbox)?
- Kas tarnija saadab kauba **otse kliendile** neutraalses pakendis (blind dropship)?
- Kus asub ladu (Eesti / EL / väljaspool EL)? See mõjutab tarneaega, transpordikulu ja käibemaksu.
- Seisukorra klasside (Grade) ametlik definitsioon.
- Kas pildid on konkreetse ühiku omad või illustratiivsed? Kas meil on õigus neid kasutada?
- Klaviatuuri paigutus (SWE/NOR/US/UK/EST), laadija olemasolu, aku seisukord.
- Ostuhinna käibemaksukäsitlus (vt R1).

Kuni neid pole, kasutame `MockSupplierAdapter`-it.

### 🔴 R5. Viimane ühik ja makse järel kadunud laoseis

Kui laos on 1 tk ja kaks klienti ostavad samal ajal või tarnija müüb selle vahepeal teise kanalisse, võib juhtuda, et klient on maksnud, aga kaupa pole.

**Lahendus:**

1. Enne makse alustamist kontrollitakse tarnijalt **reaalajas** hinda ja laoseisu (`getStock`, `getPrice`).
2. Meie süsteemis broneeritakse ühik checkout'i ajaks (nt 15 min).
3. Kui pärast makset tarnija tellimus ebaõnnestub laoseisu tõttu → tellimus jääb alles, admin saab kriitilise teate, kliendile pakutakse alternatiivi või **tagastatakse raha**.

Seetõttu peab makseteenuse pakkuja toetama **API kaudu raha tagastamist**. Arvesta sellega pakkuja valikul.

### 🟡 R6. Taustatööd (sync, tellimuste edastus)

Next.js ei ole ajastaja — veebiserver ei peaks käivitama 15-minutilist sünki. Lahendus: **eraldi worker-protsess** samast koodibaasist (eraldi Docker konteiner), mis kasutab **pg-boss** järjekorda. pg-boss hoiab tööde järjekorda PostgreSQL-is — eraldi Redis'i pole vaja. Annab: ajastatud tööd, retry piiratud arvu korral, üks töö korraga (singleton), ajalugu.

### 🟡 R7. Raha arvutamine

Kõik summad salvestatakse **sentides täisarvuna** (`Int`), mitte ujukomaarvuna. `0.1 + 0.2 !== 0.3` on JavaScriptis reaalne probleem. Hinnad vormindatakse ainult kuvamisel.

### 🟡 R8. Next.js 16 Cache Components

Next.js 16 kasutab vaikimisi "Cache Components" mudelit (Partial Prerendering). Lehed on staatilised kuni `searchParams`/`cookies` kasutuseni, mis tuleb mähkida `<Suspense>`-i. Mõju: tootenimekiri (filtrid URL-is) renderdatakse serveris päringu ajal, ülejäänud leht (header, footer) on eelrenderdatud. Phase 2-s lisame andmebaasipäringutele `'use cache'` + `cacheTag('catalog')` ja sync tühistab cache'i.

### 🟡 R9. Ostukorv prototüübis

Phase 1 hoiab ostukorvi ja võrdlust brauseri `localStorage`-is (ainult toote ID ja kogus). **Hinda brauserist ei usaldata** — ostukorvi leht küsib serverist iga rea hinna uuesti. Phase 5-s liigub ostukorv andmebaasi (`Cart` tabel + httpOnly cookie). Kuna kasutame ainult tehniliselt vajalikke salvestusi, cookie bannerit ei ole vaja.

### 🟡 R10. Autentimine — ✅ tehtud (vt ADMIN.md §2)

Admin-kasutajaid on vähe. Tehtud: andmebaasipõhised sessioonid (`admin_sessions`, tokeni SHA-256 räsi), httpOnly + Secure + SameSite=Strict cookie (`__Host-`), paroolid **scrypt** räsina (Node.js sisseehitatud; argon2id oleks vajanud natiivset moodulit), login'i rate limit, kontroll igas serveri action'is ja `/admin` layout'is (mitte ainult React'i tingimuslik kuvamine). Kliendikontot MVP-s ei ole — tellimust saab vaadata tellimuse numbri + e-postiga.

### 🟡 R11. Pildid — ✅ lahendatud Icecatiga (vt ARCHITECTURE.md "Tootepildid")

Mudelipildid tulevad Open Icecatist, laaditakse alla, töödeldakse (300 / 700 / 2000 px WebP) ja hostitakse meie salvestusruumis — mitte hotlink. Pildid kuuluvad mudelile. Kui vaste pole kindel, pilti live'i ei panda. Kui pilte pole, kuvatakse neutraalne illustratsioon — **mitte võltsitud tootefotod**.

### 🔴 R13. Piltide püsiv salvestusruum tootmises

Vercelis ei saa pilte runtime'is failisüsteemi salvestada. Online-piltide jaoks on vaja S3-ühilduvat salvestusruumi. **Vajab sinu otsust** (soovitus: Cloudflare R2 — 10 GB tasuta, väljaminev liiklus tasuta, S3 API → ei teki lukustust). Praegune maht: ~45 MB (38 mudelit, ~1,2 MB mudeli kohta); tuhande mudeli juures ~1,2 GB — mahub tasuta piiri. Ajutine lahendus testversioonis: töödeldud pildid (~45 MB) on Git'is (`public/media/products`) ja Vercel serveerib neid staatiliste failidena. Piltide allalaadimine ja käsitsi üleslaadimine adminis töötab alles püsiva salvestusruumiga.

### 🔴 R14. Tarnija feed peab andma GTIN-i või tootja koodi (MPN)

Icecati JSON API ei otsi nime järgi. Ilma GTIN/MPN-ita ei saa uusi mudeleid automaatselt Icecatiga siduda. Küsi hulgilaolt, kas feed sisaldab EAN-i ja tootja part number'it.

### 🟡 R12. ORM — ✅ otsustatud: Drizzle

Projekti alguse seisuga oli Prisma `latest` sildi all 8.0 RC. Andmebaasi etapis valisin **Drizzle ORM-i** (stabiilne, serverless'is kerge, SQL-i lähedane, migratsioonid tavalise SQL-ina). Põhjendus: DATABASE.md "ORM valik".

## 4. Lõplik tehnoloogiapakk

| Kiht | Valik | Märkus |
| --- | --- | --- |
| Raamistik | **Next.js 16** (App Router) + React 19 | Server Components, Server Actions, PPR |
| Keel | **TypeScript** strict | |
| Stiil | **Tailwind CSS 4** + CSS muutujad (design tokens) | |
| Valideerimine | **Zod** | API sisend, vormid, env, tarnija andmed |
| Andmebaas | **PostgreSQL** (Neon, v18) | + `pg_trgm` otsinguks, kui kataloog kasvab |
| ORM | **Drizzle ORM** + drizzle-kit | migratsioonid SQL-ina, tüübid skeemist (R12) |
| Taustatööd | **pg-boss** (eraldi worker) | uus — põhjendus R6 |
| E-post | **Nodemailer** (SMTP) `EmailProvider` taga | self-hosted SMTP sobib |
| Logimine | **pino** (JSON logid) | |
| Testid | **Vitest** (unit/integration), **Playwright** (E2E) | |
| Deploy | **Docker Compose**: `web`, `worker`, `db`, `nginx` | Let's Encrypt (certbot) |

Ükski komponent ei nõua kuutasu ega konkreetset hostingut.

**Mida teadlikult ei lisa:** Redis, Elasticsearch, Kubernetes, GraphQL, mikroteenused, eraldi CMS. Põhjendus: [ARCHITECTURE.md](ARCHITECTURE.md#mida-me-ei-kasuta).

## 5. Lehed ja route'id

### Avalik pood

| Route | Leht | Renderdamine |
| --- | --- | --- |
| `/` | Avaleht | Staatiline + cache |
| `/sulearvutid` | Kõik sülearvutid, filtrid URL-is | Päringu ajal (searchParams) |
| `/sulearvutid/[brand]` | Brändi leht (`lenovo`, `dell`, `hp`) | Päringu ajal; eraldi SEO sisu |
| `/parimad-pakkumised` | Esiletõstetud pakkumised | Staatiline + cache |
| `/toode/[slug]` | Mudeli leht + konfiguratsioonid | ISR (`generateStaticParams`) |
| `/vordlus` | Toodete võrdlus (max 4) | Klient |
| `/ostukorv` | Ostukorv | Klient + server action |
| `/kassa` | Checkout (minimaalne layout) | Phase 5 |
| `/tellimus/[number]` | Tellimuse staatus (number + e-post) | Phase 5 |
| `/leia-sobiv` | Laptop finder wizard | Phase 8 |
| `/seisukorrad` | Seisukorra klasside selgitus | Staatiline |
| `/info/[slug]` | Tarne, tagastus, garantii, KKK, kontakt, tingimused | Staatiline |
| `/api/search` | Autocomplete JSON | Päringu ajal |
| `/api/webhooks/payment/[provider]` | Makse webhook | Phase 6 |
| `/sitemap.xml`, `/robots.txt` | SEO | |

### Admin (`/admin`, kaitstud serveris)

Tehtud: `/admin/login`, `/admin` (töölaud), `/admin/products/models[/id]`, `/admin/products/listings[/id]`, `/admin/images[/modelId]`, `/admin/data-quality`, `/admin/pricing`, `/admin/settings`, `/admin/system/activity`, `/admin/system/logs`, `/admin/system/health`. Tulekul: tellimused, kliendid, tarnijad (sync). Vt ADMIN.md.

### Filtrite URL-skeem

`/sulearvutid?brand=lenovo&ram=16,32&ssd=512&screen=14&grade=A&cpu=intel-core-i5&gen=12&min=300&max=600&f=touch,backlit&kb=SWE&sort=price-asc&page=2&q=t14`

- Filtritega URL-id saavad `noindex, follow` ja canonical'i `/sulearvutid`-le → ei teki tuhandeid duplikaatlehti.
- Indekseeritavad on ainult `/sulearvutid`, brändilehed ja tootelehed.

## 6. Komponentide arhitektuur

```
components/
  ui/          Button, Badge, Dialog (natiivne <dialog>), Drawer, Icon, Container
  layout/      TrustBar, SiteHeader, MainNav, MobileMenu, SiteFooter, PrototypeNotice
  search/      SearchBox (combobox + autocomplete)
  product/     ProductCard, ProductGrid, ProductImage, PriceTag, StockStatus,
               GradeBadge, GradeExplainer, QuickSpecs, SpecSections,
               ProductGallery, BuyBox, VariantPicker, StickyBuyBar,
               AddToCartButton, CompareToggle, FreshnessBadge
  catalog/     FilterPanel, FilterDrawer, QuickFilterChips, ActiveFilters,
               SortSelect, Pagination, ListingHeader, EmptyResults
  home/        Hero, ValueProps, ProductRail, UseCasePicker, BrandTiles, WhyUsedSection
  cart/        CartView, CartLine, CartSummary
  compare/     CompareBar, CompareTable
```

Põhimõtted:

- **Server Components vaikimisi.** Klientkomponent (`'use client'`) ainult interaktiivsuse jaoks: otsingu autocomplete, filtrite vorm, galerii, ostukorvi/võrdluse nupud, dialoogid.
- Komponent ei tea, kust andmed tulevad — ta saab tüübitud objekti (`CatalogItem`) props'ina.
- Ostuhind (`supplierCost`) ei jõua kunagi klientkomponenti — avalikud tüübid ei sisalda seda välja.

## 7. Arendusetapid (roadmap)

| Etapp | Sisu | Valmis, kui |
| --- | --- | --- |
| **0 Analüüs** ✅ | Plaan, arhitektuur, andmemudel | Need dokumendid |
| **1 UI prototüüp** ✅ (1. versioon) | Layout, avaleht, nimekiri, filtrid, otsing, tooteleht, ostukorv, võrdlus — mock-andmetel | Kõik põhilehed töötavad mobiilis ja desktopil |
| **1b Tootepildid** ✅ | Icecati klient, vaste otsimine, pildi import (thumbnail/medium/large), galerii, duplikaadid, peitmine, Data Quality (CLI + arenduse vaade); kogu kataloog: 38 mudelit, 34 pildiga (89,5%) | Pildid kohalikult nähtavad; tootmise salvestusruum ootab otsust (R13) |
| **2 Andmebaas** ✅ | Neon PostgreSQL, Drizzle skeem (12 tabelit), migratsioon, idempotentne import (38 / 46 / 320 klapib), pood loeb andmebaasist vahemäluga | Leht töötab andmebaasist |
| **3 Admin** ✅ | Login (scrypt, sessioonid, piirang, CSRF), mudelid, konfiguratsioonid (parandused vs tarnija väärtus), pildid, Icecat, andmekvaliteet, hinnastamine (eelvaade + rakendamine), seaded, audit, logid, tervis | Admin saab hindu ja seadeid muuta; muudatus jõuab poodi kohe |
| **3b Sooduskoodid** ✅ | DiscountEngine (%, €, tasuta tarne), kehtivusaeg, kasutuspiirang, tootja/mudeli/konfiguratsiooni piirang ja välistused, marginaalikaitse, ostukorvi kood, admin (nimekiri, vorm, eelvaade, duplikaat, arhiveerimine), kasutuste arhitektuur tellimuste jaoks | Kood töötab ostukorvis; summa arvutab server |
| **4 Tarnija** | `SupplierAdapter`, sync worker, SyncRun log, hinnaajalugu; päris tarnija, kui API info olemas | Sync jookseb ajastatult, logid adminis |
| **5a Kassa + tellimused** ✅ | Külalisost (`/kassa`), serveripoolne arvutus, hinnamuutuse/laoseisu/koodi ülevaatus, idempotentsus, snapshot, testtellimused, kinnitusleht, tellimuse otsing, admini tellimused (tühistamine, märkmed, ajalugu), tarne seadetest — vt ORDERS.md | Testtellimus tekib andmebaasi |
| **5b Tarneteenused** | Pakiautomaadid (Omniva/DPD/SmartPOST), päris tarnehinnad | Klient valib pakiautomaadi |
| **6 Maksed** | `PaymentProvider` + valitud pakkuja, webhook verifitseerimine, `confirmRedemption` / `cancelRedemption` | Makse kinnitatakse serveris |
| **7 Automaatika** | Tarnija tellimus, idempotency, tracking, e-kirjad, vigade taastamine | Tellimus liigub ise tarnijani ja tagasi |
| **8 Lihvimine** | Laptop finder, "sobib hästi" reeglid, SEO, jõudlus, a11y audit, E2E testid | Lighthouse ja a11y kontroll läbitud |
| **9 Tootmine** | VPS, Nginx, HTTPS, varukoopiad, monitooring | Pood avalikult üleval |

## 8. Info, mida vajan sinult

1. Kinnitus andmemudelile (R3).
2. Tarnija nimi ja API dokumentatsioon (R4) — kui olemas.
3. Ettevõtte andmed (nimi, registrikood) ja garantii/tagastuse tingimused (R2).
4. Käibemaksukäsitlus (R1) — raamatupidajaga.
5. Poe nimi ja domeen (praegu kasutan ajutist nime "Sülearvutipood").
6. Piltide salvestusruumi valik tootmiseks (R13).
7. Kas tarnija feed sisaldab EAN-i ja tootja koodi (R14).
