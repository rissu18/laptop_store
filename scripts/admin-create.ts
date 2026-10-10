/**
 * Admini kasutaja loomine: npm run admin:create
 *
 * Interaktiivselt (parool sisestatakse varjatult) või keskkonnamuutujatega (nt CI):
 *   ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... npm run admin:create
 * Olemasoleva kasutaja parooli vahetus: npm run admin:create -- --reset-password
 *
 * Parooli ei salvestata lähtekoodi, logidesse ega seed-faili — andmebaasi läheb ainult scrypt räsi.
 */
import "./lib/load-env";
import { createInterface } from "node:readline";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "@/server/admin/audit";
import { hashPassword, validatePasswordStrength } from "@/server/auth/password";
import { deleteUserSessions } from "@/server/auth/session-store";
import { createDb } from "@/server/db/client";
import { redactConnectionStrings, resolveDatabaseUrl } from "@/server/db/database-url";
import { adminUsers } from "@/server/db/schema";

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Varjatud sisestus: sisestatud märke ei kuvata terminalis
      const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
        if (s.startsWith(question)) write.call(rl, question);
        else if (s.includes("\n") || s.includes("\r")) write.call(rl, "\n");
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const reset = process.argv.includes("--reset-password");
  const url = resolveDatabaseUrl("direct");
  if (!url) throw new Error("DATABASE_URL puudub (vt .env.development.local või `vercel env pull`)");

  const interactive = !process.env.ADMIN_EMAIL;
  const email = z
    .email("Vigane e-posti aadress")
    .parse((process.env.ADMIN_EMAIL ?? (await ask("E-post: "))).trim().toLowerCase());

  const { db, pool } = createDb(url);
  try {
    const [existing] = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
    if (existing && !reset) throw new Error("Selle e-postiga admin on juba olemas. Parooli vahetamiseks: npm run admin:create -- --reset-password");
    if (!existing && reset) throw new Error("Sellise e-postiga admini ei leitud");

    const name = existing?.name ?? (process.env.ADMIN_NAME ?? (await ask("Nimi: "))).trim();
    if (!name) throw new Error("Nimi on kohustuslik");

    const password = process.env.ADMIN_PASSWORD ?? (await ask("Parool (min 12 märki): ", true));
    const weakness = validatePasswordStrength(password, email);
    if (weakness) throw new Error(weakness);
    if (interactive && (await ask("Parool uuesti: ", true)) !== password) throw new Error("Paroolid ei kattu");

    const passwordHash = await hashPassword(password);
    if (existing) {
      await db.update(adminUsers).set({ passwordHash, isActive: true }).where(eq(adminUsers.id, existing.id));
      await deleteUserSessions(db, existing.id); // vanad sessioonid kehtetuks
      await writeAudit(db, null, { action: "admin_user.password_reset", entityType: "AdminUser", entityId: existing.id, entityLabel: email });
      console.log(`OK: admini ${email} parool vahetatud, vanad sessioonid lõpetatud.`);
    } else {
      const [created] = await db.insert(adminUsers).values({ email, name, passwordHash }).returning({ id: adminUsers.id });
      await writeAudit(db, null, { action: "admin_user.create", entityType: "AdminUser", entityId: created.id, entityLabel: email });
      console.log(`OK: admin ${email} loodud. Logi sisse: /admin/login`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  const message = error instanceof z.ZodError ? error.issues.map((i) => i.message).join("; ") : error instanceof Error ? error.message : String(error);
  console.error("VIGA:", redactConnectionStrings(message));
  process.exitCode = 1;
});
