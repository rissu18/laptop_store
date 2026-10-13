# Piltide katte diagnostika — 2026-10-13

Allikas: tootmisandmebaas (Neon), `npm run images:diagnose` (ainult lugemine; sama mapper ja `buildModelGallery` mis pood).
Viimane rikastuse käivitus: 2026-10-12 19:31 UTC. Andmebaasi ega pilte selle töö käigus ei muudetud.

"Päris pilt" = poe efektiivse galerii pilt, mis ei ole PLACEHOLDER ega BLANK. "Aktiivne mudel" = mudel, millel on vähemalt
üks müüdav pakkumine (ACTIVE, saadaval, `quality_hold` NULL).

## 1. Kokkuvõte

| | |
|---|---|
| ProductModel'eid andmebaasis | 555 (kõik `status = ACTIVE`) |
| **Aktiivseid (müügis) mudeleid** | **397** |
| Müüdavaid pakkumisi | 876 |

| Grupp | Mudeleid | % |
|---|---:|---:|
| A — 0 päris pilti (placeholder) | **116** | 29,2 |
| B — 1–4 pilti | 59 | 14,9 |
| C — 5–10 pilti | 202 | 50,9 |
| D — 10+ pilti | 20 | 5,0 |

**Põhijäreldus:** kõik 116 pildita mudelit on müügis **ainult Techi või Foxway kaudu** (100 Foxway-only, 16 Tech-only).
Ühelgi neist pole Laptopid.ee pakkumist ega vastet ning GTIN/MPN puudub 113-l. Laptopid.ee-only ja mitme tarnija
mudelitel pildita mudeleid pole (0 / 164).

## 2. 0-pildiga mudelite peamine põhjus (116)

| # | Põhjus | Mudeleid |
|---|---|---:|
| 02 | Tootja on Open Icecati indeksis, aga mudelit ei leitud | **55** |
| 05 | Apple — teadlik REVIEW (Icecati nimi on ainult "MacBook Air/Pro", GTIN/MPN puudub) | **26** |
| 01 | Tootjat pole Open Icecati sülearvutite indeksis (Microsoft 6, Panasonic 3, Huawei 3, Cepter 3, Razer 1, PC Specialist 1) | **17** |
| 03 | Icecati vaste leiti, aga jäi REVIEW | **12** |
| 13d | Mudel loodi pärast viimast rikastust (Foxway sync 12.–13.10) — rikastust pole käivitatud | 5 |
| 13e | Rikastus käis, Icecati katse jäi salvestamata | 1 |
| 04 | Mudelinimi liiga ebamäärane (pole numbrit) | 0 |
| 06 | Icecati toode leiti, aga pilte polnud | 0 |
| 07 / 08 | Allalaadimine ebaõnnestus / pilt tagasi lükatud | 0 |
| 10 | Laptopid.ee-l mudel olemas, aga fotosid pole | 0 |

Lisatunnused (kattuvad, ei liitu): **09** Laptopid.ee-l mudelit pole — 116; **11** müügis ainult Tech/Foxway (tarnijad pilte ei anna) — 116;
GTIN/MPN puudub — 113; Laptopid.ee vaste REVIEW (kandidaadid olemas) — 5; **12** nimetamise/normaliseerimise probleem — vähemalt 5
(Galaxy Book 4 Pro 360 ↔ piltidega "Galaxy Book 4 Pro 360 NP960QGK"; MacBook Pro 14" 2023 M2 ↔ "MacBook Pro M2 Pro 2023";
ThinkPad L15 / P15 / X13 ilma põlvkonnata, piltidega Gen 1–4 mudelid olemas) + duplikaadid "Panasonic CF-54MK2" / "CF-54 MK2",
kirjaviga "Surface Laptop 3 15icnh".

### Grupp 02 nimemustri järgi (55)

| Muster | Mudeleid | Näited |
|---|---:|---|
| Platvormi/tootekood ilma SKU järelliiteta | 32 | Acer Swift 3 SF314-52, Aspire 3 A315-58, ASUS VivoBook 15 X1504, ROG Strix G18 G814, Samsung Galaxy Book 2 Pro NP950XED, MSI Modern 14 C7M |
| Täielik SKU-kood nimes (HP tarbijamudelid) | 10 | HP Laptop 14-em0422no, HP Pavilion 14-ec0426no, HP Omen 16-wd0011ns, HP Envy x360 13-bf0812no |
| Ainult turundusnimi | 9 | Samsung Galaxy Book 4 Pro, ASUS ROG Zephyrus G16, Acer Predator Helios Neo 16, Honor MagicBook Pro 16 |
| Ärimudel, nimi korrektne | 4 | HP ZBook Fury 15 G8, ZBook Studio G7 / G9, ThinkPad X1 Titanium |

