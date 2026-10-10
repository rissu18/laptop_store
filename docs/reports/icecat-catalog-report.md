# Icecati piltide raport — kogu kataloog

Käivitatud: 2026-10-10 15:07 UTC
Käsk: `npm run icecat -- --all --rematch`
Ligipääs: Open Icecat (kasutajanimi, ilma API/content tokenita)
Pildid: allalaaditud ja töödeldud meie salvestusruumi (`LocalImageStorageAdapter` → `public/media/products/`), Icecati URL-e frontend ei kasuta.

## Kokkuvõte

- ProductModeleid kokku: **38**
- MATCHED: **34**
- NEEDS_REVIEW: **1**
- NOT_FOUND: **3**
- ERROR: **0**
- Pildiga mudeleid: **34** / 38 → image coverage **89.5%**
- Rohkem kui üks pilt: **33** → gallery coverage **86.8%**
- Ainult põhipilt: **1**
- Keskmine pilte pildiga mudeli kohta: **9.4**

Üks ProductModel = üks Icecati päring; kõik selle mudeli konfiguratsioonid (Listings) jagavad samu pilte.
"Gallery" = kuvatavad pildid lisaks põhipildile (duplikaadid ja peidetud pildid välja arvatud, max 12 pilti mudeli kohta).

| ProductModel | Listings | Match | Method | Confidence | Main image | Gallery | Status |
|---|---|---|---|---|---|---|---|
| Dell Latitude 5420 | 2 | Icecat 95037175 | MPN (MPN Dell 5420-0457) | 0.95 | Jah | 9 | MATCHED |
| Dell Latitude 5430 | 2 | Icecat 103427438 | GTIN (GTIN 0884116437888) | 1 | Jah | 11 | MATCHED |
| Dell Latitude 5440 | 1 | Icecat 117550017 | ICECAT_ID (Icecat ID 117550017) | 0.9 | Jah | 9 | MATCHED |
| Dell Latitude 5520 | 1 | Icecat 89587257 | MPN (MPN Dell XRT0Y) | 0.95 | Jah | 11 | MATCHED |
| Dell Latitude 5530 | 1 | Icecat 100690118 | ICECAT_ID (Icecat ID 100690118) | 0.9 | Jah | 8 | MATCHED |
| Dell Latitude 5550 | 1 | Icecat 122512187 | GTIN (GTIN 5397184874363) | 1 | Jah | 7 | MATCHED |
| Dell Latitude 7320 | 1 | Icecat 92625129 | MPN (MPN Dell 7320-6565) | 0.95 | Jah | 10 | MATCHED |
| Dell Latitude 7420 | 1 | Icecat 96024841 | MPN (MPN Dell 23DH1) | 0.95 | Jah | 9 | MATCHED |
| Dell Latitude 7430 | 1 | Icecat 100306785 | ICECAT_ID (Icecat ID 100306785) | 0.9 | Jah | 3 | MATCHED |
| Dell Latitude 7440 | 1 | Icecat 112130634 | MPN (MPN Dell R81KD) | 0.95 | Jah | 9 | MATCHED |
| Dell Latitude 9420 2-in-1 | 1 | Icecat 92310733 | MPN (MPN Dell 69CWR) | 0.95 | Jah | 11 | MATCHED |
| Dell Precision 5560 | 1 | Icecat 93085408 | GTIN (GTIN 5397184595695) | 1 | Jah | 11 | MATCHED |
| Dell Precision 7560 | 1 | Icecat 92839125 | MPN (MPN Dell 94PW1) | 0.95 | Jah | 9 | MATCHED |
| HP EliteBook 840 G11 | 1 | Icecat 120566115 | MPN (MPN HP 9G175ET) | 0.95 | Jah | 0 | MATCHED |
| HP EliteBook 840 G8 | 2 | Icecat 92708302 | GTIN (GTIN 0196068302726) | 1 | Jah | 3 | MATCHED |
| HP EliteBook 840 G9 | 1 | Icecat 115092761 | MPN (MPN HP 759J1UP) | 0.95 | Jah | 4 | MATCHED |
| HP EliteBook 845 G8 | 1 | – | – | – | Ei | 0 | NOT_FOUND · NOT_IN_ICECAT |
| HP EliteBook 850 G8 | 1 | Icecat 93345844 | ICECAT_ID (Icecat ID 93345844) | 0.9 | Jah | 7 | MATCHED |
| HP EliteBook 860 G10 | 1 | Icecat 109789543 | GTIN (GTIN 0197497476651) | 1 | Jah | 5 | MATCHED |
| HP EliteBook x360 1040 G8 | 1 | Icecat 88727098 | MPN (MPN HP 336F5EA) | 0.95 | Jah | 6 | MATCHED |
| HP ProBook 440 G9 | 1 | – | – | – | Ei | 0 | NOT_FOUND · NOT_IN_ICECAT |
| HP ProBook 450 G8 | 2 | Icecat 89552415 | MPN (MPN HP 3C2W7ES) | 0.95 | Jah | 6 | MATCHED |
| HP ZBook Firefly 14 G8 | 1 | Icecat 96715540 | ICECAT_ID (Icecat ID 96715540) | 0.9 | Jah | 3 | MATCHED |
| Lenovo ThinkPad L13 Yoga Gen 2 | 1 | Icecat 86531058 | ICECAT_ID (Icecat ID 86531058) | 0.9 | Jah | 11 | MATCHED |
| Lenovo ThinkPad L14 Gen 2 | 1 | Icecat 86606394 | ICECAT_ID (Icecat ID 86606394) | 0.45 | Ei | 0 | NEEDS_REVIEW · TITLE_MISMATCH |
| Lenovo ThinkPad P1 Gen 4 | 1 | Icecat 95806312 | MPN (MPN Lenovo 20Y4S2NL00) | 0.95 | Jah | 4 | MATCHED |
| Lenovo ThinkPad P14s Gen 2 | 1 | – | – | – | Ei | 0 | NOT_FOUND · NO_IDENTIFIERS |
| Lenovo ThinkPad T14 Gen 2 | 2 | Icecat 96871343 | ICECAT_ID (Icecat ID 96871343) | 0.9 | Jah | 11 | MATCHED |
| Lenovo ThinkPad T14 Gen 3 | 3 | Icecat 100004657 | GTIN (GTIN 0196801582675) | 1 | Jah | 11 | MATCHED |
| Lenovo ThinkPad T14 Gen 4 | 1 | Icecat 110803142 | MPN (MPN Lenovo 21HD0043GE) | 0.95 | Jah | 11 | MATCHED |
| Lenovo ThinkPad T14 Gen 5 | 1 | Icecat 120368593 | MPN (MPN Lenovo 21ML002QUK) | 0.95 | Jah | 11 | MATCHED |
| Lenovo ThinkPad T14s Gen 2 | 1 | Icecat 89408657 | MPN (MPN Lenovo 20WM0059US) | 0.95 | Jah | 11 | MATCHED |
| Lenovo ThinkPad T16 Gen 1 | 1 | Icecat 112657436 | MPN (MPN Lenovo 21BV00HEUS) | 0.95 | Jah | 11 | MATCHED |
| Lenovo ThinkPad T490 | 1 | Icecat 75022871 | MPN (MPN Lenovo 20N2S1V000) | 0.95 | Jah | 11 | MATCHED |
| Lenovo ThinkPad X1 Carbon Gen 11 | 1 | Icecat 118641100 | MPN (MPN Lenovo 21HM005EPG) | 0.95 | Jah | 11 | MATCHED |
| Lenovo ThinkPad X1 Carbon Gen 9 | 2 | Icecat 88961147 | MPN (MPN Lenovo 20XW004JUS) | 0.95 | Jah | 11 | MATCHED |
| Lenovo ThinkPad X1 Yoga Gen 6 | 1 | Icecat 110803753 | MPN (MPN Lenovo 20XY00H1US) | 0.95 | Jah | 11 | MATCHED |
| Lenovo ThinkPad X13 Gen 2 | 1 | Icecat 89408645 | MPN (MPN Lenovo 20WK005TUS) | 0.95 | Jah | 10 | MATCHED |

