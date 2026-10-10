# Muudatuste logi

Iga olulise funktsiooni valmimisel: mis lisati, miks, kas tekkis probleem ja kuidas see lahendati.
Seda logi kasutatakse lõputöö kirjaliku osa allikana.

---

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
