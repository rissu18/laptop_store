import type { Metadata } from "next";
import { SettingsEditor } from "@/components/admin/settings-form";
import { PageHeader } from "@/components/admin/ui";
import { getAdminSettings } from "@/server/admin/settings/queries";

/** Admin on alati päringupõhine (sessioon, värsked andmed) — eelrenderdust ega "instant" navigeerimist ei kasutata. */
export const instant = false;

export const metadata: Metadata = { title: "Seaded" };

export default async function SettingsPage() {
  const { settings } = await getAdminSettings();
  return (
    <>
      <PageHeader
        title="Seaded"
        breadcrumbs={[{ label: "Pood" }, { label: "Seaded" }]}
        description="Muudatused jõuavad poodi kohe pärast salvestamist. Hinnastamise seaded on lehel Hinnastamine."
      />
      <SettingsEditor settings={settings} />
    </>
  );
}
