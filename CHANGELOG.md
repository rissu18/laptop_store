# Muudatuste logi

Iga olulise funktsiooni valmimisel: mis lisati, miks, kas tekkis probleem ja kuidas see lahendati.
Seda logi kasutatakse lõputöö kirjaliku osa allikana.

---

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