Hüpotees (kinnitada indeksi kuivkäivitusega): Icecatis on tarbijamudelid SKU tasemel ("A315-58-55AH"). Matcher käsitleb
järelliidet eraldi mudelit tähistava sõnana ("Icecatis lisaks: 55ah" → REJECT). Ärimudelitel on Icecatis üks puhas nimi, seega seal seda
probleemi pole.

## 3. Tarnijate kaupa

| Aktiivsed pakkumised | Mudeleid | 0 pilti | 1–4 | 5+ |
|---|---:|---:|---:|---:|
| Laptopid.ee only | 89 | 0 | 23 | 66 |
| Tech only | 90 | 16 | 20 | 54 |
| **Foxway only** | **143** | **100** | 2 | 41 |
| Mitu tarnijat | 75 | 0 | 14 | 61 |

## 4. Tootjate kaupa

| Tootja | Aktiivseid | 0 | 1–4 | 5+ |
|---|---:|---:|---:|---:|
| Apple | 30 | 26 | 2 | 2 |
| HP | 93 | 16 | 26 | 51 |
| ASUS | 16 | 16 | 0 | 0 |
| Samsung | 17 | 12 | 4 | 1 |
| Acer | 11 | 9 | 1 | 1 |
| Lenovo | 119 | 8 | 5 | 106 |
| MSI | 6 | 6 | 0 | 0 |
| Microsoft | 6 | 6 | 0 | 0 |
| Dell | 73 | 3 | 13 | 57 |
| Cepter | 3 | 3 | 0 | 0 |
| Huawei | 3 | 3 | 0 | 0 |
| Panasonic | 3 | 3 | 0 | 0 |
| LG | 1 | 1 | 0 | 0 |
| Razer | 1 | 1 | 0 | 0 |
| Honor | 1 | 1 | 0 | 0 |
| (PC Specialist 1/1, Gigabyte 1/1, Fujitsu 12/0) | | | | |

## 5. Icecati NEEDS_REVIEW (26 kirjet; müügis 0 pildiga 12, 1–4 pildiga 7, mitte müügis 7)

Iga kirje on käsitsi üle vaadatud (Icecati pealkiri vs meie mudel).

