# Kassa ja tellimused

Selles faasis on poes terviklik ostuvoog **ilma päris makseteenuseta**:

```
OSTUKORV → KASSA (/kassa) → serveripoolne kontroll → TELLIMUS PostgreSQL-is → KINNITUSLEHT
                                                    → ADMINI TELLIMUSED (/admin/orders)
                                                    → TELLIMUSE OTSING (/tellimus)
```

Makse jäi teadlikult tegemata. Prototüübis tekivad ainult **testtellimused**.

> Seotud: [DISCOUNTS.md](DISCOUNTS.md), [DATABASE.md](DATABASE.md), [ADMIN.md](ADMIN.md), [ARCHITECTURE.md](ARCHITECTURE.md).

## 1. Testtellimused vs päris tellimused

| | Testtellimus (`is_test = true`) | Päris tellimus (makse faasis) |
| --- | --- | --- |
| Millal | Prototüübirežiim sees (admin → Seaded → Pood) | Prototüüp väljas **ja** makseteenus seadistatud |
| Makse | Ei võeta (`payment_status = NOT_STARTED`) | Makseteenus |
| Tarnijale | Ei saadeta | Tarnija tellimus (tarnija faasis) |
| Laoseis | Ei vähene | Reserveeritakse / vähendatakse |
| Sooduskoodi kasutus | **Ei kulu** (kasutust ei looda) | `reserveRedemption` → `confirmRedemption` |
| E-kiri | Ei saadeta | Tellimuse kinnitus |
| Admin | **TEST** märk, filter „Testtellimused“, töölaual eraldi | Päris müük |

**Fail-safe** (`src/domain/checkout/checkout-mode.ts`):

```
prototüüp sees                          → TEST     (ainult testtellimused)
prototüüp väljas + makseteenus olemas   → LIVE     (päris tellimused — makse faasis)
prototüüp väljas + makseteenust pole    → BLOCKED  (kassa suletud: "Tellimuste vastuvõtmine avaneb peagi…")
```

`getConfiguredPaymentProvider()` tagastab praegu `null`. Kui prototüübirežiim kogemata välja lülitada, ei hakka pood päris tellimusi vastu võtma, sest kassa sulgub. Ka `LIVE` režiim lükatakse selles faasis tagasi, sest päris tellimuse voogu (makse) veel pole.

Kliendile on see kassas selgelt öeldud: „See on prototüübi testtellimus. Makseid ei võeta vastu ja tellimust päriselt ei täideta.“ Lõpunupp on **„Esita testtellimus“** (mitte „Maksa“). Makse osas on kirjas: „Testtellimuse eest makset ei võeta. Makseviis lisatakse enne poe avamist.“ Võltsitud makseviise (testkaart, testpangalink) kassas ei ole.

## 2. Kassa voog

1. Ostukorvist **„Vormista tellimus“** → `/kassa`. Kassal on minimaalne päis: logo ja „Tagasi ostukorvi“, põhimenüüd ja otsingut pole.
2. Brauser küsib serverilt **kokkuvõtte** (`getCheckoutQuoteAction`). Sisend on ainult pakkumise ID, kogus ja sooduskoodi tekst.
3. Klient täidab vormi: kontakt, tarne, ettevõte (valikuline), märkus.
4. **„Esita testtellimus“** → `placeOrderAction`, mis teeb järgmised sammud:
   - päritolu kontroll (CSRF);
   - vormi valideerimine (zod, sama skeem mis brauseris);
   - **idempotentsus**: sama `checkoutAttemptId` → sama tellimus;
   - kõik summad arvutatakse serveris uuesti;
   - kui midagi muutus võrreldes kliendi nähtuga → **ülevaatus**, tellimust ei looda;
   - üks andmebaasi tehing: tellimus + read + sooduskoodi snapshot + ajalugu;
   - juurdepääsutoken httpOnly küpsisesse → kinnitusleht.
5. Brauser **tühjendab ostukorvi alles pärast serveri kinnitust** (`handlePlaceOrderResult`). Vea korral jääb ostukorv alles.

### Vorm (`src/domain/checkout/checkout-form.ts`)

