import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { getDb, isDatabaseConfigured } from "@/server/db/client";
import { ADMIN_LOGIN_PATH, SESSION_COOKIE } from "./constants";
import { findSessionAdmin, type SessionAdmin } from "./session-store";

/**
 * Admini autentimise andmepöörduskiht (Data Access Layer).
 *
 * KAITSE KOLM KIHTI:
 *  1. proxy.ts — kiire (optimistlik) suunamine, kui sessiooniküpsist pole üldse.
 *  2. Admini paneeli layout — requireAdmin() kontrollib sessiooni andmebaasist iga päringu juures.
 *  3. IGA server action ja andmepäring — requireAdminAction() kontrollib uuesti (layout'i kontroll üksi ei
 *     kaitse server action'eid, sest neid saab välja kutsuda otse POST päringuga).
 */

export const getCurrentAdmin = cache(async (): Promise<SessionAdmin | null> => {
  if (!isDatabaseConfigured()) return null;
  // Sessioon sõltub päringust ja kellaajast — alati päringu ajal, mitte eelrenderdusel
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return findSessionAdmin(getDb(), token);
});

/** Lehtedele: suunab sisselogimisele, kui sessioon puudub või on aegunud. */
export async function requireAdmin(): Promise<SessionAdmin> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect(ADMIN_LOGIN_PATH);
  return admin;
}

export class UnauthorizedError extends Error {
  constructor(message = "Sessioon on aegunud. Logi uuesti sisse.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * CSRF kaitse (lisaks Next.js-i sisseehitatud Origin/Host kontrollile server action'ites ja SameSite=Strict küpsisele):
 * muutvad päringud peavad tulema samalt saidilt.
 */
export async function assertSameOrigin(): Promise<void> {
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!origin || !host) throw new UnauthorizedError("Päringu päritolu ei saanud kontrollida");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new UnauthorizedError("Vigane päringu päritolu");
  }
  if (originHost !== host) throw new UnauthorizedError("Päring teiselt saidilt on keelatud");
}

/** Server action'itele: päritolu + kehtiv sessioon. Viskab vea (ei suuna), et UI saaks näidata teadet. */
export async function requireAdminAction(): Promise<SessionAdmin> {
  await assertSameOrigin();
  const admin = await getCurrentAdmin();
  if (!admin) throw new UnauthorizedError();
  return admin;
}

export async function getClientMeta(): Promise<{ ip: string; userAgent: string | null }> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return { ip: (forwarded || h.get("x-real-ip") || "unknown").slice(0, 64), userAgent: h.get("user-agent") };
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}

export async function readSessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export async function clearSessionCookie(): Promise<void> {
  // Samad atribuudid kui seadmisel (__Host- küpsis nõuab Secure ka kustutamisel)
  (await cookies()).set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}