## Mudelid ilma pildita

| Mudel | Staatus | Mida teha |
|---|---|---|
| HP EliteBook 845 G8 | NOT_FOUND | Icecat ei leidnud ühegi identifikaatoriga |
| HP ProBook 440 G9 | NOT_FOUND | Icecat ei leidnud ühegi identifikaatoriga |
| Lenovo ThinkPad L14 Gen 2 | NEEDS_REVIEW | Leitud toote nimi ei vasta mudelile — kontrolli ja kinnita või lükka tagasi |
| Lenovo ThinkPad P14s Gen 2 | NOT_FOUND | Puudub GTIN, tootja kood ja Icecat ID — lisa identifikaator või käsitsi vaste |

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

### Dell Latitude 5440

- Staatus: MATCHED
- Icecati pealkiri: DELL Latitude 5440 Intel® Core™ i7 i7-1355U Laptop 35.6 cm (14") Full HD 8 GB DDR4-SDRAM 256 GB SSD Wi-Fi 6E (802.11ax) Windows 11 Pro Grey Spanish
- Päringud:
  - Icecat ID 117550017: FOUND — DELL Latitude 5440 Intel® Core™ i7 i7-1355U Laptop 35.6 cm (14") Full HD 8 GB DDR4-SDRAM 256 GB SSD Wi-Fi 6E (802.11ax) Windows 11 Pro Grey Spanish

### Dell Latitude 5520

- Staatus: MATCHED
- Icecati pealkiri: DELL Latitude 5520 Intel® Core™ i5 i5-1135G7 Laptop 39.6 cm (15.6") Full HD 8 GB DDR4-SDRAM 256 GB SSD Wi-Fi 6 (802.11ax) Windows 10 Pro Grey
- Päringud:
  - MPN Dell XRT0Y: FOUND — DELL Latitude 5520 Intel® Core™ i5 i5-1135G7 Laptop 39.6 cm (15.6") Full HD 8 GB DDR4-SDRAM 256 GB SSD Wi-Fi 6 (802.11ax) Windows 10 Pro Grey

### Dell Latitude 5530

- Staatus: MATCHED
- Icecati pealkiri: DELL Latitude 5530 Intel® Core™ i5 i5-1240P Laptop 39.6 cm (15.6") Full HD 16 GB DDR4-SDRAM 256 GB SSD Wi-Fi 6E (802.11ax) Windows 11 Pro Grey
- Päringud:
  - Icecat ID 100690118: FOUND — DELL Latitude 5530 Intel® Core™ i5 i5-1240P Laptop 39.6 cm (15.6") Full HD 16 GB DDR4-SDRAM 256 GB SSD Wi-Fi 6E (802.11ax) Windows 11 Pro Grey

### Dell Latitude 5550

- Staatus: MATCHED
- Icecati pealkiri: DELL Latitude 5550 Intel Core Ultra 5 125U Laptop 39.6 cm (15.6") Full HD 8 GB DDR5-SDRAM 512 GB SSD Wi-Fi 6E (802.11ax) Windows 11 Pro Grey UK English
- Päringud:
  - GTIN 5397184874363: FOUND — DELL Latitude 5550 Intel Core Ultra 5 125U Laptop 39.6 cm (15.6") Full HD 8 GB DDR5-SDRAM 512 GB SSD Wi-Fi 6E (802.11ax) Windows 11 Pro Grey UK English

### Dell Latitude 7320

- Staatus: MATCHED
- Icecati pealkiri: DELL Latitude 7320 Intel® Core™ i7 i7-1165G7 Laptop 33.8 cm (13.3") Full HD 16 GB LPDDR4x-SDRAM 512 GB SSD Wi-Fi 6 (802.11ax) Windows 10 Pro Black
- Päringud:
  - MPN Dell 7320-6565: FOUND — DELL Latitude 7320 Intel® Core™ i7 i7-1165G7 Laptop 33.8 cm (13.3") Full HD 16 GB LPDDR4x-SDRAM 512 GB SSD Wi-Fi 6 (802.11ax) Windows 10 Pro Black

### Dell Latitude 7420

- Staatus: MATCHED
- Icecati pealkiri: DELL Latitude 7420 Intel® Core™ i7 i7-1185G7 Laptop 35.6 cm (14") Full HD 16 GB LPDDR4x-SDRAM 512 GB SSD Wi-Fi 6 (802.11ax) Windows 10 Pro Black Swiss
- Päringud:
  - MPN Dell 23DH1: FOUND — DELL Latitude 7420 Intel® Core™ i7 i7-1185G7 Laptop 35.6 cm (14") Full HD 16 GB LPDDR4x-SDRAM 512 GB SSD Wi-Fi 6 (802.11ax) Windows 10 Pro Black Swiss

### Dell Latitude 7430

- Staatus: MATCHED
- Icecati pealkiri: DELL Latitude 7430 Intel® Core™ i5 i5-1250P Laptop 35.6 cm (14") Full HD 16 GB LPDDR5-SDRAM 256 GB SSD Wi-Fi 6E (802.11ax) Windows 11 Pro Black English
- Päringud:
  - Icecat ID 100306785: FOUND — DELL Latitude 7430 Intel® Core™ i5 i5-1250P Laptop 35.6 cm (14") Full HD 16 GB LPDDR5-SDRAM 256 GB SSD Wi-Fi 6E (802.11ax) Windows 11 Pro Black English

### Dell Latitude 7440

- Staatus: MATCHED
- Icecati pealkiri: DELL Latitude 7440 Intel® Core™ i7 i7-1355U Laptop 35.6 cm (14") Full HD+ 16 GB LPDDR5-SDRAM 512 GB SSD Wi-Fi 6E (802.11ax) Windows 11 Pro Grey
- Päringud:
  - MPN Dell R81KD: FOUND — DELL Latitude 7440 Intel® Core™ i7 i7-1355U Laptop 35.6 cm (14") Full HD+ 16 GB LPDDR5-SDRAM 512 GB SSD Wi-Fi 6E (802.11ax) Windows 11 Pro Grey

### Dell Latitude 9420 2-in-1

- Staatus: MATCHED
- Icecati pealkiri: DELL Latitude 9420 Intel® Core™ i7 i7-1185G7 Hybrid (2-in-1) 35.6 cm (14") Touchscreen Quad HD+ 16 GB LPDDR4x-SDRAM 512 GB SSD Wi-Fi 6 (802.11ax) Windows 10 Pro Grey
- Päringud:
  - MPN Dell 69CWR: FOUND — DELL Latitude 9420 Intel® Core™ i7 i7-1185G7 Hybrid (2-in-1) 35.6 cm (14") Touchscreen Quad HD+ 16 GB LPDDR4x-SDRAM 512 GB SSD Wi-Fi 6 (802.11ax) Windows 10 Pro Grey

### Dell Precision 5560

- Staatus: MATCHED
- Icecati pealkiri: DELL Precision 5560 Intel® Core™ i7 i7-11800H Mobile workstation 39.6 cm (15.6") Full HD+ 16 GB DDR4-SDRAM 512 GB SSD NVIDIA T1200 Wi-Fi 6 (802.11ax) Windows 10 Pro Grey German
- Päringud:
  - GTIN 5397184595695: FOUND — DELL Precision 5560 Intel® Core™ i7 i7-11800H Mobile workstation 39.6 cm (15.6") Full HD+ 16 GB DDR4-SDRAM 512 GB SSD NVIDIA T1200 Wi-Fi 6 (802.11ax) Windows 10 Pro Grey German

### Dell Precision 7560

- Staatus: MATCHED
- Icecati pealkiri: DELL Precision 7560 Intel® Core™ i7 i7-11850H Mobile workstation 39.6 cm (15.6") Full HD 16 GB DDR4-SDRAM 512 GB SSD NVIDIA RTX A2000 Wi-Fi 6 (802.11ax) Windows 10 Pro Grey Belgian
- Päringud:
  - MPN Dell 94PW1: FOUND — DELL Precision 7560 Intel® Core™ i7 i7-11850H Mobile workstation 39.6 cm (15.6") Full HD 16 GB DDR4-SDRAM 512 GB SSD NVIDIA RTX A2000 Wi-Fi 6 (802.11ax) Windows 10 Pro Grey Belgian

### HP EliteBook 840 G11

- Staatus: MATCHED
- Icecati pealkiri: HP EliteBook 840 G11 Intel Core Ultra 5 125U Laptop 35.6 cm (14") WUXGA 8 GB DDR5-SDRAM 256 GB SSD Wi-Fi 6E (802.11ax) Windows 11 Pro AI PC Silver
- Päringud:
  - MPN HP 9G175ET: FOUND — HP EliteBook 840 G11 Intel Core Ultra 5 125U Laptop 35.6 cm (14") WUXGA 8 GB DDR5-SDRAM 256 GB SSD Wi-Fi 6E (802.11ax) Windows 11 Pro AI PC Silver

### HP EliteBook 840 G8

- Staatus: MATCHED
- Icecati pealkiri: HP EliteBook 840 G8 Intel® Core™ i5 i5-1135G7 Laptop 35.6 cm (14") 16 GB DDR4-SDRAM 512 GB SSD Windows 10 Pro Silver
- Päringud:
  - GTIN 0196068302726: FOUND — HP EliteBook 840 G8 Intel® Core™ i5 i5-1135G7 Laptop 35.6 cm (14") 16 GB DDR4-SDRAM 512 GB SSD Windows 10 Pro Silver

### HP EliteBook 840 G9

- Staatus: MATCHED
- Icecati pealkiri: HP EliteBook 840 G9 Intel® Core™ i7 i7-1270P Laptop 35.6 cm (14") WUXGA 16 GB DDR5-SDRAM 512 GB SSD Wi-Fi 6E (802.11ax) Windows 11 Pro Silver
- Päringud:
  - MPN HP 759J1UP: FOUND — HP EliteBook 840 G9 Intel® Core™ i7 i7-1270P Laptop 35.6 cm (14") WUXGA 16 GB DDR5-SDRAM 512 GB SSD Wi-Fi 6E (802.11ax) Windows 11 Pro Silver

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

### HP EliteBook 860 G10

- Staatus: MATCHED
- Icecati pealkiri: HP EliteBook 860 16 G10 Intel® Core™ i5 i5-1335U Laptop 40.6 cm (16") WUXGA 8 GB DDR5-SDRAM 256 GB SSD Wi-Fi 6E (802.11ax) Windows 11 Pro Silver
- Päringud:
  - GTIN 0197497476651: FOUND — HP EliteBook 860 16 G10 Intel® Core™ i5 i5-1335U Laptop 40.6 cm (16") WUXGA 8 GB DDR5-SDRAM 256 GB SSD Wi-Fi 6E (802.11ax) Windows 11 Pro Silver

### HP EliteBook x360 1040 G8

- Staatus: MATCHED
- Icecati pealkiri: HP EliteBook x360 1040 G8 Intel® Core™ i7 i7-1165G7 Hybrid (2-in-1) 35.6 cm (14") Touchscreen Full HD 16 GB LPDDR4x-SDRAM 512 GB SSD Wi-Fi 6 (802.11ax) Windows 10 Pro Silver
- Päringud:
  - MPN HP 336F5EA: FOUND — HP EliteBook x360 1040 G8 Intel® Core™ i7 i7-1165G7 Hybrid (2-in-1) 35.6 cm (14") Touchscreen Full HD 16 GB LPDDR4x-SDRAM 512 GB SSD Wi-Fi 6 (802.11ax) Windows 10 Pro Silver

### HP ProBook 440 G9

- Staatus: NOT_FOUND (NOT_IN_ICECAT)
- Icecati pealkiri: –
- Päringud:
  - GTIN 0196548919093: NOT_FOUND — Products datasheet is not yet released
  - GTIN 0197192436110: NOT_FOUND — Products datasheet is not yet released
  - MPN HP 6G9B5PA: NOT_FOUND — Products datasheet is not yet released
  - MPN HP 7J026PA: NOT_FOUND — Products datasheet is not yet released
  - Icecat ID 99437210: NOT_FOUND — Products datasheet is not yet released
  - Icecat ID 106244336: NOT_FOUND — Products datasheet is not yet released

### HP ProBook 450 G8

- Staatus: MATCHED
- Icecati pealkiri: HP ProBook 450 G8 Intel® Core™ i5 i5-1135G7 Laptop 39.6 cm (15.6") 8 GB DDR4-SDRAM 512 GB SSD Windows 10 Pro Silver
- Päringud:
  - MPN HP 3C2W7ES: FOUND — HP ProBook 450 G8 Intel® Core™ i5 i5-1135G7 Laptop 39.6 cm (15.6") 8 GB DDR4-SDRAM 512 GB SSD Windows 10 Pro Silver

### HP ZBook Firefly 14 G8

- Staatus: MATCHED
- Icecati pealkiri: HP ZBook Firefly 14 G8 Intel® Core™ i7 i7-1165G7 Mobile workstation 35.6 cm (14") Touchscreen Full HD 16 GB DDR4-SDRAM 512 GB SSD NVIDIA Quadro T500 Wi-Fi 6 (802.11ax) Windows 11 Pro Grey QWERTY
- Päringud:
  - GTIN 0195908513551: NOT_FOUND — Products datasheet is not yet released
  - MPN HP 3V367UT: NOT_FOUND — Products datasheet is not yet released
  - MPN HP 3V328UT: NOT_FOUND — Products datasheet is not yet released
  - Icecat ID 89291761: NOT_FOUND — Products datasheet is not yet released
  - Icecat ID 96715540: FOUND — HP ZBook Firefly 14 G8 Intel® Core™ i7 i7-1165G7 Mobile workstation 35.6 cm (14") Touchscreen Full HD 16 GB DDR4-SDRAM 512 GB SSD NVIDIA Quadro T500 Wi-Fi 6 (802.11ax) Windows 11 Pro Grey QWERTY

### Lenovo ThinkPad L13 Yoga Gen 2

- Staatus: MATCHED
- Icecati pealkiri: Lenovo ThinkPad L13 Yoga Gen 2 (Intel) Intel® Core™ i5 i5-1135G7 Hybrid (2-in-1) 33.8 cm (13.3") Touchscreen Full HD 8 GB DDR4-SDRAM 256 GB SSD Wi-Fi 6 (802.11ax) Windows 10 Pro Black
- Päringud:
  - Icecat ID 86531058: FOUND — Lenovo ThinkPad L13 Yoga Gen 2 (Intel) Intel® Core™ i5 i5-1135G7 Hybrid (2-in-1) 33.8 cm (13.3") Touchscreen Full HD 8 GB DDR4-SDRAM 256 GB SSD Wi-Fi 6 (802.11ax) Windows 10 Pro Black

### Lenovo ThinkPad L14 Gen 2

- Staatus: NEEDS_REVIEW (TITLE_MISMATCH)
- Icecati pealkiri: Lenovo ThinkPad E14 Gen 2 (Intel) Intel® Core™ i7 i7-1165G7 Laptop 35.6 cm (14") Full HD 16 GB DDR4-SDRAM 512 GB SSD NVIDIA GeForce MX450 Wi-Fi 6 (802.11ax) Windows 10 Pro Black QWERTY Italian
- Päringud:
  - Icecat ID 86606394: TITLE_MISMATCH — Lenovo ThinkPad E14 Gen 2 (Intel) Intel® Core™ i7 i7-1165G7 Laptop 35.6 cm (14") Full HD 16 GB DDR4-SDRAM 512 GB SSD NVIDIA GeForce MX450 Wi-Fi 6 (802.11ax) Windows 10 Pro Black QWERTY Italian

### Lenovo ThinkPad P1 Gen 4

- Staatus: MATCHED
- Icecati pealkiri: Lenovo ThinkPad P1 Gen 4 Intel® Core™ i7 i7-11850H Mobile workstation 40.6 cm (16") WQXGA 16 GB DDR4-SDRAM 512 GB SSD NVIDIA T1200 Wi-Fi 6E (802.11ax) Windows 11 Pro Black QWERTY English
- Päringud:
  - MPN Lenovo 20Y4S2NL00: FOUND — Lenovo ThinkPad P1 Gen 4 Intel® Core™ i7 i7-11850H Mobile workstation 40.6 cm (16") WQXGA 16 GB DDR4-SDRAM 512 GB SSD NVIDIA T1200 Wi-Fi 6E (802.11ax) Windows 11 Pro Black QWERTY English

### Lenovo ThinkPad P14s Gen 2

- Staatus: NOT_FOUND (NO_IDENTIFIERS)
- Icecati pealkiri: –
- Päringud:
  - (ei tehtud — identifikaatorid puuduvad)

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

### Lenovo ThinkPad T14 Gen 4

- Staatus: MATCHED
- Icecati pealkiri: Lenovo ThinkPad T14 Gen 4 (Intel) Intel® Core™ i5 i5-1335U Laptop 35.6 cm (14") WUXGA 16 GB DDR5-SDRAM 512 GB SSD Wi-Fi 6E (802.11ax) Windows 11 Pro Black German
- Päringud:
  - MPN Lenovo 21HD0043GE: FOUND — Lenovo ThinkPad T14 Gen 4 (Intel) Intel® Core™ i5 i5-1335U Laptop 35.6 cm (14") WUXGA 16 GB DDR5-SDRAM 512 GB SSD Wi-Fi 6E (802.11ax) Windows 11 Pro Black German

### Lenovo ThinkPad T14 Gen 5

- Staatus: MATCHED
- Icecati pealkiri: Lenovo ThinkPad T14 Gen 5 (Intel) Intel Core Ultra 5 125U Laptop 35.6 cm (14") WUXGA 16 GB DDR5-SDRAM 512 GB SSD Wi-Fi 6E (802.11ax) Windows 11 Pro Black UK English
- Päringud:
  - MPN Lenovo 21ML002QUK: FOUND — Lenovo ThinkPad T14 Gen 5 (Intel) Intel Core Ultra 5 125U Laptop 35.6 cm (14") WUXGA 16 GB DDR5-SDRAM 512 GB SSD Wi-Fi 6E (802.11ax) Windows 11 Pro Black UK English

### Lenovo ThinkPad T14s Gen 2

- Staatus: MATCHED
- Icecati pealkiri: Lenovo ThinkPad T14s Gen 2 (Intel) Intel® Core™ i7 i7-1165G7 Laptop 35.6 cm (14") Full HD 16 GB LPDDR4x-SDRAM 512 GB SSD Wi-Fi 6E (802.11ax) Windows 10 Pro Black English
- Päringud:
  - MPN Lenovo 20WM0059US: FOUND — Lenovo ThinkPad T14s Gen 2 (Intel) Intel® Core™ i7 i7-1165G7 Laptop 35.6 cm (14") Full HD 16 GB LPDDR4x-SDRAM 512 GB SSD Wi-Fi 6E (802.11ax) Windows 10 Pro Black English

### Lenovo ThinkPad T16 Gen 1

- Staatus: MATCHED
- Icecati pealkiri: Lenovo ThinkPad T16 Gen 1 (Intel) Intel® Core™ i7 i7-1270P Laptop 40.6 cm (16") Touchscreen WUXGA 16 GB DDR4-SDRAM 512 GB SSD Wi-Fi 6E (802.11ax) Windows 11 Pro Black
- Päringud:
  - MPN Lenovo 21BV00HEUS: FOUND — Lenovo ThinkPad T16 Gen 1 (Intel) Intel® Core™ i7 i7-1270P Laptop 40.6 cm (16") Touchscreen WUXGA 16 GB DDR4-SDRAM 512 GB SSD Wi-Fi 6E (802.11ax) Windows 11 Pro Black

### Lenovo ThinkPad T490

- Staatus: MATCHED
- Icecati pealkiri: Lenovo ThinkPad T490 Intel® Core™ i7 i7-8565U Laptop 35.6 cm (14") 32 GB DDR4-SDRAM 1 TB SSD Wi-Fi 5 (802.11ac) Windows 10 Pro Black
- Päringud:
  - MPN Lenovo 20N2S1V000: FOUND — Lenovo ThinkPad T490 Intel® Core™ i7 i7-8565U Laptop 35.6 cm (14") 32 GB DDR4-SDRAM 1 TB SSD Wi-Fi 5 (802.11ac) Windows 10 Pro Black

### Lenovo ThinkPad X1 Carbon Gen 11

- Staatus: MATCHED
- Icecati pealkiri: Lenovo ThinkPad X1 Carbon Gen 11 Intel® Core™ i7 i7-1365U Laptop 35.6 cm (14") 2.8K 32 GB LPDDR5-SDRAM 1 TB SSD Wi-Fi 6E (802.11ax) Windows 11 Pro Black Portuguese
- Päringud:
  - MPN Lenovo 21HM005EPG: FOUND — Lenovo ThinkPad X1 Carbon Gen 11 Intel® Core™ i7 i7-1365U Laptop 35.6 cm (14") 2.8K 32 GB LPDDR5-SDRAM 1 TB SSD Wi-Fi 6E (802.11ax) Windows 11 Pro Black Portuguese

### Lenovo ThinkPad X1 Carbon Gen 9

- Staatus: MATCHED
- Icecati pealkiri: Lenovo ThinkPad X1 Carbon Gen 9 Intel® Core™ i5 i5-1135G7 Laptop 35.6 cm (14") WUXGA 16 GB LPDDR4x-SDRAM 512 GB SSD Wi-Fi 6 (802.11ax) Windows 10 Pro Black QWERTY English
- Päringud:
  - MPN Lenovo 20XW004JUS: FOUND — Lenovo ThinkPad X1 Carbon Gen 9 Intel® Core™ i5 i5-1135G7 Laptop 35.6 cm (14") WUXGA 16 GB LPDDR4x-SDRAM 512 GB SSD Wi-Fi 6 (802.11ax) Windows 10 Pro Black QWERTY English

### Lenovo ThinkPad X1 Yoga Gen 6

- Staatus: MATCHED
- Icecati pealkiri: Lenovo ThinkPad X1 Yoga Gen 6 Intel® Core™ i5 i5-1135G7 Hybrid (2-in-1) 35.6 cm (14") Touchscreen WUXGA 8 GB LPDDR4x-SDRAM 512 GB SSD Wi-Fi 6 (802.11ax) Windows 11 Pro Grey QWERTY English
- Päringud:
  - MPN Lenovo 20XY00H1US: FOUND — Lenovo ThinkPad X1 Yoga Gen 6 Intel® Core™ i5 i5-1135G7 Hybrid (2-in-1) 35.6 cm (14") Touchscreen WUXGA 8 GB LPDDR4x-SDRAM 512 GB SSD Wi-Fi 6 (802.11ax) Windows 11 Pro Grey QWERTY English

### Lenovo ThinkPad X13 Gen 2

- Staatus: MATCHED
- Icecati pealkiri: Lenovo ThinkPad X13 Gen 2 (Intel) Intel® Core™ i5 i5-1145G7 Laptop 33.8 cm (13.3") Touchscreen WUXGA 16 GB LPDDR4x-SDRAM 512 GB SSD Wi-Fi 6E (802.11ax) Windows 10 Pro Grey QWERTY English
- Päringud:
  - MPN Lenovo 20WK005TUS: FOUND — Lenovo ThinkPad X13 Gen 2 (Intel) Intel® Core™ i5 i5-1145G7 Laptop 33.8 cm (13.3") Touchscreen WUXGA 16 GB LPDDR4x-SDRAM 512 GB SSD Wi-Fi 6E (802.11ax) Windows 10 Pro Grey QWERTY English