| Osa | Väljad |
| --- | --- |
| Kontakt | Eesnimi*, Perekonnanimi*, E-post*, Telefon* |
| Tarne | Aadress*, täpsustus, Linn*, Postiindeks*, Riik (praegu Eesti) |
| Ettevõte | „Ostan ettevõttele“ → nimi*, registrikood* (EE: 8 numbrit), KMKR (valikuline) |
| Märkus | Tellimuse märkus (valikuline) |

- Eesti postiindeks on 5 numbrit. Riikide reeglid on tabelis, nii et uue riigi lisamine tähendab ühe rea lisamist.
- Ettevõtte välju kontrollitakse ja salvestatakse **ainult** ettevõtte ostul.
- **Ei küsita** isikukoodi, sünniaega ega muud ebavajalikku. Skeem jätab tundmatud väljad kõrvale (testitud).

## 3. Serveripoolne arvutus (miks kliendi hinda ei usaldata)

Brauseris olevaid andmeid saab muuta: arendaja tööriistadega võib igaüks saata `price: 1`. Seepärast ei võta server brauserist **ühtegi summat** ega hinda.

`computeCheckout()` (`src/server/checkout/checkout-service.ts`):

1. Loeb pakkumised **otse PostgreSQL-ist**, mitte poe vahemälust, ja kasutab samu efektiivseid väärtusi mis pood (`mapCatalogRows`).
2. Kontrollib, et mudel ja pakkumine on `ACTIVE`, laos ja täielike andmetega. Kui ei ole: „Toode ei ole enam saadaval.“
3. Kasutab **hetkehinda**.
4. Kontrollib **laoseisu**. Kui kogus on suurem kui laos: „Valitud kogus ei ole enam saadaval.“
5. Arvutab vahesumma.
6. Valideerib sooduskoodi **uuesti** (§5).
7. Arvutab soodustuse ja jaotab selle ridadele.
8. Arvutab tarne seadetest (§7).
9. Kokku = vahesumma − soodustus + tarne. Andmebaasi CHECK kontrollib sama valemit.

### Hinnamuutus ja ülevaatus

Klient saadab koos tellimusega hinnad ja summa, **mida ta nägi**. Neid kasutatakse **ainult võrdluseks**, arvutuseks mitte. Kui server arvutab midagi muud, siis tellimust ei looda. Kliendile näidatakse põhjust (vana ja uus hind, kadunud toode, kehtetuks muutunud kood) ning uuendatud kokkuvõtet, mille ta peab kinnitama:

```
Ühe toote hind on pärast ostukorvi lisamist muutunud.
Lenovo ThinkPad T14 Gen 3     539 €  →  559 €
[ Kinnitan uue summa — esita testtellimus ]
```

Nii ei teki kunagi tellimust summaga, mida klient ei näinud, ega tellimust vana hinnaga, mida pood enam ei paku.

## 4. Laoseis

- Enne tellimuse loomist kontrollitakse andmebaasi laoseisu. Kui kogus ületab laoseisu, tellimust ei looda.
- **Testtellimus laoseisu ei vähenda** ega reserveeri.
- **Päris tellimuse hook** (tarnija faasis): makse alguses reserveeritakse laoseis, makse kinnitamisel saadetakse tarnijale tellimus ja ebaõnnestunud makse vabastab reserveeringu. Viimane ühik võib makse ajal tarnijalt kaduda (PROJECT_PLAN.md R5), seega kontrollitakse laoseisu enne makset tarnijalt uuesti.

## 5. Sooduskood kassas

- Kasutatakse **sama** `evaluateDiscount()` mis ostukorvis ja admini eelvaates. Uut soodustuse loogikat kassa jaoks ei kirjutatud.
- Kood valideeritakse kassas **uuesti**, sest ostukorvis nähtud tulemus võis vahepeal aeguda. Kontrollitakse olekut, algust ja lõppu, miinimumsummat, tooteid, välistusi, maksimumi, marginaali ja kasutuspiirangut.
- Kui kood muutus kehtetuks (aegus, admin lülitas välja): ülevaatus koos põhjusega ja nupuga „Eemalda sooduskood“. Tellimust ei looda, enne kui klient näeb uut summat.
- Tellimusele salvestatakse **snapshot**: `discount_code`, `discount_type`, `discount_value`, rakendatud summa ja täielik `discount_snapshot` (koos ridade jaotusega). Ridadel on `discount_amount_cents`.

### DiscountRedemption ja testtellimus

