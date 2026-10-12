/** Põhinavigatsioon. Teadlikult lihtne — ei mega-menüüd. `showroom` = salongi link (desktopis paremas servas). */
export const MAIN_NAV: readonly { href: string; label: string; showroom?: true }[] = [
  { href: "/sulearvutid", label: "Sülearvutid" },
  { href: "/parimad-pakkumised", label: "Parimad pakkumised" },
  { href: "/sulearvutid/lenovo", label: "Lenovo" },
  { href: "/sulearvutid/dell", label: "Dell" },
  { href: "/sulearvutid/hp", label: "HP" },
  { href: "/leia-sobiv", label: "Leia sobiv" },
  { href: "/info/kontakt", label: "Salong ja kontakt", showroom: true },
];
