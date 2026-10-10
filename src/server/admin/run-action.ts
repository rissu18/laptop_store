import "server-only";
import { UnauthorizedError, requireAdminAction } from "@/server/auth/auth";
import type { SessionAdmin } from "@/server/auth/session-store";
import { errorMessage, newErrorId, writeSystemLog } from "@/server/logging/system-log";
import { fail, type ActionResult } from "./action-result";

/**
 * Kõigi admini server action'ite ühine raam:
 *  1. kontrollib päritolu (CSRF) ja sessiooni — IGA kord, sõltumata lehest, kust action kutsuti;
 *  2. ootamatu viga logitakse (system_logs, ADMIN) vea ID-ga; kasutajale ainult ID, mitte stack trace.
 */
export async function runAdminAction(name: string, handler: (admin: SessionAdmin) => Promise<ActionResult>): Promise<ActionResult> {
  let admin: SessionAdmin;
  try {
    admin = await requireAdminAction();
  } catch (error) {
    if (error instanceof UnauthorizedError) return fail(error.message);
    throw error;
  }
  try {
    return await handler(admin);
  } catch (error) {
    const errorId = newErrorId();
    await writeSystemLog({ level: "ERROR", source: "ADMIN", message: `Admini toiming ebaõnnestus: ${name}`, details: { reason: errorMessage(error), admin: admin.email }, errorId });
    return fail(`Salvestamine ebaõnnestus (vea ID ${errorId}).`);
  }
}
