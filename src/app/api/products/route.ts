import { LaptopidApiError, fetchLaptopidRaw, isLaptopidConfigured } from "@/integrations/laptopid/laptopid-client";
import { LaptopidSnapshotError, parseLaptopidSnapshot } from "@/integrations/laptopid/laptopid-snapshot";
import { getCurrentAdmin } from "@/server/auth/auth";

/**
 * Laptopid.ee API diagnostika (AINULT sisselogitud admin): näitab, kuidas sync praegust API vastust näeb —
 * normaliseeritud pakkumised + tagasi lükatud kirjed. Ei kirjuta andmebaasi.
 *
 * Pood, otsing, ostukorv ega kassa seda otspunkti EI kasuta: nemad loevad PostgreSQL-i (sync täidab selle,
 * vt docs/LAPTOPID_SYNC.md). Varem oli see avalik 5-minutilise CDN-vahemäluga koopia tarnija voost — see
 * avaldas API võtmega kaitstud andmed kõigile ja lisas sync'i ette veel ühe vahemälukihi.
 */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!isLaptopidConfigured()) return Response.json({ error: "Laptopid API ei ole seadistatud" }, { status: 503, headers });

  try {
    const raw = await fetchLaptopidRaw();
    const snapshot = parseLaptopidSnapshot(raw.products, raw.images);
    return Response.json(
      {
        fetchedAt: raw.fetchedAt.toISOString(),
        durationMs: raw.durationMs,
        received: snapshot.receivedCount,
        valid: snapshot.offers.length,
        images: snapshot.imageCount,
        rejected: snapshot.rejected,
        offers: snapshot.offers.map(({ raw: _raw, ...offer }) => {
          void _raw;
          return offer;
        }),
      },
      { headers },
    );
  } catch (error) {
    if (error instanceof LaptopidApiError || error instanceof LaptopidSnapshotError) {
      return Response.json({ error: error.message, code: error.code }, { status: 502, headers });
    }
    throw error;
  }
}
