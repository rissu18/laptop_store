# Piltide rikastus — madala riskiga parandused (2026-10-13)

Eelmise diagnostika ([image-coverage-2026-10-13.md](image-coverage-2026-10-13.md)) põhjal. Tootmisandmebaas, `npm run enrich:catalog -- --images --icecat`
(kuivkäivitused `--dry-run --index-cache`), mõõtmine `npm run images:diagnose` enne ja pärast.

## Tulemus (müügis mudelid, poe efektiivne galerii)

| Pilte | Enne | Pärast |
|---|---:|---:|
| 0 (placeholder) | 114 | **63** |
| 1–4 | 59 | **49** |
| 5–10 | 201 | 261 |
| 10+ | 20 | 20 |
| **5+ kokku** | 221 | **281** |
| Müügis mudeleid | 394 | 393 (1 müüdi vahepeal läbi) |

Icecat: 173 kandidaati, **72 uut või paremat vastet**, alla laaditud **601 pilti** (5 duplikaati, 3 BLANK), vigu 0. Andmebaasi kirjeid ilma failita 0.

| Muudatus | Mudeleid |
|---|---:|
| Kandidaadi loenduse viga (koopiad loeti eraldi piltideks): ThinkPad L14 Gen 3, L14 Gen 4, EliteBook 640 G11 | 3 |
| REVIEW → ohutult vastu võetud (normaliseerimine 6, FIRST_GEN 2, põlvkond protsessoritest 3, Galaxy "Book5" 1) | 12 |
| Tarbijamudel tootekoodi järgi (PRODUCT_CODE) | 35 |
| Dell Latitude Carbon / Magnesium (materjal) | 6 |
| Samsung "Book4/5/6" = "Book 4/5/6" | 7 (+ Book 5 ülal) |
| Parem SKU sama identiteediga (UPGRADED: 1–4 pilti → rohkem) | 6 |
| Uued mudelid (rikastust polnud): Legion 5 15AGP11, ThinkPad X1 Carbon G12, Dell Pro 14 | 3 |
| **Jäi REVIEW** (Apple 26 + 8 muud) | 34 |
| **Jäi UNRESOLVED** (tootja pole Open Icecatis 17 + 24 muud) | 41 |

Pildita mudelite põhjused pärast: Apple 24, tootja pole Open Icecatis 17, Icecati indeksist ei leitud 18, REVIEW 4.

## Ohutud reeglid (mis muutus)

- **Kandidaat** = galeriis < 5 UNIKAALSET kasutatavat pilti (sama dedupe mis poes), mitte ridade arv. Regressioonitest: 10 rida → 2 unikaalset → kandidaat.
- **Müra:** "Configurable Material", "Copilot+"; korduv sõna pealkirjas; "Book4" = "Book 4"; MSI "Gaming"; Dell **Latitude** "Carbon"/"Magnesium"; ASUS "OLED" ainult tootekoodiga.
- **Sõnajärg:** ainult meie oma korpusesõna (Rugged) võib olla numbri järel.
- **FIRST_GEN:** Lenovo Gen 1 ↔ põlvkonnata nimi ainult siis, kui pealkirjas pole põlvkonda ja protsessori ajastu on täpselt sama.
- **ThinkPadi põlvkond protsessoritest** (lisatõend): ainult üheselt tuletatav, muidu REVIEW.
- **Tootekood:** Acer/Samsung täpne kood + SKU järelliide (SF314-52 ≠ SF314-52G), ASUS/MSI kood + platvormi tähed (MSI + liini sõnad), HP platvorm + liin (Pavilion ≠ Laptop). LG ei ole toetatud.
- **Parem SKU:** ainult sama mudeli identiteet (nimi + pealkiri + ekraan + CPU); teise mudeli suurem galerii ei loe.
- **Endiselt tagasi** (testides): Latitude ≠ Precision, T14 ≠ T14s, G7 ≠ G8, Yoga/x360/Rugged erinevus, eri põlvkond, selgelt vale CPU ajastu.

## Kõik 72 uut vastet

