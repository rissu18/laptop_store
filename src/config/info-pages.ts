/**
 * Infolehtede sisu. Phase 3-s muudetav administ.
 * TODO: REAL PROVIDER DATA REQUIRED — tingimused tuleb koostada koos juristi/raamatupidajaga
 * pärast seda, kui tarnija, garantii, tarne ja makseteenus on kokku lepitud.
 */
export interface InfoPage {
  slug: string;
  title: string;
  paragraphs: string[];
  /** Kas sisu on lõplik ja kinnitatud */
  confirmed: boolean;
}

export const INFO_PAGES: InfoPage[] = [
  {
    slug: "tarne",
    title: "Tarne",
    paragraphs: ["Tarneviisid, hinnad ja tarneajad lisatakse pärast tarnija ja transpordipartneri valimist."],
    confirmed: false,
  },
  {
    slug: "tagastamine",
    title: "Tagastamine ja taganemine",
    paragraphs: [
      "E-poest ostes on tarbijal seadusest tulenev õigus 14 päeva jooksul pärast kauba kättesaamist lepingust taganeda ilma põhjust esitamata.",
      "Tagastamise praktiline kord (kuhu ja kuidas kaup saata) lisatakse pärast kokkulepet hulgilaoga.",
    ],
    confirmed: false,
  },
  {
    slug: "garantii",
    title: "Garantii",
    paragraphs: [
      "Garantii pikkus ja tingimused lisatakse pärast kokkulepet hulgilaoga.",
      "Garantii on eraldi seadusest tulenevast müüja vastutusest, mis kehtib igal juhul.",
    ],
    confirmed: false,
  },
  { slug: "meist", title: "Meist", paragraphs: ["Ettevõtte tutvustus lisatakse."], confirmed: false },
  { slug: "kontakt", title: "Kontakt", paragraphs: ["Kontaktandmed lisatakse."], confirmed: false },
  { slug: "muugitingimused", title: "Müügitingimused", paragraphs: ["Müügitingimused lisatakse enne poe avamist."], confirmed: false },
  {
    slug: "privaatsus",
    title: "Privaatsuspoliitika",
    paragraphs: [
      "Kasutame ainult tehniliselt vajalikke salvestusi (näiteks ostukorvi sisu sinu brauseris). Reklaami- ega jälgimisküpsiseid ei kasutata.",
      "Täielik privaatsuspoliitika lisatakse enne poe avamist.",
    ],
    confirmed: false,
  },
];
