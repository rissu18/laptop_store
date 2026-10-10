import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { storeConfig } from "@/config/store";
import { getSettings } from "@/server/settings/settings-service";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  const name = settings.general.storeName;
  return {
    metadataBase: new URL(storeConfig.siteUrl),
    title: {
      default: `${name} – kasutatud äriklassi sülearvutid`,
      template: `%s | ${name}`,
    },
    description:
      "Kasutatud äriklassi sülearvutid: Lenovo ThinkPad, Dell Latitude ja HP EliteBook. Selge seisukord, põhjalikud filtrid ja aus hind.",
    // Prototüüpi ei indekseerita, kuni pood päriselt avatakse (admin → Seaded → Pood)
    robots: settings.store.prototypeMode ? { index: false, follow: false } : undefined,
  };
}

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="et" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
