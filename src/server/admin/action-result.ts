/** Admini server action'ite ühtne tulemus (kliendile serialiseeritav). Stack trace'i kliendile ei saadeta. */
export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export const ok = (message: string): ActionResult => ({ ok: true, message });
export const fail = (error: string, fieldErrors?: Record<string, string>): ActionResult => ({ ok: false, error, fieldErrors });
