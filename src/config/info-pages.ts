import { COMPANY, COMPANY_ADDRESS_LINE } from "./company";

/**
 * Infolehtede sisu (/info/[slug]).
 *
 * Juriidilised ja kliendiinfo lehed (E-poe tingimused, Garantii, Tarne, Tagastamine, Isikuandmed,
 * Kontakt) põhinevad Laptopid.ee praegusel live-sisul (kontrollitud 2026-10-11), sest müüja on sama
 * ettevõte (Sülearvutid OÜ):
 *   - E-poe tingimused:  laptopid.ee/index.php/page/15 ("E-Poe tingimused", lingitud Kontakt-lehelt)
 *   - Garantii:          laptopid.ee/page/37/garantii
 *   - Kontakt + jalus:   laptopid.ee/page/1/kontakt, avalehe jalus
 * Kohandatud on ainult poe nimi (Laptopid.ee → Sülearvutid.ee), e-post (→ info@sylearvutid.ee) ja
 * viited Sülearvutid.ee lehtedele. Laptopid.ee-spetsiifilised väited (nt kaubamärk, Laptopid.ee kleeps)
 * on välja jäetud või neutraalselt sõnastatud. Uusi õigusi, tähtaegu ega tasusid ei lisata.
 *
 * Laptopid.ee lehtedel 44–46 (Õiguslik teatis, Privaatsuspoliitika, Küpsised) on teise ettevõtte
 * (Laptopas SLU, Hispaania) mallid, mida live-lehelt ei lingita — neid EI kasutata.
 *
 * Lõigus olev https://… aadress ja e-post muutuvad lehel automaatselt lingiks; sisemine link: [tekst](/info/…).
 */

export interface InfoLink {
  label: string;
  href: string;
}

export interface InfoSection {
  heading?: string;
  paragraphs?: string[];
  links?: InfoLink[];
}

export interface InfoPage {
  slug: string;
  title: string;
  sections: InfoSection[];
  /** Kas sisu on lõplik (false → arenduse märkus lehel) */
  confirmed: boolean;
  /** Prototüübirežiimis kuvatav aus märkus (nt maksed pole veel avatud) */
  prototypeNote?: string;
}

const TERMS_HREF = "/info/muugitingimused";
const EMAIL = COMPANY.email;

const PROTOTYPE_ORDERS_NOTE =
  "Sülearvutid.ee on praegu prototüübirežiimis: tellimused on testtellimused, makseid ei võeta ja tellimusi ei täideta. Allolevad tingimused kehtivad päris e-poe avamisel — tingimustes nimetatud makseviisid (pangalink, ettemaksuarve, järelmaks, kaardimakse) lisanduvad poe avamisel.";