**Testtellimus ei loo kasutust (`discount_redemptions`)**. Päris kampaania kasutuspiirang ei kulu ja püsivat reserveeringut, mis blokeeriks päris klienti, ei jää. Testitud: koodiga `usage_limit = 1` saab teha mitu testtellimust ja `usage_count` jääb 0-ks.

Päris tellimuse (makse faasis) jaoks on kood olemas: samas tehingus `reserveRedemption()` (rea lukk, PENDING), makse kinnitusel `confirmRedemption()` ja tühistamisel `cancelRedemption()` (admini tühistamine vabastab ootel reserveeringu juba praegu).

## 6. Idempotentsus (topeltesitus)

**Probleem:** klient vajutab nuppu kaks korda, võrk katkeb ja brauser kordab päringut, või vastus ei jõua kohale ja klient proovib uuesti. Ilma kaitseta tekiks kaks tellimust.

**Lahendus kahes kihis:**

1. **Brauser:** nupp lukustub („Tellimust luuakse...“) ja korduvat klikki ignoreeritakse.
2. **Server (päris kaitse):** brauser genereerib iga kassakatse jaoks juhusliku `checkoutAttemptId` (UUID, `sessionStorage`-is, sama ka lehe värskendusel). Andmebaasis on `SHA-256(checkoutAttemptId)` **UNIQUE**.
   - Sama võti uuesti → tagastatakse **olemasolev** tellimus (`EXISTING`), uut ei looda.
   - Kaks **samaaegset** päringut → üks sisestab, teine saab UNIQUE-vea ja tagastab sama tellimuse (testitud `Promise.all`-iga).
   - Kordusel luuakse uus juurdepääsutoken, sest eelmine vastus võis kaotsi minna. Kes võtit teab, on sama brauser.

## 7. Tarne

`ShippingMethod` (`src/domain/shipping/shipping.ts`): praegu üks meetod **STANDARD**, mille nimi ja hind tulevad seadetest (admin → Seaded → Tarne, vaikimisi „Standardtarne“ 6,99 €).

- Tasuta tarne kehtib ainult siis, kui seadetes on **tasuta tarne piir** ja toodete summa pärast soodustust ületab selle, või kui sooduskood on **tasuta tarne** tüüpi. Kõvakodeeritud tasuta tarnet pole.
- Pakiautomaadi valikut ei näidata, sest API puudub (`requiresPickupPoint` on tuleviku jaoks). Omniva, DPD ja SmartPOST lisanduvad sama liidese taha.

## 8. Andmebaas

Migratsioon `0002_orders.sql` on **lisav**: olemasolevaid tabeleid ei muudetud, lisati ainult välisvõti `discount_redemptions.order_id → orders` tühjale tabelile. Enne ja pärast migratsiooni kontrolliti `npm run db:counts` abil: 38 mudelit, 46 konfiguratsiooni, 320 pilti, admin ja seaded on samad.

| Tabel | Sisu |
| --- | --- |
| `orders` | Number (UNIQUE), `is_test`, olekud, kliendi ja tarne snapshot, summad sentides (CHECK: `total = subtotal − discount + shipping`), sooduskoodi snapshot, märkus, `idempotency_key_hash` (UNIQUE), `public_access_token_hash`, `cancelled_at` |
| `order_items` | **Snapshot**: SKU, tootja, mudel, nimi, CPU, põlvkond, RAM, SSD, GPU, ekraan, klaviatuur, seisukord, kogus, ühikuhind, rea summa, soodustus, rea kokku, pilt; valikulised viited mudelile ja pakkumisele (`SET NULL`) |
| `order_status_history` | `kind` (ORDER/PAYMENT), `from_status` → `to_status`, `source` (CHECKOUT/ADMIN/SYSTEM/PAYMENT), admin, märkus, aeg |
| `order_internal_notes` | Admini märkmed (ainult lisamine) |
| `order_lookup_attempts` | Avaliku otsingu katsed (piirang) |

Aadress ja sooduskood on otse `orders` tabelis: tellimusel on üks tarneaadress ja üks kood, nii et eraldi tabel oleks ülearune keerukus.

### Miks OrderItem on snapshot

