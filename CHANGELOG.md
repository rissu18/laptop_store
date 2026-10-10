# Muudatuste logi

Iga olulise funktsiooni valmimisel: mis lisati, miks, kas tekkis probleem ja kuidas see lahendati.
Seda logi kasutatakse lõputöö kirjaliku osa allikana.

---

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