export const INFO_PAGES: InfoPage[] = [
  {
    slug: "kontakt",
    title: "Kontakt",
    confirmed: true,
    sections: [
      {
        paragraphs: [`${COMPANY.legalName}`, `Registrikood ${COMPANY.registryCode}`],
      },
      {
        heading: "Võta ühendust",
        links: [
          { label: `Telefon ${COMPANY.phone.label}`, href: COMPANY.phone.href },
          { label: `Mobiil ${COMPANY.mobile.label}`, href: COMPANY.mobile.href },
          { label: `E-post ${EMAIL}`, href: `mailto:${EMAIL}` },
        ],
      },
      {
        heading: "Aadress",
        paragraphs: [`${COMPANY_ADDRESS_LINE}, ${COMPANY.address.country}`, COMPANY.entrance, COMPANY.parking],
        links: [{ label: "Ava kaardil (Google Maps)", href: COMPANY.mapsUrl }],
      },
      {
        heading: "Lahtiolekuajad",
        paragraphs: [...COMPANY.openingHours],
      },
    ],
  },
  {
    slug: "garantii",
    title: "Garantii",
    confirmed: true,
    sections: [
      {
        paragraphs: [
          "Üldised garantii- ja müügitingimused leiad E-poe tingimustest.",
          "Enamus meil müüdavatest sülearvutitest on ülemaailmse tehasegarantiiga, mis tähendab, et sülearvuti garantii teostab tootja-firma esindus, kus remondiaeg on üldiselt 1–2 päeva. Levinumad mudelid tehakse ootetööna meie salongis korda.",
          "Tehasegarantii kehtib seerianumbri alusel ja seda üle kogu maailma, seega näiteks reisil olles suundute lähimasse Delli esindusse sülearvutiga ja see tehakse seal kiiresti korda.",
          "Täpsem garantii pikkus on märgitud tooteinfo lehel.",
        ],
        links: [{ label: "E-poe tingimused", href: TERMS_HREF }],
      },
      {
        heading: "Aku",
        paragraphs: ["Akude garantii on 6 kuud, kuna aku on kulumaterjal."],
      },
      {
        heading: "Mida garantii ei kata",
        paragraphs: [
          "Garantii ei laiene tarkvarale (nt Windowsi, BIOS-e jms uuendustest tekkinud probleemid) ning füüsilistele vigastustele (näiteks füüsiliselt vigastatud laadimise pesad, katki murtud USB-pesad, maha kukkumised jne).",
          "Vedelikukahjustuse defekteerimise tasu on 50 €, see tuleb tasuda siis, kui remondi käigus selgub, et vigastus on tekkinud vedeliku tõttu ja klient on seda meie eest varjanud.",
        ],
      },
      {
        heading: "Hooldus",
        paragraphs: [
          "Sülearvuti vajab nagu autogi hooldust ja seda tolmust puhastamise näol. Vead, mis on põhjustatud üleliigsest tolmust, ei pruugi garantii alla minna. Soovituslik on aastas 1 kord arvuti ära puhastada.",
        ],
      },
      {
        heading: "Garantii teostamine",
        paragraphs: [
          "Soovi korral saame garantii teostamise ajal pakkuda kliendile tasuta asendusarvutit, et töö pooleli ei jääks.",
          `Kasutatud sülearvutite garantii teostajaks on ${COMPANY.legalName}, ${COMPANY_ADDRESS_LINE}. Garantiijuhtumist teata meile: ${EMAIL}, telefon ${COMPANY.phone.label}.`,
          "Garantii teostamiseks on vajalik ostuarve.",
          "Garantiiremonti teostavad allpool loetletud ettevõtted — kindlasti tasub enne nende poole pöördumist teatada garantiijuhtumist ka meile. Tehasegarantiiga meie juurde toodud arvutitel tuleb arvestada kulleri ajakuluga ametlikku remondikohta ja sealt tagasi.",
        ],
      },
      {
        heading: "Tootjate klienditugi",
        paragraphs: ["HP klienditugi 6813 823", "Fujitsu klienditugi 6512 619", "Delli klienditugi 800 3355", "Microsofti klienditugi 6868 868"],
      },
      {
        heading: "Tehasegarantii kontroll",
        links: [
          { label: "HP garantii online-kontroll", href: "https://support.hp.com/ee-en/check-warranty" },
          { label: "Lenovo garantii online-kontroll", href: "https://pcsupport.lenovo.com/ee/en/warranty-lookup#/" },
          { label: "Delli garantii online-kontroll", href: "https://www.dell.com/support/contractservices/en-ee" },
          { label: "Fujitsu garantii online-kontroll", href: "https://support.ts.fujitsu.com/IndexWarranty.asp" },
        ],
      },
      {
        heading: "Lenovo garantiiremont",
        paragraphs: [
          "IBM Eesti AS (ThinkPad) — tööaeg 09.00–17.00, Toompuiestee 33a, 10149 Tallinn, telefon 6600 800, ibm@ee.ibm.com",
          "Kernel AS (Tartu) — tööaeg 09.00–17.00, Vanemuise 45, Tartu 51003, telefon 7420 234, info@kernel.ee, https://www.kernel.ee/",
          "Servisa ICT (IdeaPad, Yoga) — https://servisaict.eu/en/register-repair/, e-post info@servisaict.lt, telefon +370 37 329000",
        ],
      },
      {
        heading: "HP ja Fujitsu garantiiremont",
        paragraphs: [
          "Fujitsu Services AS — tööaeg E–R 09.30–17.00. Tallinn: Akadeemia tee 21g, telefon 6519 972. Tartu: Riia 35, telefon 733 7210. https://www.fujitsu.ee/, remont@ee.fujitsu.com",
        ],
      },
      {
        heading: "Delli garantiiremont",
        paragraphs: ["Oixio AS (Latitude ja Precision) — tööaeg E–R 9.00–18.00, Veerenni 58A, Tallinn, telefon 699 0699, https://www.oixio.ee/"],
      },
      {
        heading: "Microsofti helpdesk (Windowsi vead)",
        paragraphs: ["+372 6868868, +372 686 8820"],
      },
    ],
  },
  {
    slug: "tarne",
    title: "Tarne",
    confirmed: true,
    prototypeNote: "Prototüübirežiimis tellimusi ei täideta. Kassas kuvatav tarneviis ja tarnehind on prototüübi näidis.",
    sections: [
      {
        paragraphs: [
          "Kaubad toimetatakse kliendini Eesti mandril Venipak (https://www.venipak.ee) kulleriga, saartel Smartposti või Omnivaga.",
          "Tellimuse tarneaeg on 1–10 tööpäeva.",
          `Kaubad saadetakse kliendile peale arvel esitatud summa laekumist ${COMPANY.legalName} kontole.`,
          "Kui toode puudub laost ning tellimust ei ole võimalik täita, siis võtame kliendiga viivitamatult ühendust ning pakume välja võimaliku uue tarneaja või toote asendamise samaväärse teise tootega, mis on sama hinna ja kvaliteediga, või makstud raha tagastamise.",
          "Täpsemad tingimused on E-poe tingimuste punktides 3 ja 5.",
        ],
        links: [{ label: "E-poe tingimused", href: TERMS_HREF }],
      },
    ],
  },
  {
    slug: "tagastamine",
    title: "Tagastamine ja taganemine",
    confirmed: true,
    sections: [
      {
        paragraphs: [
          "E-poes sõlmitud lepingutele kehtib eraisikutele 14-päevane sidevahendi abil sõlmitud lepingust taganemisõigus. Tähtaeg algab päevast, mil kaup on kliendile kätte toimetatud. Kui klient on otsustanud lepingust taganeda, tekib tal kohustus kaup müüjale tagastada.",
          "Seadme pakendist avamine ning selle käivitamine ei võta tarbijalt õigust e-poest ostetud seadme müügilepingust 14 päeva jooksul põhjust avaldamata taganeda. Tarbija vastutab asja väärtuse vähenemise eest üksnes juhul, kui ta on asja kasutanud muul viisil, kui on vaja asja olemuses, omadustes ja toimimises veendumiseks (VÕS § 562 lg 4).",
          `Toote tagastamiseks tuleb esitada taganemisteade e-postile ${EMAIL}. E-kirja tuleb märkida tellimuse number ning lisada kontaktandmed (eesnimi, perekonnanimi, tellimuse esitamise kuupäev, kontakttelefon).`,
          `Tagastamisel kantakse raha tagasi viivitamata, kuid mitte hiljem kui 14 päeva pärast seadme tagastamist aadressil ${COMPANY_ADDRESS_LINE} (${COMPANY.legalName}). Raha kantakse üle samale arvelduskontole, kust toimus selle laekumine.`,
          "Klient kohustub kandma kauba tagastuskulud 10 euro ulatuses, välja arvatud juhul, kui tagastamisele kuuluv toode ei vastanud tellimusele.",
          "Taganemisõiguse tüüpvorm: https://www.riigiteataja.ee/aktilisa/1030/1201/4001/JM_m41_lisa1.pdf",
          "Kõik tingimused (sh pretensioonid ja tarbijavaidluste komisjon) on E-poe tingimuste punktides 6–8 ja müügitingimuste punktis 5.",
        ],
        links: [{ label: "E-poe tingimused", href: TERMS_HREF }],
      },
    ],
  },
  {
    slug: "muugitingimused",
    title: "E-poe tingimused",
    confirmed: true,
    prototypeNote: PROTOTYPE_ORDERS_NOTE,
    sections: [
      {
        paragraphs: [
          `${COMPANY.legalName}, registrikoodiga ${COMPANY.registryCode}, aadress ${COMPANY.address.street} ${COMPANY.address.city} ${COMPANY.address.county} ${COMPANY.address.postalCode} (edaspidi Teenuse osutaja) ja klient, kes vormistab Sülearvutid.ee e-poes tellimuse ja identifitseerib end sisestades tellimusele oma isikuandmed (edaspidi Teenuse kasutaja või tarbija), sõlmisid käesoleva E-poe Kasutuslepingu (edaspidi Kasutusleping).`,
        ],
      },
      {
        heading: "1. E-pood",
        paragraphs: [
          "1.1 Sülearvutid.ee e-pood (edaspidi e-pood või ettevõtja) on Teenuse osutaja poolt loodud internetipood, mille vahendusel toimub toodete müük Teenuse kasutajale.",
        ],
      },
      {
        heading: "2. Üldsätted",
        paragraphs: [
          "2.1 Lepingupooled juhinduvad omavaheliste suhete reguleerimisel võlaõigusseadusest ning teistest Eesti Vabariigi seadustest ja muudest õigusaktidest ning E-poe Kasutuslepingus kokkulepitust.",
          "2.2 Teenuse osutajal on õigus mistahes ajal teha pakutavasse E-poe teenusesse muudatusi.",
          "2.3 Teenuse osutajal on õigus ühepoolselt muuta kasutajalepingu tingimusi ilma, et tal oleks kohustus teatada sellest elektronposti teel kirjalikult Teenuse kasutajale.",
        ],
      },
      {
        heading: "3. Tooted ja ostu sooritamine",
        paragraphs: [
          "3.1 E-poes kuvatavad tooted on tavapäraselt laos olemas. E-poes kuvatud toodete saadavus võib muutuda tehniliste probleemide tõttu lao või E-poe programmides.",
          "3.2 Kui toode puudub laost ning tellimust ei ole võimalik täita, siis võtab E-poe töötaja kasutajaga viivitamatult ühendust ning pakub välja võimaliku uue tarneaja või toote asendamise samaväärse teise tootega, mis on sama hinna ja kvaliteediga, või makstud raha tagastamise. Teenuse kasutajale tagastatakse raha viivitamatult, kuid mitte hiljem kui 7 päeva jooksul pärast tellimuse esitamist. Eeldatava tarne aja puhul ei ole garanteeritud toote saadavus, soovitame valida sülearvuti, mis on laos kohe olemas. Kuid sellegipoolest anname endast parima, et leida eeldatava 1–2 nädalase tarneajaga olev sülearvuti kliendile.",
          "3.3 Kuvatud tootepildid on illustratiivse tähendusega ning võivad erineda tegelikust tootest. E-poes olevad tootekirjeldused ei pruugi olla ammendavad ja võivad sisaldada tahtmatuid vigu.",
          "3.4 E-poes pakutavaid tooteid müüakse nii füüsilistele isikutele kui juriidilistele isikutele.",
          "3.5 Teenuse kasutaja kinnitab, et on vähemalt 15-aastane.",
          "3.6 Teenuse kasutaja valib välja soovitud tooted ning kohustub sisestama tellimuse täitmiseks nõutud andmed (perekonnanimi, eesnimi, kontakttelefon, kontakt-elektronposti aadress, kättetoimetamise aadress, postiindeks) ning tasub toodete eest internetipanga pangalingi vahendusel, ettemaksu arve alusel või täidab järelmaksu taotluse.",
          "3.7 Tooted on pakendist välja võetud, et kontrollida nende korrasolekut ja lisada Eesti jaoks sobilik voolukaabel, mõnikord, kui teisiti ei saa, võib korrasoleku kontrollimiseks käivitatud olla ka operatsioonisüsteem. Tooted võivad odavama hinna saavutamiseks olla pakitud uude pakendisse. Tooted võivad olla avatud, et viia konfiguratsioon vastavusse pakkumisega (nt mälu või kõvaketta lisamiseks). Mõned uued sülearvutid võivad olla tehasepoe odavmüügi mudelid, garanteerime, et need on kasutamata, tootja garantiiga, ilma kriimustusteta, tootja poolt põhjalikult testitud ja 100% töökorras.",
          "3.8 Teenuse kasutaja kohustub esitama vormistamisel tõesed andmed, mis on vajalikud tellimuse täitmiseks. Teenuse osutaja ei vastuta täitmisel Teenuse kasutaja poolt esitatud ebakorrektsetest andmetest tingitud tellimuse mittetäitmise või mistahes sellest tulenevate tagajärgede eest.",
          "3.9 Müük toimub siis, kui Teenuse kasutaja on saatnud E-poe interneti lehe kaudu tellimuse ning on tellimuse eest tasunud.",
        ],
      },
      {
        heading: "4. Hinnad",
        paragraphs: [
          "4.1 Kõik E-poes olevad hinnad on eurodes ja sisaldavad käibemaksu.",
          "4.2 Teenuse osutajal on õigus igal ajal muuta e-poes kuvatavaid hindu.",
        ],
      },
      {
        heading: "5. Tarneaeg ja kohaletoimetamise tingimused",
        paragraphs: [
          "5.1 Kaubad toimetatakse Teenuse kasutajani Eesti mandril Venipak (https://www.venipak.ee) kulleriga, saartel Smartposti või Omnivaga.",
          "5.2 Tellimuse tarneaeg on 1–10 tööpäeva.",
          `5.3 Kaubad saadetakse kliendile peale arvel esitatud summa laekumist ${COMPANY.legalName} kontole.`,
        ],
      },
      {
        heading: "6. Lepingust taganemine",
        paragraphs: [
          `6.1 Kui Teenuse kasutajast eraisik soovib tellimuse esitamise järgselt ja enne lepingu osutaja poolset täitmist lepingust taganeda, siis kohustub Teenuse kasutaja sellest võimalikult kiiresti Teenuse osutajale kirjalikult teatama. Kirjalik teade tuleb saata elektronposti aadressil ${EMAIL}. E-kirja tuleb märkida tellimuse number, millest soovitakse taganeda, ning lisada Teenuse kasutaja kontaktandmed (eesnimi, perekonnanimi, tellimuse esitamise kuupäev, kontakttelefon).`,
          "6.2 Kui taganemisavaldus jõuab Teenuse osutajani peale Teenuse osutaja poolset lepingu täitmist, siis toimub lepingust taganemine vastavalt E-poe Kasutuslepingu peatükile „Taganemisõigus”.",
          "6.3 Teenuse osutaja kannab Teenuse kasutajale tasutud summa tagasi viivitamata, kuid mitte hiljem kui 14 päeva jooksul alates kauba tagastamisest.",
          `6.4 Raha kantakse üle samale arvelduskontole, kust toimus selle laekumine Teenuse osutajale, peale kauba tagastamist ${COMPANY.address.street}, ${COMPANY.address.city}.`,
        ],
      },
      {
        heading: "7. Taganemisõigus",
        paragraphs: [
          "7.1 E-poes sõlmitud lepingutele kehtib eraisikutele 14-päevane sidevahendi abil sõlmitud lepingust taganemisõigus. Tähtaeg algab päevast, mil kaup on Teenuse kasutajale kättetoimetatud. Kui Teenuse kasutaja on otsustanud lepingust taganeda, tekib tal kohustus kaup Teenuse pakkujale tagastada.",
          "7.2 Tagastatav toode peab olema puuduseta, täiskomplektne, terves originaalpakendis ja kasutamata, kusjuures märgime, et seadme pakist avamine ning selle käivitamine ei võta tarbijalt õigust e-poest ostetud seadme müügilepingust 14 päeva jooksul põhjust avaldamata taganeda. VÕS § 562 lg 4 sätestab, et tagastamisele kuuluva asja halvenemise korral vastutab tarbija asja kasutamisest tingitud väärtuse vähenemise eest üksnes juhul, kui ta on asja kasutanud muul viisil, kui on vaja asja olemuses, omadustes ja toimimises veendumiseks. Et veenduda asja olemuses, omadustes ja toimimises, peaks tarbija käsitsema ja kasutama asja üksnes nii, nagu tal lubataks tavapäraselt seda teha poes. Lähtudes eelnevast ei kaota tarbija asja pakendi avamisel, selle tööle panemisel ja kasutamisel taganemisõigust. Kauplus võib seadme tagastamisel hinnata üksnes selle väärtuse vähenemist, kui tarbija on seda kasutanud muul viisil, kui on vaja seadme olemuses, omadustes ja toimimises veendumiseks. Seadme väärtuse vähenemise määra ning selle arvutusviisi tuleb tarbijale arusaadavalt selgitada.",
          "7.3 Tagastusõigus ei laiene avatud ümbrisega audio- ja videosalvestistele ning arvutitarkvarale.",
          `7.4 Toote tagastamiseks tuleb esitada taganemisteade e-mailile ${EMAIL}.`,
          "7.5 Lepingust taganemisel tuleb tarbijal ostetud asi viivitamatult tagastada.",
          `7.6 Tagastamisel kantakse Teenuse kasutajale raha tagasi viivitamata, kuid mitte hiljem kui 14 päeva pärast soetatud seadme tagastamist ${COMPANY.address.street}, ${COMPANY.address.city}, ${COMPANY.legalName}-le.`,
          "7.7 Raha kantakse üle samale arvelduskontole, kust toimus selle laekumine Teenuse osutajale.",
          "7.8 Teenuse kasutaja kohustub kandma kauba tagastuskulud 10 euro ulatuses, välja arvatud juhul, kui tagastamisele kuuluv toode ei vastanud tarbija tellimusele.",
          "7.9 14-päevane tagastusõigus ei kehti järgneva kauba puhul — tooted, mis on valmistatud Teenuse kasutaja isiklikke vajadusi arvestades ning audio- ja videosalvestised ning arvutitarkvara, mille ümbrise on Teenuse kasutaja avanud.",
          "7.10 Juhul kui peale toote tagastamist ilmneb, et toode ei vasta E-poe Kasutuslepingu punktides 7.1–7.4 toodud tingimustele, siis raha Teenuse kasutajale ei tagastata ning tagastatud toode jääb Teenuse osutaja juurde hoiule. Hoiustamise või Teenuse kasutajale toote tagastamisega seotud kulud katab Teenuse kasutaja.",
          `7.11 Uute sülearvutite tagastamisel on ${COMPANY.legalName}-l õigus nõuda aku kasutusest tulenevalt arvuti väärtuse vähenemise tasu, kui akut on kasutatud kliendi poolt.`,
          "7.12 Teenuse kasutaja peab toote pakendi avama ettevaatlikult ja seda kahjustamata. Kui pakend ei ole avatav seda kahjustamata, siis peab Teenuse kasutaja pakendi avamisel kasutama viisi, mis tagab pakendi kahjustamise võimalikult vähimal viisil. Et veenduda kauba sobivuses ja toimimises, peab Teenuse kasutaja käsitsema ja kasutama kaupa üksnes nii, nagu tal lubataks tavapäraselt seda teha poes. Kui Teenuse kasutaja kasutab kaupa rohkem, kui on vaja teha kauba sobivuses ja toimimises veendumiseks, või ei tagasta kaupa originaalpakendis ja esialgses komplektsuses või kui kaup on kahjustustega, siis vastutab Teenuse kasutaja kauba väärtuse vähenemise eest.",
        ],
      },
      {
        heading: "8. Pretensioonide esitamise kord",
        paragraphs: [
          "8.1 E-poest müüdud toodetele kehtib VÕS § 218 lg 2 sätestatud 2-aastane pretensiooni esitamise tähtaeg.",
          "8.2 Pretensioonide esitamise ja garantiiremondi info on toodud käesolevates tingimustes ning [Garantii lehel](/info/garantii).",
        ],
      },
      {
        heading: "9. Isikuandmed ja nende kasutamine",
        paragraphs: [
          "9.1 Teenuse kasutaja annab selge ja teadliku nõusoleku Teenuse osutajale enda isikuandmete töötlemiseks.",
          "9.2 Kaardiandmete küsimisel kasutatakse turvalist SSL andmesidet ning MasterCard SecureCode ja Verified by Visa turvasüsteeme.",
          "9.3 Teenuse osutaja sisestatud kaardi andmeid ei näe. Tehingu tegemiseks suunatakse kaardi valdaja Kaardikeskuse (Pankade Kaardikeskuse AS, https://www.estcard.ee) turvalisesse keskkonda. Maksmise hetkel toimub kaardi valdaja kaardiandmete sisestus kaardi valdaja poolt Kaardikeskuse serveris paiknevasse andmebaasi ning andmeid säilitatakse samuti Kaardikeskuses paiknevas serveris.",
          "9.4 Isikuandmete allikaks on kliendisuhte tekkimine E-poes tellimuse registreerimisel.",
          "9.5 Registreeritavate isikuandmete koosseisu kuuluvad Teenuse kasutaja poolt kassas sisestatud andmed tellimuse kohta — eesnimi, perekonnanimi, elektronposti aadress, telefoninumber, aadress (tänav, maja, korteri number), asula või linn, postiindeks, riik, ettevõttena ostes ettevõtte nimi, registrikood ja KMKR number, tarnimise viis ning tellimuse märkuste lahtrisse vabatekstina sisestatud märkused.",
          `9.6 Isikuandmeid töötleb ${COMPANY.legalName}, ${COMPANY.address.street}, ${COMPANY.address.city}, ${COMPANY.address.county}, registrikood ${COMPANY.registryCode}.`,
          "9.7 Teenuse kasutaja isikuandmed, mis on vajalikud kauba vahendamiseks Teenuse kasutajale, edastatakse kullerteenust osutavale ettevõttele.",
          "9.8 Isikuandmete kaitse on tagatud kõigi seadusest tulenevate turvameetmetega.",
          "9.9 Teenuse osutaja kohustub mitte edastama registreeritud isikuandmeid kõrvalistele isikutele.",
          "9.10 Teenuse osutaja jätab endale õiguse edastada Teenuse kasutajat puudutavaid isikuandmeid isikutele, kellel on selleks seaduslik õigus ning kes töötlevad andmeid seadusega ettenähtud kohustuse täitmiseks, ning isikutele, kellel on selleks seaduslik õigus ning see toimub Teenuse kasutaja või muu isiku elu, tervise või vabaduse kaitseks.",
          "9.11 Teenuse kasutajal on õigus kontrollida teda ennast puudutavaid isikuandmeid, samuti neid muuta või paluda kõrvaldada oma isikuandmed registrist.",
          "9.12 Teenuse kasutaja annab Teenuse osutajale nõusoleku saata tellimuse esitamisel sisestatud elektronposti aadressile tellimuskinnituse.",
          "9.13 Teenuse kasutaja annab Teenuse osutajale nõusoleku saata müügipakkumisi tellimuse esitamisel sisestatud elektronposti aadressile juhul, kui on märkinud ära vastava nõusoleku tellimuse esitamise lehel linnukesega vastavas aknas.",
        ],
      },
      {
        heading: "10. Vastutus",
        paragraphs: [
          "10.1 Teenuse osutajal lasub vastutus toote müügihinna ulatuses. Teenuse osutaja ei võta vastutust defektiga toodete poolt tekitatud kahjude eest nagu vara või informatsiooni kahjustumine, käibe või kasumi kaotamine.",
          "10.2 Teenuse kasutaja kohustub kasutama E-poe teenust üksnes vastavalt seadusele ja headele tavadele tuginedes.",
          "10.3 Teenuse kasutaja vastutab ise kõikide kasutamist eeldavate seadmete, tarkvara ja andmesidesüsteemide muretsemise ja korrashoidmisega seotud ning samuti muude E-poe Teenuse kasutamisest põhjustatud kulutuste eest.",
          "10.4 Teenuse kasutaja vastutab täielikult E-poe Kasutuslepingu tingimuste vastasest ning seaduse või heade tavade vastasest E-poe kasutamisest tekkinud kahjude eest Teenuse osutajale, teistele Teenuse kasutajatele või kolmandatele isikutele.",
        ],
      },
      {
        heading: "11. Erimeelsused",
        paragraphs: [
          "11.1 E-poe Kasutuslepingust tulenevad erimeelsused Teenuse kasutaja ning Teenuse osutaja vahel lahendatakse vastavalt Eesti Vabariigis kehtivatele õigusaktidele. Kokkuleppe mittesaavutamisel lahendatakse erimeelsus Harju Maakohtus.",
        ],
      },
      {
        heading: "12. Kasutamistingimused",
        paragraphs: [
          "12.1 Kasutuslepingus toodud tingimustega tutvumine on Teenuse kasutajale kohustuslik.",
          "12.2 Tellimuse esitamisel kinnitab Teenuse kasutaja Sülearvutid.ee kassas kohustusliku märkeruuduga „Olen tutvunud ja nõustun E-poe tingimustega.”, et on tutvunud Kasutuslepingus toodud tingimustega, neist aru saanud ja nõustub nendega. Ilma nõustumiseta tellimust ei esitata.",
        ],
      },
      {
        heading: `${COMPANY.legalName} müügitingimused`,
        paragraphs: [],
      },
      {
        heading: "1. Üldsätted",
        paragraphs: [
          `1.1 Käesolevad Sülearvutid.ee müügitingimused (edaspidi „müügitingimused”) määravad kindlaks ${COMPANY.legalName} (edaspidi „müüja”) kohustused ja kliendi õigused seoses müügisuhtega, mis tekib kliendi poolt müüjalt seadme ostmisega kas mistahes sidevahendi abil tehtud või müüja müügiesinduses vormistatud ostuarve alusel.`,
          "1.2 Müüjalt seadme ostmisel loetakse, et klient on müügitingimustega tutvunud, on neist aru saanud ja nendega nõustunud.",
          `1.3 Müügitingimustes käsitlemata küsimustega saab klient pöörduda müüja klienditoe poole telefonil ${COMPANY.phone.label}, e-postil ${EMAIL} või aadressil ${COMPANY_ADDRESS_LINE}.`,
          "1.4 Müügitingimustes on „tarbija” mõistet läbivalt kasutatud võlaõigusseaduses sätestatud „tarbija” mõiste tähenduses. Tarbija on selline füüsilisest isikust klient, kes müüjaga müügisuhtesse astumisel ei tegutse oma majandus- või kutsetegevuses.",
          "1.5 Müügitingimustes mõistetakse „remondi teostaja” all [Garantii lehel](/info/garantii) loetletud ettevõtteid, kes teostavad vastavate seadmete garantiiremonti või remonti.",
          "1.6 Müüja poolt müüdud seade loetakse kvaliteetseks, kui seadme LCD-kuvari surnud pikslite arv ei ületa kolme (3).",
          "1.7 Müüja poolt müüdud seadmed loetakse kvaliteetseks, vaatamata seadmete kuluvate osade (juhtmed, akud, CD-d, hiirematt, originaalpakend, dokumentatsioon jmt) tavapärasele kulumisele.",
        ],
      },
      {
        heading: "2. Müügihinna tasumine",
        paragraphs: [
          "2.1 Müügihind tasutakse terves ulatuses ostutellimuse tegemisel.",
          "2.2 Tarbija tasub ostutellimuse tegemisel müügihinna pooles ulatuses, ülejäänud pool müügihinnast kuulub tasumisele tarbijale seadme üleandmise ajal.",
        ],
      },
      {
        heading: "3. Tarnetingimused",
        paragraphs: [
          "3.1 Ostetud seadme tarneaeg on 1–10 tööpäeva alates ostutellimuse vormistamisest, kui kliendiga ei ole kokku lepitud teistsuguses tarneajas.",
          "3.2 Ostetud seade toimetatakse kliendile kullerteenuse osutaja vahendusel kliendi poolt ostutellimuses määratud aadressil. Klient võib ostutellimuse tegemisel määrata seadmele järeletulemise, millisel juhul kullerteenust ei kasutata ja müüja teavitab klienti seadme saabumisest ja seadmele järeletulemise kohast.",
          "3.3 Eeldatakse, et seadme kättetoimetamine või sellele järeletulemine toimub tööpäeval ajavahemikus kl 10–18.",
          "3.4 Ostetud seadmetele tuleb järele tulla 6 kuu jooksul, peale seda kuulub seade utiliseerimisele.",
        ],
      },
      {
        heading: "4. Kliendi kohustused",
        paragraphs: [
          "4.1 Klient on kohustatud tasuma seadme ostuhinna ja ostetud seadme vastu võtma.",
          "4.2 Taganemistähtaja jooksul on tarbija kohustatud säilitama seadet ja seadmega kaasas olnud kõik juhtmed, CD-d, muud tarvikud ja dokumendid ning seadme originaalpakendi parimas seisundis.",
          "4.3 Klient on kohustatud teavitama müüjat või remondi teostajat viivitamatult (hiljemalt ühe nädala jooksul) sellest, et müüjalt ostetud seadmel on riistvaraline rike. Tarbijal tuleb esitada nimetatud teade hiljemalt kahe kuu jooksul alates rikke avastamisest.",
          "4.4 Punktis 4.3 nimetatud teade tuleb esitada kirjalikult, andes võimalikult täpse kirjelduse kõigist ilmsiks tulnud riistvaralistest riketest. Tarbija võib esitada vastavasisulise kirjelduse suuliselt.",
          "4.5 Kui klient on rikkunud mõnda punktides 4.3–4.4 sätestatud teavitamiskohuse tingimust, võib müüja keelduda tasuta remondi võimaldamisest.",
          "4.6 Remondi teostaja ega müüja ei pea kõrvaldama neid riistvaralisi rikkeid, millest klient ei ole p 4.3–4.4 nimetatud kirjelduses teatanud.",
          "4.7 Klient on kohustatud hoiduma seadme iseseisvast remondist ja laskma seadet remontida üksnes müügitingimustes loetletud remondi teostajatel.",
          "4.8 Garantiiaja jooksul on klient kohustatud alles hoidma seadme ostuarve, vastasel juhul garantii ei kehti. Tarbija on kohustatud alles hoidma seadme ostuarve tarbijale seadusest tuleneva pretensioonide esitamise tähtaja jooksul.",
          "4.9 Enne seadme remonti andmist tuleb kliendil veenduda, et tegemist ei ole viiruse või muu tarkvarast tuleneva probleemiga.",
          "4.10 Tarbijale seadusest tuleneva pretensioonide esitamise tähtaja jooksul on tarbija kohustatud hoiduma seadme kahjustamisest, sh seadme kasutamisest vastuolus selle kasutusotstarbe ja -juhendiga. Nimetatud tähtaja jooksul tuleb tarbijal alles hoida seadme seeria- ja tootenumber. Klient, kes ei ole tarbija, peab kinni pidama antud sättes loetletud kohustustest garantiiaja jooksul.",
          "4.11 Klient kohustub arvutit laadides alati ise tagama selle järelevalve ning mitte jätma laadimist toimima ilma oma kohalolekuta. Kõik võimalikud kahjud, mis tekivad arvuti laadimise ajal järelevalveta jätmisest (sealhulgas, kuid mitte ainult, tulekahju, elektririke või vara kahjustus), on täielikult kliendi vastutusel. Teenusepakkuja ei vastuta ühegi otsese ega kaudse kahju eest, mis tuleneb kliendi kohustuse rikkumisest.",
        ],
      },
      {
        heading: "5. Tarbija taganemisõigus",
        paragraphs: [
          "5.1 Eraisikust tarbijal on õigus taganeda sidevahendi (telefoni, mobiiltelefoni, e-posti, faksi või Interneti) abil tehtud tellimusest ja tagastada müüjale ostetud seade 14 päeva jooksul alates seadme vastuvõtmisest, esitades müüjale vastavasisulise taganemisavalduse.",
          "5.2 Taganemisõiguse kasutamisel on tarbija kohustatud tagastama seadmega kaasas olnud kõik juhtmed, CD-d, muud tarvikud ja dokumendid ning seadme originaalpakendi, millised esemed peavad olema parimas, nende ostjale üleandmise ajale võimalikult sarnases seisundis ega tohi olla puudu, kriimustatud, painutatud, rebitud või muul viisil kahjustatud. Vastasel juhul võib müüja kinni pidada ja endale jätta kliendi poolt makstud müügihinna osa, mis katab müüjale tekkinud kahju seoses komplekssete juhtmete, CD-de, muude tarvikute, dokumentide või originaalpakendi puudumisega või nende kahjustamisega.",
          "5.3 Taganemisõiguse kasutamisel, enne seadme müüjale üleandmist, on tarbija kohustatud eemaldama seadmest sinna ise paigaldatud tarkvara ja andmed ning taastama kõik tarkvara algseaded. Mõjutamata taganemisõiguse kehtivust, võib müüja keelduda seadme vastuvõtmisest, kuni tarbija on täitnud tarkvara eemaldamise kohustuse. Tarkvara eemaldamise ja algseadete taastamise kohustuse mittetäitmise korral võib müüja endale jätta kliendi poolt makstud müügihinna osa, mis katab müüjale tekkinud kulu seoses tarkvara eemaldamise ja algseadete taastamisega.",
          "5.4 Taganemisõiguse kasutamisel on tarbija kohustatud tagastama ostetud seadme hiljemalt 14 päeva jooksul alates taganemisavalduse esitamisest. Seade tuleb tagastada kas kullerteenuse osutaja vahendusel või leppida müüjaga eelnevalt kokku seadme tarbija poolt kohaletoimetamises.",
          "5.5 Ettevõtja tagastab taganemisavalduse kättesaamisel tarbijale viivitamata, kuid mitte hiljem kui 14 päeva möödumisel, kõik tarbijalt lepingu alusel saadud tasud, muu hulgas tarbija kantud asja kättetoimetamise kulud (VÕS § 56¹ lg 1). Seega on oluline märkida, et lepingust taganemisel on tarbijal lisaks seadme maksumusele õigus saada tagasi ka selle kättetoimetamisega seotud kulud ning seda mitte hiljem kui 14 päeva jooksul.",
          "5.6 Tarbija kannab tarbijapoolsel lepingust taganemisel lepinguesemeks olnud asja tagastamise kulud ning olukorras, kui lepingu esemeks olnud asja ei saa selle olemuse tõttu tavalise postiteenuse kaudu tagastada, asja äraviimise kulud, kui need tuleb tasuda tarbijal. VÕS § 56² lõike 3 kohaselt kannab tarbija talle lepingu esemena üleantud asja tagastamisega seotud otsesed kulud, kui pooled ei ole kokku leppinud teisiti. Tarbijal ei ole kulude kandmise kohustust, kui ettevõtja ei ole teda teavitanud sellest, et need kulud tuleb kanda tarbijal.",
          "5.7 Tarbija saab lepingu eseme lepingutingimustele mittevastavuse korral tugineda seaduses sätestatud õiguskaitsevahenditele. VÕS § 222 lg 1 kohaselt, kui asi ei vasta lepingutingimustele, võib ostja nõuda müüjalt asja parandamist või asendamist, kui see on võimalik ja sellega ei põhjustata müüjale võrreldes teiste õiguskaitsevahendite kasutamisega ebamõistlikke kulusid või põhjendamatuid ebamugavusi, arvestades muu hulgas asja väärtust, lepingutingimustele mittevastavuse olulisust ning ostja võimalust saada lepingutingimustele vastav asi oluliste ebamugavusteta mujalt. Müüja võib parandamise asemel asendada asja lepingutingimustele vastava asjaga.",
          "5.8 Taganemisõiguse tüüpvormi leiab siit: https://www.riigiteataja.ee/aktilisa/1030/1201/4001/JM_m41_lisa1.pdf",
          "5.9 Tarbija võib pöörduda kohtuvälise kaebusi ja vaidlusi lahendava organi poole (VÕS § 54 lg 1 p 22). Eestis on selline kohtuväline kaebusi lahendav organ tarbijakaitseameti juures tegutsev tarbijavaidluste komisjon. Komisjoni pädevuses on lahendada tarbija ja ettevõtja vahel sõlmitud lepingust tulenevaid vaidlusi, mida pooled ei ole suutnud lahendada kokkuleppe teel. Kaebuse läbivaatamine komisjonis on pooltele tasuta. Lisainfo: https://www.tarbijakaitseamet.ee/et/tarbijavaidluste-komisjon/esita-avalduskomisjonile",
        ],
      },
      {
        heading: "Lisainfo",
        paragraphs: [
          `Meilt ostetud vanad ja kasutud sülearvutid võtame tasuta tagasi poes ${COMPANY.address.street}.`,
          "Akude garantii on 6 kuud, kuna aku on kulumaterjal. Akude tööaeg on märgitud kodulehel „kuni”, see tähendab maksimaalset aku tööaega ideaalsetes tingimustes ostuhetkel, näiteks lennukis madala ekraani heledusega Wordis töö tegemisel. Põhjus on selles, et iga inimene kasutab sülearvutit erinevalt ja keskmist aega ei ole olemas. Kui sama arvutiga üks inimene töötleb videosid, peab temal aku vastu 2 tundi, teine inimene käib netis ja temal peab samal arvutil aku vastu 6 tundi, kolmas inimene vaatab videot ja tema saab aku ajaks samal arvutil 10 tundi. Seetõttu ongi meil märgitud aku ajad „kuni”. Kui aku ei pea vastu lubatud aega ostu hetkel, siis vahetame aku ringi.",
          `Garantii ei laiene tarkvarale ning füüsilistele vigastustele. Garantiijuhtumi puhul peab klient ise oma tarkvara varundama, ${COMPANY.legalName} ei vastuta, kui garantii käigus andmed kaotsi lähevad. Garantii alla ei kuulu Windowsi, BIOS-e jms tarkvara uuenduste tõttu tekkinud vead.`,
          "Sülearvuti vajab nagu autogi hooldust ja seda tolmust puhastamise näol. Vead, mis on põhjustatud üleliigsest tolmust, ei pruugi garantii alla minna. Soovituslik on aastas 1 kord arvuti ära puhastada.",
          "Vedelikukahjustuse defekteerimise tasu on 50 €.",
          "Microsoft Office ei ole tasuta ühegi arvutiga kaasas. Täispakett Word, Excel, Outlook maksab 259 €, ilma Outlookita eraisikutele mõeldud variant 139 €. Tasuta on võimalik paigaldada analoogne programm LibreOffice.",
          "Osadel vähekasutatud sülearvutitel võivad olla eelmise omaniku poolt paigaldatud kleebise jäljed korpusel. Mõnel üksikul juhul ei ole hulgiladu saanud tugeva liimiga paigaldatud kleebist maha teisiti, kui korpust antud kohalt kriimustades. Nendele kohtadele oleme lisanud kleepsu, mille võib igaüks enda kleepsuga asendada. Töö tegemist need ei sega ning on ainult visuaalsed, kriimustunud osa suurus jääb mõne cm piiresse. Kui on kindel soov ilma kleebise jäljeta kasutatud sülearvuti ostuks, tuleks see eelnevalt üle küsida meilt.",
          "Demo mudelitel võib puududa originaalkarp ja neil võib esineda väga väikseid, pea märkamatuid kulumise jälgi.",
          "Klaviatuuride keel on märgitud kodulehel ainult siis, kui tegemist on Skandinaavia või Eesti klaviatuuriga. Saksa, Inglismaa, USA jt maade puhul klaviatuuri keelt märgitud ei ole, samas nende arvutitega saab probleemideta ä, ö, ü, õ jt eesti tähti kirjutada. Soovi korral saab tasuta Eesti kleepsud kaasa, see tuleks tellimisel ära märkida märkuste lahtrisse.",
          "LPDDR3 ja LPDDR4 mäludega sülearvutitel pole võimalik RAM-mälu muuta, kuna see on joodetud emaplaadile.",
          "Tellimus läheb töösse alles peale ettemaksuarve laekumist, seniks on võimalik ka teistel tellitud arvutit osta. Kui makse laekub hiljem, võib sülearvuti laost otsa saada ning arvuti saab klient, kes esimesena tasus.",
          `Kui tekib küsimusi, palun võta enne ostu sooritamist meiega ühendust: ${EMAIL}, telefon ${COMPANY.phone.label}.`,
        ],
      },
    ],
  },
  {
    slug: "privaatsus",
    title: "Isikuandmed ja privaatsus",
    confirmed: true,
    sections: [
      {
        paragraphs: [
          `Isikuandmeid töötleb ${COMPANY.legalName}, ${COMPANY.address.street}, ${COMPANY.address.city}, ${COMPANY.address.county}, registrikood ${COMPANY.registryCode}. Küsimuste ja taotluste korral kirjuta ${EMAIL}.`,
          "Isikuandmete töötlemise tingimused on E-poe tingimuste punktis 9 „Isikuandmed ja nende kasutamine”. Peamine:",
          "Isikuandmete allikaks on kliendisuhte tekkimine e-poes tellimuse registreerimisel. Kauba kättetoimetamiseks vajalikud isikuandmed edastatakse kullerteenust osutavale ettevõttele. Registreeritud isikuandmeid ei edastata kõrvalistele isikutele, välja arvatud isikutele, kellel on selleks seaduslik õigus.",
          "Sul on õigus kontrollida enda kohta käivaid isikuandmeid, neid muuta või paluda need registrist kõrvaldada.",
        ],
        links: [{ label: "E-poe tingimused, punkt 9", href: TERMS_HREF }],
      },
      {
        heading: "Küpsised ja brauseri salvestus Sülearvutid.ee-s",
        paragraphs: [
          "Kasutame ainult tehniliselt vajalikke küpsiseid ja brauseri salvestusi: tellimuse kinnituslehe juurdepääsuküpsis (pärast tellimuse esitamist); sinu brauseris (localStorage) ostukorv, võrdlusesse lisatud tooted ja sisestatud sooduskood; kassa ajal (sessionStorage) kaitse sama tellimuse topelt esitamise vastu.",
          "Analüütika-, reklaami- ega jälgimisküpsiseid ega kolmandate osapoolte jälgimis- või analüütikaskripte Sülearvutid.ee ei kasuta. Seetõttu ei kuvata ka küpsiste nõusoleku akent.",
        ],
      },
    ],
  },
  {
    slug: "meist",
    title: "Meist",
    confirmed: true,
    sections: [
      {
        paragraphs: [`Sülearvutid.ee on kasutatud äriklassi sülearvutite e-pood. Müüja on ${COMPANY.legalName} (registrikood ${COMPANY.registryCode}), kontaktid leiad [Kontakt lehelt](/info/kontakt).`],
      },
      {
        heading: "Meeskond",
        paragraphs: ["Ristjan Rikk — Developer", "Virgo Rikk — Developer"],
      },
    ],
  },
];

export function getInfoPage(slug: string): InfoPage | undefined {
  return INFO_PAGES.find((page) => page.slug === slug);
}