Kui tellimuse rida viitaks ainult `supplier_listings` reale, muutuks vana tellimus koos kataloogiga. Admin parandab homme RAM-i, hinda või seisukorda, toode arhiveeritakse või tarnija sync uuendab andmeid. Arve ja klienditugi peavad aga nägema seda, mida klient **ostis**. Seepärast kopeeritakse ostu hetkel kõik kuvatavad väljad tellimuse reale. Viited mudelile ja pakkumisele jäävad ainult navigeerimiseks ja muutuvad toote kustutamisel `NULL`-iks. Testitud: pärast hinna, RAM-i, seisukorra ja mudeli nime muutmist on tellimuse rida bait-baidilt sama.

### Tellimuse number

`SL-26-A7K4P9`: eesliide, aasta ja 6 juhuslikku märki ilma segiaetavateta (0/O, 1/I/L). Number on UNIQUE ja kokkupõrkel genereeritakse uus. Andmebaasi ID-d ega järjekorranumbrit (1, 2, 3) avalikult ei kasutata: järjekorranumber reedaks tellimuste arvu ja oleks lihtne ära arvata.

## 9. Olekumasin

```
CREATED ──► AWAITING_PAYMENT ──► PAID ──► PROCESSING ──► SHIPPED ──► COMPLETED
   │                │              │           │                          │
   └────────────────┴──► CANCELLED ◄───────────┘                          └──► REFUNDED
                                   PAID ──► REFUNDED
```

- Selles faasis kasutatakse **CREATED** ja **CANCELLED**.
- `canTransition(from, to, source)`: admin saab ainult **tühistada**. **PAID** tuleb ainult allikast `PAYMENT` (makseteenuse kinnitus), admin ei saa makset simuleerida.
- Makse olek on eraldi: `NOT_STARTED` / `PENDING` / `PAID` / `FAILED` / `REFUNDED`. Testtellimus on alati `NOT_STARTED`.
- Iga muutus kirjutatakse `order_status_history`-sse. Alguses on `null → CREATED` (CHECKOUT) ja `null → NOT_STARTED` (makse).

## 10. Kinnitusleht ja juurdepääs

`/tellimus/[number]/kinnitus` loeb tellimuse **serverist**, nii et leht töötab ka pärast värskendamist. Juurdepääs on aga piiratud:

- Tellimuse loomisel genereeritakse juhuslik 256-bitine **juurdepääsutoken**. Andmebaasi läheb ainult selle SHA-256 räsi.
- Token salvestatakse küpsisesse `order_access_<NUMBER>` (httpOnly, Secure, SameSite=Lax, path=/tellimus, 30 päeva). Tokenit URL-is pole.
- Ilma õige tokenita (teine brauser või numbrit muudetud URL-is) kuvatakse ainult „Tellimust ei saa siin näidata“ ja viide tellimuse otsingule. Tellimusi ei saa numbreid läbi proovides vaadata (testitud).

## 11. Avalik tellimuse otsing

`/tellimus`: **tellimuse number + e-post** peavad mõlemad klappima (e-post on tõstutundetu).

- Kui ei klapi, on vastus alati sama: „Tellimust ei leitud või sisestatud andmed ei klapi.“ Ei öelda kunagi „tellimus on olemas, aga e-post on vale“, sest see lekiks tellimuse olemasolu.
- **Piirang:** 10 ebaõnnestunud katset 15 minuti jooksul IP kohta. Seejärel „Liiga palju katseid…“ ka õigete andmetega (testitud).
- Otsing toimub serveris ja brauserisse ei saadeta ühtegi tabelit.
- Kliendile näidatakse: number, kuupäev, olek, makse olek, tooted (snapshot), summad, sooduskood, tarneviis ja TEST-märk.
- **Ei näidata:** aadressi ega telefoni (need on ainult kinnituslehel tokeniga), admini märkmeid, ostuhindu, marginaali, auditit, sisemisi vigu ega andmebaasi ID-sid. Avaliku vaate väljad on testis fikseeritud.

## 12. Admin