| Põhjus | Arv | Kirjed |
|---|---:|---|
| Põlvkond puudub | 6 | ThinkPad E14 Gen 1 ↔ "ThinkPad E14", P1 Gen 1 ↔ "ThinkPad P1" (Icecatis Gen 1 = nimi ilma põlvkonnata); ThinkPad L13 Yoga, L15, P15, X13 (meie nimes põlvkonda pole) |
| Seeria ei klapi | 6 | Latitude 5490 ↔ **Precision** 5490; Latitude 7530 ↔ **Precision** 7530; Vostro 14 5415 ↔ **Inspiron** 14 5415; Galaxy Book 5 ↔ Samsung **Notebook** 5; HP 15-fd0076ns ↔ ZBook 15; ProBook 470 G10 ↔ "HP 470 G10" |
| Vormitegur | 1 | IdeaPad 5 Pro 16 ↔ IdeaPad **Yoga** 5 Pro (2-in-1, 13,9") |
| Ekraani suuruse konflikt | 0 | (IdeaPad 5 Pro 16 on ka siin, loetud vormiteguri alla) |
| CPU ajastu | 2 | XPS 15 9530 (2023) ↔ XPS 15 9530 i7-4712HQ (2013); MSI GF63 Thin ↔ 9. põlvkonna GF63 |
| Apple | 0 | Apple ei jõua REVIEW kirjeni (jäetakse enne vahele, vt p 2 → 05) |
| Sõnajärg / normaliseerimine | 11 | Latitude 14 Rugged 5420 ↔ "Latitude 5420 Rugged"; ZBook Power G8 ↔ "ZBook Power Power G8"; ZBook Power G7 ↔ "…Configurable Material"; Yoga 7 16ILL10 2-in-1 ↔ "…Copilot+ PC"; MSI Vector GP76 / GS75 Stealth ↔ "MSI **Gaming** …"; Zenbook 14 UX3402 / 13 UX325 ↔ "…**OLED** …"; ZenBook 14 UM433I ↔ "ASUS UM433I"; VivoBook X509JA ↔ "ASUS X509JA"; Dell Pro 14 PC14250 ↔ "Dell Pro 14 Touch" |

**Tõenäoliselt ohutu automaatselt lahendada — 13:** ThinkPad E14 Gen 1, ThinkPad P1 Gen 1, HP ProBook 470 G10, Dell Latitude 14 Rugged 5420,
HP ZBook Power G8, HP ZBook Power G7, Lenovo Yoga 7 16ILL10 2-in-1, MSI Vector GP76, MSI GS75 Stealth, ASUS Zenbook 14 UX3402,
ASUS Zenbook 13 UX325, ASUS ZenBook 14 UM433I, ASUS VivoBook X509JA. Müügis mõju: 3 mudelit 0 → pildid, 4 mudelit 1–4 → tõenäoliselt 5+.
**Vajab lisareeglit / ülevaatust — 6:** L13 Yoga, L15, P15, X13 (põlvkond CPU järgi), MSI GF63 Thin (CPU ajastu), Dell Pro 14 (Touch variant).
**Päriselt ohtlik (õigesti tagasi lükatud) — 7:** Latitude 5490, Latitude 7530, Vostro 14 5415, Galaxy Book 5, HP 15-fd0076ns, IdeaPad 5 Pro 16, XPS 15 9530.
Selles sprindis midagi automaatselt ei kinnitatud.

## 6. 1–4 pildiga mudelid (59)

| Põhjus | Mudeleid |
|---|---:|
| Icecati vaste MATCHED, aga Icecati tootel oli ainult 1–4 pilti | **32** — neist **15 täpselt 1 pildiga** (HP EliteBook 830 G6 / 845 G8 / 850 G7 / 855 G8 / 630 G10 / 640 G10 / 650 G10 / 830 G10 / 725 G3, ProBook 430 G8 / 445 G8 / 450 G9 / 455 G8 / 640 G5, Dell Latitude 3400) |
| Laptopid.ee-only galerii, Icecat NOT_FOUND | 15 — neist 6 Dell **Carbon/Magnesium** nimega (Latitude 7310 Carbon, 7310 Carbon 2-in-1, 7320 Carbon, 7420 Carbon, 7430 Carbon, 7430 Magnesium), kuigi baasmudel on Icecatis |
| Laptopid.ee-only galerii, Icecat NEEDS_REVIEW | 7 |
| Laptopid.ee-only galerii, Icecati katset polnud | 5 — 3 neist (ThinkPad L14 G3, L14 G4, EliteBook 640 G11): rikastus loeb ≥ 5 pildirida, aga need on samade fotode koopiad → pärast dedupe't 4 ("olemasolevate piltide prioriteet katkestas rikastuse liiga vara"); 2 Apple |
| Icecati vaste olemas, aga osa pilte jäi alla laadimata | 0 (Icecati read = `image_count` kõigil) |
| Galeriiehitaja ei ühenda mudeli pilte / pakkumise pildid ei jõua galeriisse | 0 |
| BLANK/BROKEN välja jäetud | 2 mudelit (BLANK 20 pilti kokku, BROKEN 0) |

Andmebaasis on 24 ühe pildiga Icecati vastet (sh müügis 5+ mudelid). 23 neist on tulnud mudelinime järgi ja 1 MPN-i järgi.
14 on Icecati kvaliteediga `SUPPLIER` (tarnija andmeleht). Matcher vaatab indeksist kuni 8 kandidaati, JSON-ist kontrollib neist
kuni 5 ja varasema vaste kasutab uuesti ilma uue otsinguta. Hüpotees (kinnitada kuivkäivitusega): sama Model_Name'i mõnel teisel
SKU-l on rohkem pilte.

Dedupe märge 31 mudelil ("eemaldas ≥ 3 pilti") ei ole viga. Laptopid.ee kasutab sama mudeli kõigil pakkumistel samu fotosid
(nt ThinkPad T14s Gen 3: 6 nurka × 7 koopiat = 42 URL-i → 6 pilti) ja osa Laptopid.ee fotosid on Icecati piltide koopiad.
Kontrollitud räsiklastritega.

## 7. Pildid andmebaasis, aga poe galerii ei kasuta

**Images exist in DB but storefront not using them: 0 mudelit.**

96 mudelil on andmebaasis rohkem erinevaid URL-e kui galeriis, aga vahe tuleb ainult identsetest koopiatest (visuaalne räsi ≤ 4 bitti).
Pildita mudelil, millel oleks nähtav mudelipilt, galerii tühjaks ei jää (0). Müügist läinud pakkumiste fotod (17 pilti, 5 mudelit) ei
jõua galeriisse, aga kõigil neil 5 mudelil on juba 5+ pilti.
Näited (galerii / erinevaid URL-e): ThinkPad T480s 8 / 42, T14s G3 6 / 36, T14s G2 16 / 39, HP EliteBook 840 G8 7 / 20,
Dell Latitude 5430 13 / 30, ThinkPad X13 G2 18 / 31, HP EliteBook 830 G6 4 / 7, X1 Carbon G7 10 / 18, T14 G2 13 / 23, Precision 3560 9 / 10.

## 8. Orvud ja kasutamata pildid (midagi ei kustutatud)

| Kontroll | Tulemus |
|---|---|
| Faile `public/media/products` all | 5985 (156 MB) |
| Fail kettal, DB kirje puudub | **9** (HP EliteBook 850 G8 positsioonid 07–08, kõik suurused) |
| DB kirje olemas, fail puudub kettal | 0 |
| DB pildikirje ilma ProductModeli seoseta | 0 (FK NOT NULL + cascade) |
| Seos olemas, aga mudel pole müügis | 388 pilti / 50 mudelit (ootel — ilmuvad, kui mudel tuleb müüki) |
| Pakkumise pildid müügist läinud pakkumistel | 17 |
| Peidetud mudelipildid | 0 |
| BLANK / BROKEN | 20 / 0 |

## 9. 0-pildiga mudelite näited (põhjusega)

| Mudel | Tarnija | Põhjus |
|---|---|---|
| Microsoft Surface Laptop 5 | Foxway | 01 — Microsoft pole Open Icecati sülearvutite indeksis |
| Microsoft Surface Laptop 3 15icnh | Tech | 01 — sama; lisaks nime kirjaviga ("15icnh") |
| Panasonic Toughbook CF-54 MK2 | Tech | 01 — Panasonic pole Open Icecatis; duplikaatmudel "CF-54MK2" |
| Huawei MateBook D 14 | Foxway | 01 — Huawei pole Open Icecatis |
| Razer Blade 16 | Foxway | 01 — Razer pole Open Icecatis |
| Acer Swift 3 SF314-52 | Foxway | 02 — platvormikood, Icecatis SKU järelliitega |
| Acer Aspire 3 A315-58 | Foxway | 02 — sama |
| ASUS VivoBook 15 X1504 | Foxway | 02 — sama |
| ASUS ROG Strix G18 G814 | Foxway | 02 — sama |
| Samsung Galaxy Book 2 Pro NP950XED | Foxway | 02 — sama |
| HP Laptop 14-em0422no | Foxway | 02 — täielik SKU nimes, indeksis vastet pole |
| HP Omen 16-wd0011ns | Foxway | 02 — sama |
| Samsung Galaxy Book 4 Pro | Foxway | 02 — ainult turundusnimi |
| HP ZBook Studio G9 | Foxway | 02 — ärimudel, Open Icecati indeksis vastet pole |
| Lenovo ThinkPad X1 Titanium | Tech | 02 — sama |
| Lenovo ThinkPad X13 | Tech | 03 — põlvkond puudub, Icecatis Gen 1–4 → REVIEW |
| Lenovo ThinkPad L15 | Tech | 03 — sama |
| Lenovo ThinkPad E14 Gen 1 | Foxway | 03 — Icecati nimes "ThinkPad E14" ilma Gen-ita (tõenäoliselt ohutu) |
| MSI Vector GP76 | Foxway | 03 — Icecati pealkiri "MSI Gaming VECTOR GP76" (lisasõna, tõenäoliselt ohutu) |
| Dell Latitude 5490 | Tech | 03 — Icecati kandidaat on Precision 5490 (õigesti tagasi lükatud) |
| Samsung Galaxy Book 5 | Foxway | 03 — Icecati kandidaat Samsung Notebook 5 (õigesti tagasi lükatud) |
| Apple MacBook Air 13" 2020 M1 | Foxway | 05 — Apple, GTIN/MPN puudub |
| Apple MacBook Pro 14" 2023 M3 | Foxway | 05 — sama |
| Apple MacBook Pro 16,1 | Tech | 05 — Apple; nimeks on Apple'i mudeli identifikaator, mitte turundusnimi |
| Lenovo ThinkPad X1 Carbon G12 | Foxway | 13d — mudel loodi pärast viimast rikastust |
| Lenovo Legion 5 15AGP11 | Foxway | 13d — sama |
| HP OmniBook 5 NGAI 14-he0836no | Foxway | 13e — rikastus käis, Icecati katse jäi salvestamata |

Täielik nimekiri: `npm run images:diagnose -- --json fail.json` → `zeroExamples`.

## 10. TOP 3 lahendust

### 1. Icecati vaste tarbijamudelitele tootekoodi järgi (grupp 02)
- **Mida teha:** indeksi kuivkäivitus ainult grupi 02 mudelitele (Icecati Model_Name'ide valim, ilma kirjutamata). Kui hüpotees kinnitub
  ("SF314-52" ↔ "SF314-52-55AH"), lubada tarbijaseeriates (Acer, ASUS, MSI, Samsung NP, HP tarbijad) platvormikoodi järel olevat
  SKU järelliidet konfiguratsiooni-, mitte identiteedisõnana. Pealkirja, ekraani ja CPU ajastu kontroll jääb kohustuslikuks. HP 10
  SKU-nimega mudelit (14-em0422no) sobitada täpse SKU järgi. Samas käigus rikastada 6 uut mudelit (13d/13e).
- **Hinnanguliselt parandab:** kuni 42 + 6 pildita mudelit (realistlikult ~30–40; kinnitab kuivkäivitus).
- **Risk:** MEDIUM (sama platvormi eri ekraani/korpusega SKU-d; maandab pealkirja + ekraani + CPU kontroll).
- **Töömaht:** MEDIUM.
- **Soovitus:** automaatne, aga kuivkäivituse raport enne kirjutamist; ebakindel jääb REVIEW.

### 2. Apple'i mudelite kureeritud vastavustabel (grupp 05)
- **Mida teha:** Foxway Apple'i nimed on struktureeritud (suurus + aasta + kiip). Grupeerida 28 mudelit disaini järgi
  (nt MacBook Air 13" 2018/2019/2020 Intel = üks korpus) ja seada iga disaini kohta Icecati ID adminis (`CONFIRMED_ICECAT_ID`
  on juba olemas) või sisestada MPN. Pildid tulevad olemasoleva Icecati impordiga.
- **Hinnanguliselt parandab:** 26 pildita + 2 1–4 pildiga mudelit.
- **Risk:** LOW (inimene kinnitab vaste).
- **Töömaht:** SMALL–MEDIUM (~15 erinevat disaini).
- **Soovitus:** ülevaatuspõhine (admin).

### 3. Icecati täpsusparandused: ohutud REVIEW klassid, Delli materjalisõnad, parim SKU
- **Mida teha:**
  (a) 13 "tõenäoliselt ohutut" REVIEW kirjet: müra sõnad pealkirjas ("Gaming", "OLED", "Configurable Material", "Copilot+ PC",
  korduv seeria), "Rugged" sõnajärg, Gen 1 = nimi ilma põlvkonnata;
  (b) ThinkPadi põlvkond pakkumiste CPU järgi (L13 Yoga, L15, P15, X13);
  (c) Delli "Carbon"/"Magnesium" müra sõnaks (6 mudelit);
  (d) kui MATCHED vastel on ≤ 2 pilti, vaadata läbi kõik sama Model_Name'i SKU-d (mitte esimesed 5 ega varasem vaste) ja valida kõige
  rohkemate piltidega (eelistada Icecati kvaliteeti `ICECAT`); kasu kinnitab kuivkäivitus;
  (e) rikastuse kandidaadi valik dedupe'itud galerii järgi, mitte ridade arvu järgi (3 mudelit).
- **Hinnanguliselt parandab:** 6 pildita mudelit (3 + 3) ja ~26 1–4 pildiga mudelit (4 + 1 + 6 + 15) → 5+.
- **Risk:** LOW (sama mudeli nimi ja pealkirja kontroll jäävad; (b) LOW–MEDIUM).
- **Töömaht:** SMALL–MEDIUM.
- **Soovitus:** automaatne loetletud klassidele, ülejäänu jääb REVIEW.

**Ei pääsenud TOP 3-sse:** 17 mudelit tootjatelt, keda Open Icecatis pole (Microsoft, Panasonic, Huawei, Cepter, Razer, PC Specialist).
Need vajavad teist pildiallikat või admini käsitsi pilte (~9 erinevat korpust). Lisaks nimeparandused adminis: Panasonic CF-54 duplikaat
ja Surface "15icnh".
