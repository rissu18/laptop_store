"use server";

import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { EDITABLE_SETTINGS, settingsFromForm, type EditableSettingsKey } from "@/domain/admin/settings-form";
import { zodFieldErrors } from "@/domain/admin/product-edit";
import { DEFAULT_SETTINGS, SETTINGS_SCHEMAS, parseSetting } from "@/domain/settings/settings";
import { SETTINGS_CACHE_TAG } from "@/server/cache-tags";
import { getDb } from "@/server/db/client";
import { storeSettings } from "@/server/db/schema";
import { fail, ok, type ActionResult } from "../action-result";
import { diffChanges, writeAudit } from "../audit";
import { runAdminAction } from "../run-action";

const LABELS: Record<EditableSettingsKey, string> = {
  general: "Üldine",
  store: "Pood",
  delivery: "Tarne",
  warranty: "Garantii",
  returns: "Tagastus",
  trustBar: "Usaldusriba",
};

/** Ühe seadete grupi salvestamine: serveripoolne zod-valideerimine, audit, poe vahemälu tühjendus. */
export async function saveSettingsAction(key: EditableSettingsKey, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAdminAction(`settings.${key}`, async (admin) => {
    if (!(EDITABLE_SETTINGS as readonly string[]).includes(key)) return fail("Tundmatu seadete grupp");
    const parsed = SETTINGS_SCHEMAS[key].safeParse(settingsFromForm(key, formData));
    if (!parsed.success) return fail("Kontrolli välju", zodFieldErrors(parsed.error));

    await getDb().transaction(async (tx) => {
      const [current] = await tx.select().from(storeSettings).where(eq(storeSettings.key, key)).for("update");
      const before = current ? parseSetting(key, current.value) : DEFAULT_SETTINGS[key];
      await tx
        .insert(storeSettings)
        .values({ key, value: parsed.data, updatedBy: admin.email })
        .onConflictDoUpdate({ target: storeSettings.key, set: { value: parsed.data, updatedBy: admin.email } });
      const changes = diffChanges(before as Record<string, unknown>, parsed.data as Record<string, unknown>);
      if (Object.keys(changes).length) await writeAudit(tx, admin, { action: "settings.update", entityType: "StoreSetting", entityId: key, entityLabel: LABELS[key], changes });
    });
    updateTag(SETTINGS_CACHE_TAG);
    return ok(`${LABELS[key]}: salvestatud.`);
  });
}
