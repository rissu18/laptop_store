# Icecati piltide testraport (10 mudelit)

Käivitatud: 2026-10-10 15:07 UTC
Käsk: `npm run icecat -- --test --rematch`
Ligipääs: Open Icecat (kasutajanimi, ilma API/content tokenita)
Pildid: allalaaditud ja töödeldud meie salvestusruumi (`LocalImageStorageAdapter` → `public/media/products/`), Icecati URL-e frontend ei kasuta.

## Kokkuvõte

- ProductModeleid kokku: **10**
- MATCHED: **9**
- NEEDS_REVIEW: **0**
- NOT_FOUND: **1**
- ERROR: **0**
- Pildiga mudeleid: **9** / 10 → image coverage **90%**
- Rohkem kui üks pilt: **9** → gallery coverage **90%**
- Ainult põhipilt: **0**
- Keskmine pilte pildiga mudeli kohta: **9.7**

Üks ProductModel = üks Icecati päring; kõik selle mudeli konfiguratsioonid (Listings) jagavad samu pilte.
"Gallery" = kuvatavad pildid lisaks põhipildile (duplikaadid ja peidetud pildid välja arvatud, max 12 pilti mudeli kohta).

| ProductModel | Listings | Match | Method | Confidence | Main image | Gallery | Status |
|---|---|---|---|---|---|---|---|
| Dell Latitude 5420 | 2 | Icecat 95037175 | MPN (MPN Dell 5420-0457) | 0.95 | Jah | 9 | MATCHED |
| Dell Latitude 5430 | 2 | Icecat 103427438 | GTIN (GTIN 0884116437888) | 1 | Jah | 11 | MATCHED |
| Dell Latitude 7420 | 1 | Icecat 96024841 | MPN (MPN Dell 23DH1) | 0.95 | Jah | 9 | MATCHED |
| HP EliteBook 840 G8 | 2 | Icecat 92708302 | GTIN (GTIN 0196068302726) | 1 | Jah | 3 | MATCHED |
| HP EliteBook 845 G8 | 1 | – | – | – | Ei | 0 | NOT_FOUND · NOT_IN_ICECAT |
| HP EliteBook 850 G8 | 1 | Icecat 93345844 | ICECAT_ID (Icecat ID 93345844) | 0.9 | Jah | 7 | MATCHED |
| HP ProBook 450 G8 | 2 | Icecat 89552415 | MPN (MPN HP 3C2W7ES) | 0.95 | Jah | 6 | MATCHED |
| Lenovo ThinkPad T14 Gen 2 | 2 | Icecat 96871343 | ICECAT_ID (Icecat ID 96871343) | 0.9 | Jah | 11 | MATCHED |
| Lenovo ThinkPad T14 Gen 3 | 3 | Icecat 100004657 | GTIN (GTIN 0196801582675) | 1 | Jah | 11 | MATCHED |
| Lenovo ThinkPad X1 Carbon Gen 9 | 2 | Icecat 88961147 | MPN (MPN Lenovo 20XW004JUS) | 0.95 | Jah | 11 | MATCHED |

## Mudelid ilma pildita

| Mudel | Staatus | Mida teha |
|---|---|---|
| HP EliteBook 845 G8 | NOT_FOUND | Icecat ei leidnud ühegi identifikaatoriga |

## Üksikasjad

### Dell Latitude 5420

