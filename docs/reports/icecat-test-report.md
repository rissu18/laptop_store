# Icecati piltide testraport

Käivitatud: 2026-10-10 14:46 UTC
Käsk: `npm run icecat -- import --test`
Ligipääs: Open Icecat (kasutajanimi, ilma API/content tokenita)

## Kokkuvõte

- Testitud mudeleid: **10**
- Icecat leidis: **9**
- Põhipilt olemas: **9**
- Galerii (lisaks põhipildile) olemas: **9**

| Mudel | Icecat match | Match method | Main image | Gallery images | Result |
|---|---|---|---|---|---|
| Dell Latitude 5420 | Jah (Icecat ID 95037175) | MPN (0.95) | Jah | 9 | ✅ Pildid live'is |
| Dell Latitude 5430 | Jah (Icecat ID 103427438) | GTIN (1) | Jah | 11 | ✅ Pildid live'is |
| Dell Latitude 7420 | Jah (Icecat ID 96024841) | MPN (0.95) | Jah | 9 | ✅ Pildid live'is |
| HP EliteBook 840 G8 | Jah (Icecat ID 92708302) | GTIN (1) | Jah | 3 | ✅ Pildid live'is |
| HP EliteBook 845 G8 | Ei | – | Ei | 0 | ❌ NOT_FOUND |
| HP EliteBook 850 G8 | Jah (Icecat ID 93345844) | ICECAT_ID (0.9) | Jah | 7 | ✅ Pildid live'is |
| HP ProBook 450 G8 | Jah (Icecat ID 89552415) | MPN (0.95) | Jah | 6 | ✅ Pildid live'is |
| Lenovo ThinkPad T14 Gen 2 | Jah (Icecat ID 96871343) | ICECAT_ID (0.9) | Jah | 11 | ✅ Pildid live'is |
| Lenovo ThinkPad T14 Gen 3 | Jah (Icecat ID 100004657) | GTIN (1) | Jah | 11 | ✅ Pildid live'is |
| Lenovo ThinkPad X1 Carbon Gen 9 | Jah (Icecat ID 88961147) | MPN (0.95) | Jah | 11 | ✅ Pildid live'is |

Galerii veerg näitab pilte LISAKS põhipildile (duplikaadid eemaldatud, max 12 pilti mudeli kohta).

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

- Staatus: NOT_FOUND
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
