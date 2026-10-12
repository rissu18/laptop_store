/**
 * Tech hinnakirja asukoht: TECH_SHEET_URL (Config, mitte saladus) — avalik Google Sheet.
 * XLSX ekspordi URL ehitatakse SIIN (ainus koht); mujal koodis Google Sheetsi aadresse pole.
 * CSV eksporti ei kasutata: müüdud seadmed on tähistatud lahtri taustavärviga ja CSV kaotab selle.
 */

export class TechConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TechConfigError";
  }
}

const SHEET_PATH = /^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})(?:\/|$)/;

/** "https://docs.google.com/spreadsheets/d/<id>/edit…" → "https://docs.google.com/spreadsheets/d/<id>/export?format=xlsx" */
export function techXlsxExportUrl(sheetUrl: string): string {
  let url: URL;
  try {
    url = new URL(sheetUrl.trim());
  } catch {
    throw new TechConfigError("TECH_SHEET_URL ei ole kehtiv URL");
  }
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com" || url.username || url.password) {
    throw new TechConfigError("TECH_SHEET_URL peab olema https://docs.google.com/spreadsheets/… aadress");
  }
  const match = url.pathname.match(SHEET_PATH);
  if (!match) throw new TechConfigError("TECH_SHEET_URL-ist ei leitud tabeli ID-d (/spreadsheets/d/<id>)");
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=xlsx`;
}

export function readTechConfig(env: Record<string, string | undefined> = process.env): { sheetUrl: string; exportUrl: string } {
  const sheetUrl = env.TECH_SHEET_URL?.trim();
  if (!sheetUrl) throw new TechConfigError("TECH_SHEET_URL puudub");
  return { sheetUrl, exportUrl: techXlsxExportUrl(sheetUrl) };
}

export function isTechConfigured(env: Record<string, string | undefined> = process.env): boolean {
  try {
    readTechConfig(env);
    return true;
  } catch {
    return false;
  }
}
