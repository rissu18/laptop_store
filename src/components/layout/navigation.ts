/** Põhinavigatsioon. Teadlikult lihtne — ei mega-menüüd. */
export const MAIN_NAV = [
  { href: "/sulearvutid", label: "Sülearvutid" },
  { href: "/parimad-pakkumised", label: "Parimad pakkumised" },
  { href: "/sulearvutid/lenovo", label: "Lenovo" },
  { href: "/sulearvutid/dell", label: "Dell" },
  { href: "/sulearvutid/hp", label: "HP" },
  { href: "/leia-sobiv", label: "Leia sobiv" },
  { href: "/info", label: "Abi ja info" },
] as const;
