/**
 * Admini kasutaja kustutamine: npm run admin:delete -- <e-post>
 * (nt ajutise testkasutaja eemaldamiseks). Sessioonid kustuvad kaskaadiga; audit logi jääb alles.
 */
import "./lib/load-env";
import { eq } from "drizzle-orm";
import { writeAudit } from "@/server/admin/audit";
import { createDb } from "@/server/db/client";
import { redactConnectionStrings, resolveDatabaseUrl } from "@/server/db/database-url";
import { adminUsers } from "@/server/db/schema";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Kasutus: npm run admin:delete -- <e-post>");
  const url = resolveDatabaseUrl("direct");
  if (!url) throw new Error("DATABASE_URL puudub");
  const { db, pool } = createDb(url);
  try {
    const deleted = await db.delete(adminUsers).where(eq(adminUsers.email, email)).returning({ id: adminUsers.id });
    if (!deleted.length) throw new Error("Sellise e-postiga admini ei leitud");
    await writeAudit(db, null, { action: "admin_user.delete", entityType: "AdminUser", entityId: deleted[0].id, entityLabel: email });
    console.log(`OK: admin ${email} kustutatud.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("VIGA:", redactConnectionStrings(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
