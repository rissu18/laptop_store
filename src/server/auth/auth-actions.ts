"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAudit } from "@/server/admin/audit";
import { getDb, isDatabaseConfigured } from "@/server/db/client";
import { adminUsers } from "@/server/db/schema";
import { errorMessage, newErrorId, writeSystemLog } from "@/server/logging/system-log";
import {
  assertSameOrigin,
  clearSessionCookie,
  getClientMeta,
  getCurrentAdmin,
  readSessionToken,
  setSessionCookie,
} from "./auth";
import { safeAdminRedirect } from "./constants";
import { getDummyHash, verifyPassword } from "./password";
import { isLoginBlocked, recordLoginAttempt } from "./rate-limit";
import { createSessionRecord, deleteSessionRecord } from "./session-store";

export interface LoginState {
  error: string | null;
  email?: string;
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(200).pipe(z.email()),
  password: z.string().min(1).max(200),
  next: z.string().max(300).optional(),
});

const GENERIC_ERROR = "Vale e-post või parool.";

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password"), next: formData.get("next") ?? undefined });
  const typedEmail = String(formData.get("email") ?? "").slice(0, 200);
  if (!parsed.success) return { error: GENERIC_ERROR, email: typedEmail };
  if (!isDatabaseConfigured()) return { error: "Admin vajab andmebaasi (DATABASE_URL puudub).", email: typedEmail };

  let redirectTo: string;
  try {
    await assertSameOrigin();
    const { email, password, next } = parsed.data;
    const db = getDb();
    const meta = await getClientMeta();

    if (await isLoginBlocked(db, email, meta.ip)) {
      await writeSystemLog({ level: "WARN", source: "AUTH", message: "Sisselogimine blokeeritud (liiga palju katseid)", details: { email, ip: meta.ip } });
      return { error: "Liiga palju ebaõnnestunud katseid. Proovi 15 minuti pärast uuesti.", email };
    }

    const [user] = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
    // Kontrollime parooli ka olematu kasutaja korral (dummy räsi), et vastuse aeg ei reedaks kontosid
    const passwordOk = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
    const ok = Boolean(user && user.isActive && passwordOk);
    await recordLoginAttempt(db, email, meta.ip, ok);

    if (!ok || !user) {
      await writeSystemLog({ level: "WARN", source: "AUTH", message: "Ebaõnnestunud sisselogimine", details: { email, ip: meta.ip } });
      return { error: GENERIC_ERROR, email };
    }

    const session = await createSessionRecord(db, user.id, meta);
    await setSessionCookie(session.token, session.expiresAt);
    await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, user.id));
    await writeAudit(db, { id: user.id, email: user.email }, { action: "auth.login", entityType: "AdminUser", entityId: user.id, entityLabel: user.email });
    redirectTo = safeAdminRedirect(next);
  } catch (error) {
    const errorId = newErrorId();
    await writeSystemLog({ level: "ERROR", source: "AUTH", message: "Sisselogimise viga", details: { reason: errorMessage(error) }, errorId });
    return { error: `Sisselogimine ebaõnnestus tehnilise vea tõttu (viga ${errorId}).`, email: typedEmail };
  }
  redirect(redirectTo);
}

export async function logoutAction(): Promise<void> {
  try {
    await assertSameOrigin();
    const admin = await getCurrentAdmin();
    const token = await readSessionToken();
    if (token && isDatabaseConfigured()) {
      const db = getDb();
      await deleteSessionRecord(db, token);
      if (admin) await writeAudit(db, admin, { action: "auth.logout", entityType: "AdminUser", entityId: admin.id, entityLabel: admin.email });
    }
  } finally {
    await clearSessionCookie();
  }
  redirect("/admin/login");
}
