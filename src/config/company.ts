/**
 * Müüja rekvisiidid ja kontaktid — üks allikas jaluse, Kontakt-lehe, E-poe tingimuste, Garantii ja
 * isikuandmete lehe jaoks. Sülearvutid.ee müüja on sama ettevõte, mis Laptopid.ee-l (Sülearvutid OÜ).
 *
 * Allikas: Laptopid.ee live-leht, kontrollitud 2026-10-11 — jalus, /page/1/kontakt, E-poe tingimused
 * (/index.php/page/15: nimi, registrikood, aadress). Erand: e-post on AINULT info@sylearvutid.ee
 * (Laptopid.ee e-posti Sülearvutid.ee-s ei kasutata).
 */
export const COMPANY = {
  legalName: "Sülearvutid OÜ",
  registryCode: "11740579",
  address: {
    street: "Tartu mnt 83",
    postalCode: "10115",
    city: "Tallinn",
    county: "Harjumaa",
    country: "Eesti",
  },
  phone: { label: "(+372) 6 835 543", href: "tel:+3726835543" },
  mobile: { label: "(+372) 56 665 943", href: "tel:+37256665943" },
  email: "info@sylearvutid.ee",
  openingHours: ["E–R 10:00–18:00", "Riigipühadel oleme suletud"],
  entrance: "Sissepääs Tartu maantee poolt.",
  parking: "Tasuta parkimine Lubja tänava parklas (15 minutit kellaga, pikemaks ajaks saab parkimise registreerida poes tasuta).",
  /** Sama Google Mapsi asukoht, mida kasutab Laptopid.ee jalus (Tartu maantee 83, 10115 Tallinn) */
  mapsUrl:
    "https://www.google.ee/maps/place/Tartu+maantee+83,+10115+Tallinn/@59.4275931,24.7785287,19.54z/data=!4m5!3m4!1s0x469294a9b7fc8619:0xdb17e4801a81a4ec!8m2!3d59.4275418!4d24.77886?hl=et",
} as const;

/** "Tartu mnt 83, 10115 Tallinn" */
export const COMPANY_ADDRESS_LINE = `${COMPANY.address.street}, ${COMPANY.address.postalCode} ${COMPANY.address.city}`;