- Staatus: MATCHED
- Icecati pealkiri: DELL Latitude 5420 Intel® Core™ i5 i5-1145G7 Laptop 35.6 cm (14") Full HD 16 GB DDR4-SDRAM 512 GB SSD Wi-Fi 6 (802.11ax) Windows 10 Pro Grey
- Päringud:
  - MPN Dell 5420-0457: FOUND — DELL Latitude 5420 Intel® Core™ i5 i5-1145G7 Laptop 35.6 cm (14") Full HD 16 GB DDR4-SDRAM 512 GB SSD Wi-Fi 6 (802.11ax) Windows 10 Pro Grey

### Dell Latitude 5430

- Staatus: MATCHED
- Icecati pealkiri: DELL Latitude 5430 Intel® Core™ i5 i5-1235U Laptop 35.6 cm (14") Full HD 8 GB DDR4-SDRAM 256 GB SSD Wi-Fi 6E (802.11ax) Windows 10 Pro Grey Spanish
- Päringud:
  - GTIN 0884116437888: FOUND — DELL Latitude 5430 Intel® Core™ i5 i5-1235U Laptop 35.6 cm (14") Full HD 8 GB DDR4-SDRAM 256 GB SSD Wi-Fi 6E (802.11ax) Windows 10 Pro Grey Spanish

### Dell Latitude 7420

- Staatus: MATCHED
- Icecati pealkiri: DELL Latitude 7420 Intel® Core™ i7 i7-1185G7 Laptop 35.6 cm (14") Full HD 16 GB LPDDR4x-SDRAM 512 GB SSD Wi-Fi 6 (802.11ax) Windows 10 Pro Black Swiss
- Päringud:
  - MPN Dell 23DH1: FOUND — DELL Latitude 7420 Intel® Core™ i7 i7-1185G7 Laptop 35.6 cm (14") Full HD 16 GB LPDDR4x-SDRAM 512 GB SSD Wi-Fi 6 (802.11ax) Windows 10 Pro Black Swiss

### HP EliteBook 840 G8

- Staatus: MATCHED
- Icecati pealkiri: HP EliteBook 840 G8 Intel® Core™ i5 i5-1135G7 Laptop 35.6 cm (14") 16 GB DDR4-SDRAM 512 GB SSD Windows 10 Pro Silver
- Päringud:
  - GTIN 0196068302726: FOUND — HP EliteBook 840 G8 Intel® Core™ i5 i5-1135G7 Laptop 35.6 cm (14") 16 GB DDR4-SDRAM 512 GB SSD Windows 10 Pro Silver

### HP EliteBook 845 G8

- Staatus: NOT_FOUND (NOT_IN_ICECAT)
- Icecati pealkiri: –
- Päringud:
  - GTIN 0196786546242: NOT_FOUND — Products datasheet is not yet released
  - MPN HP 6F741EA: NOT_FOUND — Products datasheet is not yet released
  - MPN HP 5C3N4PA: NOT_FOUND — Products datasheet is not yet released
  - MPN HP 5P6P0EA: NOT_FOUND — Products datasheet is not yet released
  - MPN HP 5Z621EA: NOT_FOUND — Products datasheet is not yet released
  - Icecat ID 99954859: NOT_FOUND — Products datasheet is not yet released
  - Icecat ID 95800801: NOT_FOUND — Products datasheet is not yet released

### HP EliteBook 850 G8

- Staatus: MATCHED
- Icecati pealkiri: HP EliteBook 850 G8 Notebook PC Intel® Core™ i5 i5-1145G7 Laptop 39.6 cm (15.6") Touchscreen Full HD 8 GB DDR4-SDRAM 256 GB SSD Wi-Fi 6 (802.11ax) Windows 11 Pro
- Päringud:
  - Icecat ID 93345844: FOUND — HP EliteBook 850 G8 Notebook PC Intel® Core™ i5 i5-1145G7 Laptop 39.6 cm (15.6") Touchscreen Full HD 8 GB DDR4-SDRAM 256 GB SSD Wi-Fi 6 (802.11ax) Windows 11 Pro

### HP ProBook 450 G8

- Staatus: MATCHED
- Icecati pealkiri: HP ProBook 450 G8 Intel® Core™ i5 i5-1135G7 Laptop 39.6 cm (15.6") 8 GB DDR4-SDRAM 512 GB SSD Windows 10 Pro Silver
- Päringud:
  - MPN HP 3C2W7ES: FOUND — HP ProBook 450 G8 Intel® Core™ i5 i5-1135G7 Laptop 39.6 cm (15.6") 8 GB DDR4-SDRAM 512 GB SSD Windows 10 Pro Silver

### Lenovo ThinkPad T14 Gen 2

- Staatus: MATCHED
- Icecati pealkiri: Lenovo ThinkPad T14 Gen 2 (Intel) Intel® Core™ i5 i5-1135G7 Laptop 35.6 cm (14") Full HD 8 GB DDR4-SDRAM 256 GB SSD Wi-Fi 6 (802.11ax) Windows 11 Pro Black English
- Päringud:
  - Icecat ID 96871343: FOUND — Lenovo ThinkPad T14 Gen 2 (Intel) Intel® Core™ i5 i5-1135G7 Laptop 35.6 cm (14") Full HD 8 GB DDR4-SDRAM 256 GB SSD Wi-Fi 6 (802.11ax) Windows 11 Pro Black English

### Lenovo ThinkPad T14 Gen 3

- Staatus: MATCHED
- Icecati pealkiri: Lenovo ThinkPad T14 Gen 3 (Intel) Intel® Core™ i5 i5-1235U Laptop 35.6 cm (14") WUXGA 8 GB DDR4-SDRAM 256 GB SSD Wi-Fi 6E (802.11ax) Windows 11 Pro Black German
- Päringud:
  - GTIN 0196801582675: FOUND — Lenovo ThinkPad T14 Gen 3 (Intel) Intel® Core™ i5 i5-1235U Laptop 35.6 cm (14") WUXGA 8 GB DDR4-SDRAM 256 GB SSD Wi-Fi 6E (802.11ax) Windows 11 Pro Black German

### Lenovo ThinkPad X1 Carbon Gen 9

- Staatus: MATCHED
- Icecati pealkiri: Lenovo ThinkPad X1 Carbon Gen 9 Intel® Core™ i5 i5-1135G7 Laptop 35.6 cm (14") WUXGA 16 GB LPDDR4x-SDRAM 512 GB SSD Wi-Fi 6 (802.11ax) Windows 10 Pro Black QWERTY English
- Päringud:
  - MPN Lenovo 20XW004JUS: FOUND — Lenovo ThinkPad X1 Carbon Gen 9 Intel® Core™ i5 i5-1135G7 Laptop 35.6 cm (14") WUXGA 16 GB LPDDR4x-SDRAM 512 GB SSD Wi-Fi 6 (802.11ax) Windows 10 Pro Black QWERTY English