- **`/admin/orders`**: tellimuse number, kuupäev, klient, e-post, toodete arv, vahesumma, soodustus, kokku, olek, makse ja test/päris. Otsing numbri, e-posti ja nime järgi. Filtrid: olek, makse, test/päris, kuupäevavahemik (Eesti aeg), sooduskood jah/ei. Järjestus: uusimad, vanimad, summa järgi. Mobiilis kaardid.
- **TEST märk** on kollane ja testtellimusel ei kasutata rohelisi „Makstud/Täidetud“ märke. Kui kõik tellimused on testtellimused, öeldakse see eraldi.
- **`/admin/orders/[id]`**: tooted (snapshot), summad, klient, ettevõte, kliendi märkus, tarne, sooduskood (tellimuse hetke väärtus), ajalugu ja sisemärkmed.
- **Tühistamine:** kinnitusdialoog „Kas oled kindel?“ valikulise sisemise põhjusega. Muutub olek ja `cancelled_at`, lisandub ajaloo kirje ja audit, ootel sooduskoodi reserveering vabastatakse. Testtellimusel laoseisu taastada pole vaja.
- **Sisemärkmed:** ainult lisamine (muutmist ega kustutamist pole), koos admini ja ajaga. Kliendi otsingus neid ei näidata. **Auditisse märkuse teksti ei kopeerita**, sest see võib sisaldada isikuandmeid; salvestatakse ainult fakt ja pikkus.
- **Töölaud:** „Testtellimusi täna“, „Testtellimusi kokku“ ja „Päris tellimusi“. Käivet, müüki ega konversiooni ei näidata.

## 13. Vead

| Olukord | Kliendile |
| --- | --- |
| Toode pole enam saadaval / laos pole piisavalt | Ülevaatus, „Muuda ostukorvi“ |
| Hind muutus | Vana → uus hind, kinnitus |
| Sooduskood aegus / kehtetu | Põhjus, „Eemalda sooduskood“ |
| Valideerimisviga | Väljapõhised eestikeelsed teated |
| Topeltesitus | Sama tellimus (märkamatult) |
| Andmebaasi viga | „Tellimuse loomisel tekkis viga. Proovi uuesti.“ + **veakood** (nt `A1B2C3D4`) |

Stack trace'i, SQL-viga ega sisemisi ID-sid kliendile ei näidata. Viga logitakse `system_logs`-i sama veakoodiga, nii et admin leiab selle menüüst Süsteem → Logid.

## 14. Isikuandmed (GDPR)

| Andmed | Miks | Kus |
| --- | --- | --- |
| Nimi, e-post, telefon | Tellimuse täitmine, kliendiga suhtlus, tellimuse otsing | `orders` (Neon PostgreSQL; serveri regioon tuleb enne avamist privaatsuspoliitikas täpsustada) |
| Tarneaadress | Kättetoimetamine | `orders` |
| Ettevõtte nimi, registrikood, KMKR | Arve ettevõttele (ainult ettevõtte ostul) | `orders` |
| Tellimuse märkus | Kliendi soov | `orders` |
| IP-aadress | Otsingu piirang (24 h, siis kustutatakse) | `order_lookup_attempts` |

- **Ei koguta:** isikukoodi, sünniaega ega kliendikontot.
- Prototüübis on kassas hoiatus: „Ära sisesta testimiseks päris tundlikke andmeid.“
- Logidesse ega auditisse kliendi tellimust ja märkmete teksti ei kopeerita. Teavituste teenus (`NoopOrderNotificationService`) ei logi isikuandmeid.
- **Enne poe avamist** on vaja: lõplikku privaatsuspoliitika teksti (vastutav töötleja, säilitusajad, õigused), testtellimuste kustutamist ja otsust andmete säilitusaja kohta (raamatupidamine vs minimaalne säilitamine).

## 15. Tulevik

- **Makse faas:** `PaymentProvider` (Montonio, Maksekeskus või Stripe) annab `CREATED → AWAITING_PAYMENT`, siis webhook → kontroll pakkuja API-st → `PAID` (allikas `PAYMENT`). Lisanduvad `confirmRedemption` ja tellimuse kinnituse e-kiri. Päris tellimused avanevad alles siis (`LIVE` režiim).
- **Tarnija faas:** laoseisu reserveerimine (Tech: seadme/seerianumbri reserveerimine makse kinnitusega samas tehingus, vt §17), Foxway tellimus idempotentsusvõtmega (= tellimuse number), tracking.
- **Teavitused:** `OrderNotificationService` (kinnitus, makse, saatmine, tühistamine). Praegu Noop.
- **Kliendikontod:** `orders` sisaldab kliendi snapshot'i. Hiljem saab tellimuse siduda kliendiga e-posti järgi.

## 16. Arenduse käigus tekkinud probleemid ja lahendused