| Meie mudel | Icecati vaste | Otsus | Confidence | Pilte enne → Icecat |
|---|---|---|---:|---|
| Acer Aspire 3 A315-58 | A315-58-782H | PRODUCT_CODE | 0.85 | 0 → +8 |
| Acer Aspire 3 A315-59 | A315-59-53JW | PRODUCT_CODE | 0.85 | 0 → +8 |
| Acer Aspire Lite 16 AL16-52P | AL16-52P-54H2 | PRODUCT_CODE | 0.85 | 0 → +7 |
| Acer Aspire Lite AL14-32P | AL14-32P-32LE | PRODUCT_CODE | 0.85 | 0 → +7 |
| Acer Extensa 15 EX215-55 | EX215-55-567G | PRODUCT_CODE | 0.85 | 0 → +9 |
| Acer Swift 3 SF314-42 | SF314-42-R4Z8 | PRODUCT_CODE | 0.85 | 0 → +10 |
| Acer Swift 3 SF314-52 | SF314-52-33GP | PRODUCT_CODE | 0.85 | 0 → +9 |
| ASUS ExpertBook B1 B1400 | PORTATIL LAPTOP COMERCIAL  EXPERTBOOK B1400 1 | PRODUCT_CODE | 0.85 | 0 → +10 |
| ASUS ROG Strix G18 G814 | G814FP-S9120W | PRODUCT_CODE | 0.85 | 0 → +10 |
| ASUS ROG Strix G18 G815 | G815LW-SA265W | PRODUCT_CODE | 0.85 | 0 → +10 |
| ASUS ROG Strix GL502VM | GL502VM-FY206T | PRODUCT_CODE | 0.85 | 0 → +10 |
| ASUS TUF Gaming F17 FX706 | FX706HM-HX031W | PRODUCT_CODE | 0.85 | 0 → +10 |
| ASUS VivoBook 15 M1502 | M1502NAQ-R51BLHDAS01 | PRODUCT_CODE | 0.85 | 0 → +10 |
| ASUS VivoBook 15 X1504 | X1504MA-BQ200 | PRODUCT_CODE | 0.85 | 0 → +8 |
| ASUS VivoBook Go 15 OLED E1504F | E1504FA-BQ5473 | PRODUCT_CODE | 0.85 | 0 → +8 |
| ASUS VivoBook Pro 15 K3500 | ‎K3500PH-DB51 | PRODUCT_CODE | 0.85 | 0 → +10 |
| ASUS VivoBook S 14 K3402 | K3402ZA-LY046W | PRODUCT_CODE | 0.85 | 0 → +10 |
| ASUS VivoBook S 14 OLED K3402 | K3402ZA-LY046W | PRODUCT_CODE | 0.85 | 0 → +10 |
| ASUS VivoBook S14 S3407 | S3407QA-SF061W | PRODUCT_CODE | 0.85 | 0 → +10 |
| ASUS VivoBook S15 S533 | S533EA-L13566W | PRODUCT_CODE | 0.85 | 0 → +10 |
| HP Envy x360 13-bf0812no | Envy x360 13-bf0002na | PRODUCT_CODE | 0.85 | 0 → +1 |
| HP Envy x360 16-ad0845no | Envy x360 16-ad0002na | PRODUCT_CODE | 0.85 | 0 → +1 |
| HP Laptop 14-em0422no | Laptop 14-em0018na | PRODUCT_CODE | 0.85 | 0 → +1 |
| HP Laptop 14s-fq0058no | 14s-fq0016na | PRODUCT_CODE | 0.85 | 0 → +4 |
| HP Laptop 15-fc0411no | 15-FC0083NA R5-7530U 8GB 256GB W11H | PRODUCT_CODE | 0.85 | 0 → +1 |
| HP Laptop 15-fc0900ng | 15-FC0083NA R5-7530U 8GB 256GB W11H | PRODUCT_CODE | 0.85 | 0 → +1 |
| HP Notebook 15s-fq1801no | Laptop 15s-fq1034nf | PRODUCT_CODE | 0.85 | 0 → +4 |
| HP Omen 15-en0375ng | 15-en0006na | PRODUCT_CODE | 0.85 | 0 → +9 |
| HP Omen 16-wd0011ns | 16-wd0001nk | PRODUCT_CODE | 0.85 | 0 → +5 |
| HP OmniBook 5 NGAI 14-he0836no | OmniBook 5 Next Gen AI 14-he0002na | PRODUCT_CODE | 0.85 | 0 → +1 |
| HP Pavilion 14-ec0426no | 14-ec0003na | PRODUCT_CODE | 0.85 | 0 → +7 |
| MSI Bravo 15 C7V | Bravo 15 C7VF-209UK | PRODUCT_CODE | 0.85 | 0 → +10 |
| MSI GV62 8RC | GV62 8RC-017XPL | PRODUCT_CODE | 0.85 | 0 → +5 |
| MSI Modern 14 C7M | Modern 14 C7M-423XES | PRODUCT_CODE | 0.85 | 0 → +10 |
| Samsung Galaxy Book 3 Ultra NP960XFH | NP960XFH-XA2UK | PRODUCT_CODE | 0.85 | 0 → +10 |
| Dell Latitude 7310 Carbon 2-in-1 | Latitude 7310 2-in-1 | NAME_EXACT | 0.92 | 3 → +1 |
| Dell Pro 14 PC14250 | Pro 14 PC14250 | NAME_EXACT | 0.92 | 0 → +9 |
| HP EliteBook 640 G11 | EliteBook 640 G11 | NAME_EXACT | 0.92 | 4 → +1 |
| HP ZBook Power G7 | ZBook Power G7 Mobile Workstation Configurabl | NAME_EXACT | 0.92 | 0 → +1 |
| Lenovo Legion 5 15AGP11 | Legion 5 15AGP11 Copilot+ PC | NAME_EXACT | 0.92 | 0 → +10 |
| Lenovo ThinkPad L14 Gen 3 | ThinkPad L14 Gen 3 (AMD) | NAME_EXACT | 0.92 | 4 → +6 |
| Lenovo ThinkPad L14 Gen 4 | ThinkPad L14 Gen 4 (AMD) | NAME_EXACT | 0.92 | 4 → +6 |
| Lenovo ThinkPad L15 | ThinkPad L15 Gen 1 (Intel) | NAME_EXACT | 0.92 | 0 → +10 |
| Lenovo ThinkPad P P15 | ThinkPad P15 Gen 1 | NAME_EXACT | 0.92 | 0 → +10 |
| Lenovo ThinkPad X1 Carbon Gen 12 | ThinkPad X1 Carbon Gen 12 | NAME_EXACT | 0.92 | 0 → +10 |
| Lenovo ThinkPad X13 | ThinkPad X13 Gen 1 (AMD) | NAME_EXACT | 0.92 | 0 → +10 |
| Lenovo Yoga 7 16ILL10 2-in-1 | Yoga 7 2-in-1 16ILL10 Copilot+ PC | NAME_EXACT | 0.92 | 4 → +6 |
| MSI GF63 Thin | GF63 Thin | NAME_EXACT | 0.92 | 0 → +10 |
| MSI Vector GP76 | VECTOR GP76 12UH | NAME_EXACT | 0.92 | 0 → +5 |
| Samsung Galaxy Book 4 360 | Galaxy Book4 360 | NAME_EXACT | 0.92 | 0 → +10 |
| Samsung Galaxy Book 4 Pro | Galaxy Book4 Pro | NAME_EXACT | 0.92 | 0 → +9 |
| Samsung Galaxy Book 4 Pro 360 | Galaxy Book4 Pro 360 | NAME_EXACT | 0.92 | 0 → +10 |
| Samsung Galaxy Book 4 Ultra | Galaxy Book4 Ultra | NAME_EXACT | 0.92 | 4 → +6 |
| Samsung Galaxy Book 5 | Galaxy Book5 | NAME_EXACT | 0.92 | 0 → +7 |
| Samsung Galaxy Book 5 Pro 360 | Galaxy Book5 Pro 360 | NAME_EXACT | 0.92 | 4 → +6 |
| Samsung Galaxy Book 6 | Galaxy Book6 | NAME_EXACT | 0.92 | 0 → +7 |
| Samsung Galaxy Book 6 Pro | Galaxy Book6 Pro | NAME_EXACT | 0.92 | 0 → +7 |
| Dell Latitude 14 Rugged 5420 | 5420 Rugged | NAME_FAMILY | 0.90 | 4 → +6 |
| Dell Latitude 7310 Carbon | 7310 | NAME_FAMILY | 0.90 | 3 → +7 |
| Dell Latitude 7320 Carbon | 7320 | NAME_FAMILY | 0.90 | 2 → +8 |
| Dell Latitude 7420 Carbon | 7420 | NAME_FAMILY | 0.90 | 3 → +7 |
| Dell Latitude 7430 Carbon | 7430 | NAME_FAMILY | 0.90 | 3 → +4 |
| Dell Latitude 7430 Magnesium | 7430 | NAME_FAMILY | 0.90 | 3 → +4 |
| HP ZBook Power G8 | Power G8 | NAME_FAMILY | 0.90 | 3 → +6 |
| Lenovo ThinkPad E14 Gen 1 | ThinkPad E14 | NAME_FIRST_GEN | 0.85 | 0 → +10 |
| Lenovo ThinkPad L13 Yoga | ThinkPad L13 Yoga | NAME_FIRST_GEN | 0.85 | 2 → +8 |
| Acer Aspire 3 A315-44P | A315-44P-R5V5 | UPGRADED | 0.85 | 3 → +10 |
| Dell Latitude 3400 | 3400 | UPGRADED | 0.90 | 1 → +10 |
| Fujitsu LifeBook A556 | A556 | UPGRADED | 0.90 | 3 → +6 |
| Fujitsu LifeBook E556 | E556 | UPGRADED | 0.90 | 3 → +4 |
| HP 245 G8 | 245 G8 | UPGRADED | 0.92 | 4 → +6 |
| HP EliteBook 830 G10 | 830 13 G10 | UPGRADED | 0.90 | 3 → +6 |

