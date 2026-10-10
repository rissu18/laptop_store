/**
 * Jagatud nii proxy.ts (Edge/Node vahekiht) kui serveri koodi jaoks — siin ei tohi olla server-only importe.
 *
 * Productionis kasutatakse `__Host-` eesliidet: brauser aktsepteerib sellist küpsist ainult siis, kui see on
 * Secure, path=/ ja ilma domeenita — alamdomeen ei saa seda üle kirjutada.
 */
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-admin_session" : "admin_session";

export const ADMIN_LOGIN_PATH = "/admin/login";

/** Pärast sisselogimist suunatakse ainult admini enda lehtedele (open redirect kaitse). */
export function safeAdminRedirect(target: unknown): string {
  if (typeof target !== "string") return "/admin";
  if (!target.startsWith("/admin") || target.startsWith("//") || target.includes("\\") || target.startsWith(ADMIN_LOGIN_PATH)) return "/admin";
  return target;
}
