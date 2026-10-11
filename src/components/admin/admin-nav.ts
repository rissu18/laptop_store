import {
  Activity,
  BadgeEuro,
  Boxes,
  ClipboardCheck,
  FileText,
  HeartPulse,
  Image as ImageIcon,
  LayoutDashboard,
  Laptop,
  Settings,
  TicketPercent,
  ShoppingCart,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface AdminNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Tulevane funktsioon — kuvatakse, aga pole klikitav (ei teeskle toimivat funktsiooni) */
  comingSoon?: boolean;
}

export interface AdminNavGroup {
  label: string | null;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: null,
    items: [
      { label: "Töölaud", href: "/admin", icon: LayoutDashboard },
      { label: "Tellimused", href: "/admin/orders", icon: ShoppingCart },
    ],
  },
  {
    label: "Kataloog",
    items: [
      { label: "Mudelid", href: "/admin/products/models", icon: Laptop },
      { label: "Konfiguratsioonid", href: "/admin/products/listings", icon: Boxes },
      { label: "Pildid", href: "/admin/images", icon: ImageIcon },
      { label: "Andmekvaliteet", href: "/admin/data-quality", icon: ClipboardCheck },
    ],
  },
  {
    label: "Pood",
    items: [
      { label: "Hinnastamine", href: "/admin/pricing", icon: BadgeEuro },
      { label: "Sooduskoodid", href: "/admin/discounts", icon: TicketPercent },
      { label: "Seaded", href: "/admin/settings", icon: Settings },
    ],
  },
  {
    label: "Süsteem",
    items: [
      { label: "Tegevuslogi", href: "/admin/system/activity", icon: Activity },
      { label: "Logid", href: "/admin/system/logs", icon: FileText },
      { label: "Tervis", href: "/admin/system/health", icon: HeartPulse },
    ],
  },
  {
    label: "Tulekul",
    items: [
      { label: "Kliendid", href: "#kliendid", icon: Users, comingSoon: true },
      { label: "Tarnijad", href: "#tarnijad", icon: Truck, comingSoon: true },
    ],
  },
];

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}