Käsitsi visuaalselt kontrollitud (kontaktleht): ASUS ExpertBook B1400, Vivobook Pro 15 K3500, ROG Strix G18 G814, Dell Latitude 7430 Carbon,
HP Laptop 15-fc0411no, HP Omen 16, MSI GF63 Thin, Samsung Galaxy Book 5, Galaxy Book4 Pro, ThinkPad X13, L15, E14 Gen 1, Acer Swift 3 SF314-52 — kõik õige mudel.

## Jäi REVIEW (8, Apple välja arvatud)

| Mudel | Põhjus |
|---|---|
| Dell Latitude 5490 | Icecati kandidaat on Precision 5490 — õigesti tagasi |
| Dell Latitude 7530 | Icecati kandidaat on Precision 7530 — õigesti tagasi |
| Dell Vostro 14 5415 | Icecati kandidaat on Inspiron 14 5415 — õigesti tagasi |
| Dell XPS 15 9530 | Icecati XPS 15 9530 on 2014. aasta (i7-4712HQ) — õigesti tagasi |
| Lenovo IdeaPad 5 Pro 16 | Icecati kandidaat IdeaPad Yoga 5 Pro (2-in-1, 13,9") — õigesti tagasi |
| HP ProBook 470 G10 | Icecatis "HP 470 G10" (seeria pealkirjas puudub) — vajab inimest |
| Samsung Galaxy Book2 Pro NP950XED | Icecati pealkirjas pole koodi (13" ja 15" sama nimega) — vajab inimest |
| Samsung Galaxy Book4 Pro 360 NP960QGK | sama; lisaks dubleerib mudelit "Galaxy Book 4 Pro 360" (nüüd 10 pilti) |

UNRESOLVED (24, tootja Icecatis): HP ZBook Fury/Studio/Firefly (Open Icecatis neid SKU-sid pole), Samsung Galaxy Book 4 Edge NP750/NP940/NP960
(lühike kood, mitmetähenduslik), LG Gram 14Z90 (mitu aastat), ROG Zephyrus G16, Predator Helios Neo 16, MagicBook Pro 16, Spin 3 SP313-51,
ExpertBook B3302CEA, VivoBook X415JAB, XPS 15 9520, X1 Titanium, EliteBook x360 1040 G9, Gigabyte A16, MSI P65 Creator, Galaxy Book 2 2-in-1 / 360.

## Apple (automaatne vaste välja lülitatud) — käsitsi vastete vajadus

24 pildita + 2 1–4 pildiga Apple'i mudelit jagunevad füüsiliste korpuste järgi:

| # | Korpus | Meie mudelid | Pildita |
|---|---|---|---:|
| 1 | MacBook 12" Retina (2015–2017) | MacBook 12" 2017 | 1 |
| 2 | MacBook Air 13" kiilukujuline (2010–2017) | Mid 2012, Mid 2013, Early 2015, 2017 | 4 |
| 3 | MacBook Air 13" Retina (2018–2020, sh M1) | 2018, 2019, 2020, 2020 M1 | 4 |
| 4 | MacBook Air 13" sirge korpus (2022+) | 2024 M3 (+ M2 2022, 4 pilti) | 1 |
| 5 | MacBook Air 15" (2023+) | 15" 2023 M2 | 1 |
| 6 | MacBook Pro 13" Retina (2012–2015) | Late 2013 | 1 |
| 7 | MacBook Pro 15" Retina (2012–2015) | 15" Late 2013, 15" Mid 2015 | 2 |
| 8 | MacBook Pro 13" USB-C (2016–2022) | 2017/2018 4 TBT3, 2019/2020 2 ja 4 TBT3, 2020 M1 | 7 |
| 9 | MacBook Pro 16" (2019, Intel) | 16" 2019, "MacBook Pro 16,1" (= MacBookPro16,1, nimeviga) | 2 |
| 10 | MacBook Pro 16" (2021+, Apple silicon) | 16" 2026 M5 Max | 1 |
| 11 | MacBook Pro 14" (2021+) | (M2 Pro 2023, 4 pilti) | 0 |

**Vaja on 10 unikaalset kinnitust 24 pildita mudeli jaoks** (11 koos 1–4 pildiga). Kui rühm 8 jagada Touch Bariga (4 TBT3) ja ilma (2 TBT3), siis 12.
Admin seab rühma kohta ühe kinnitatud Icecati ID (`CONFIRMED_ICECAT_ID`) või MPN-i; pildid tulevad olemasoleva impordiga. Automaatselt midagi ei kinnitatud.

## Piirjuhud

- **ThinkPad L15:** meie pakkumised on AMD (Ryzen 4000 → Gen 1), Icecati vaste on L15 Gen 1 **Intel** — sama korpus, piltidel Inteli kleebis.
- **ROG Strix G18 G814:** Icecati SKU on 2025 AMD variant (G814FP), meil 2023 Intel + AMD — sama korpus (ASUS-e kood).
- **MSI GF63 Thin:** Icecat 11. põlvkond, meil 12. — sama korpus; CPU ajastu kontroll (≥ 3 põlvkonda) läbitud.
- **Ainult 1 Icecati pilt:** HP Envy x360 13/16, HP Laptop 14-em0 / 15-fc0, OmniBook 5, ZBook Power G7, Latitude 7310 Carbon 2-in-1, EliteBook 640 G11 —
  Icecatis on neil SKU-del ainult 1 pilt; jäävad 1–4 rühma.
- **ASUS ExpertBook B1400:** Icecati kirje nimi on edasimüüja tekst ("PORTATIL LAPTOP COMERCIAL…"), aga tootja ASUS ja kood B1400 klapivad; pildid kontrollitud.
- **Duplikaatmudelid:** "VivoBook S 14 K3402" ja "VivoBook S 14 OLED K3402" said sama Icecati toote; Galaxy Book4 Pro 360 ja "… NP960QGK" on dubleeritud mudel.
- **Indeksi vahemälu** (`--index-cache`) on 570 MB tööfail scratch-kaustas, repo'sse ei lähe.