- **Miks kliendi saadetud hinda ei tohi usaldada:** testis saadeti `priceCents: 1` ja `totalCents: 1`. Server ignoreeris neid ja tellimus loodi andmebaasi hinnaga.
- **Miks idempotentsus on vajalik:** käsitsi testis esitati sama vorm kolm korda kiiresti järjest (kaks klikki + `requestSubmit`) ja tekkis üks tellimus. Ilma serveri UNIQUE-võtmeta oleks samaaegsed päringud loonud mitu tellimust.
- **Miks sooduskood valideeritakse kassas uuesti:** käsitsi testis lülitati kood välja ajal, mil kassa oli avatud. Kassa näitas veel −25 €, aga server keeldus ja näitas uut summat.
- **Miks testtellimused ja päris tellimused on eraldi:** testtellimused ei tohi kulutada päris kampaania piiranguid, moonutada müügistatistikat ega jõuda tarnijani. `is_test` lipp ja eraldi filter teevad nende hilisema eraldamise või kustutamise lihtsaks.
- **Drizzle'i alampäring andis vale tulemuse:** admini nimekirjas oli toodete arv alati 0. Ilma join'ita kirjutab Drizzle välise tabeli veeru alampäringus ilma tabeli nimeta (`"id"`) ja Postgres seob selle alampäringu tabeli `order_items.id`-ga. Lahendus: täielikult kvalifitseeritud viide (`"orders"."id"`) ja regressioonitest.
- **Admini leht ei uuenenud pärast tühistamist:** tellimuse toimingud ei tühjenda ühtegi vahemälu silti. Lahendus: Next.js 16 `refresh()` server action'is.
- **React lähtestab vormi pärast server action'it:** tellimuse otsingu väljad tühjenesid ka vale vastuse järel. Lahendus: sisestatud väärtused tulevad vastusega tagasi ja on vormi vaikeväärtused.
- **Välisvõti muutis vana testi kehtetuks:** sooduskoodi kasutuse test kasutas väljamõeldud `order_id`-d, mida uus välisvõti enam ei luba. Lahendus: test loob päris tellimused, mis on ühtlasi parem test.

## 17. Tarnija seadmed ja seerianumbrid (Tech)

Tech müüb konkreetseid füüsilisi seadmeid (Tech ID + seerianumber, vt [TECH_SYNC.md](TECH_SYNC.md)). Klient ostab konfiguratsiooni (pakkumise) ega näe seerianumbrit; admin peab teadma, milline seade tellimusele läheb.

- Tabel **`order_item_units`** (`order_item_id` → `order_items`, `inventory_unit_id` → `supplier_inventory_units`, admin, aeg). Unikaalne paar (rida, seade).
- **Admin → tellimus → "Seerianumbrid":** iga Tech rea juures määratud seadmed (seerianumber + Tech ID) ja valik sama konfiguratsiooni müügis seadmetest. Kogus 1 → 1 seade, kogus 3 → 3 eri seadet. Eemaldamine võimalik. Mõlemad lähevad tegevuslogisse (ainult Tech ID, mitte seerianumber).
- Kontrollid (`src/server/orders/order-units.ts`, tehingus, `FOR UPDATE`): rida kuulub tellimusele; tellimus pole tühistatud; seade kuulub sama pakkumise alla; seade on müügis; seade pole juba sellel real; määratud seadmeid ≤ kogus; seade pole mõne teise tühistamata **päris** tellimuse küljes (testtellimused ei broneeri).
- **Testtellimus ei kuluta laoseisu:** määramine on ainult märge — seadet ei reserveerita, `available` ei muutu, pakkumise laoseis ei vähene ja Techi hinnakirja ei muudeta.
- `order_items` jääb muutumatuks snapshot'iks (mudel, CPU, RAM, salvestus, seisukord, hind, soodustus). Seerianumber on eraldi admini seos.
- **Klient ei näe seerianumbrit:** kinnitusleht ja tellimuse otsing (`public-order.ts`) seda tabelit ei loe (test kontrollib).
- **TODO (makse/LIVE faas):** makse kinnitamisel tuleb seade reserveerida/kulutada samas tehingus tellimuse ja makse kinnitusega, käsitleda olukorda, kus Tech müüs seadme vahepeal mujal, ning vajadusel määrata seade automaatselt.
