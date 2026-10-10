import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MockSupplierAdapter } from "@/integrations/supplier/mock/mock-supplier-adapter";
import { buildDataQualityOverview, describeReason } from "@/server/images/data-quality";
import { readImageManifestSync, readMatchesSync } from "@/server/images/image-repository";
import { groupOffersIntoModels } from "@/server/images/product-models";

export const metadata: Metadata = { title: "Andmekvaliteet (arendus)", robots: { index: false, follow: false } };

/**
 * Tootepiltide Data Quality vaade.
 * AINULT ARENDUSES: admin-autentimine tuleb Phase 3-s; seni on leht productionis 404.
 * Toimingud (kinnita, lükka tagasi, peida pilt, uuesti otsi) tehakse käsurealt: npm run icecat -- …
 */
export default async function DataQualityPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const { offers } = await new MockSupplierAdapter().getProducts();
  const models = groupOffersIntoModels(offers).map((m) => ({ id: m.model.id, title: m.model.title, listingCount: m.offerCount }));
  const o = buildDataQualityOverview(models, readMatchesSync(), readImageManifestSync());

  const cards = [
    { label: "Mudeleid kokku", value: o.modelsTotal },
    { label: "Pildiga", value: o.images.withImages },
    { label: "Ilma pildita", value: o.images.withoutImages },
    { label: "Pildikate", value: `${o.images.coveragePct}%` },
    { label: "Icecat: leitud", value: o.icecat.MATCHED },
    { label: "Vajab ülevaatust", value: o.icecat.NEEDS_REVIEW },
    { label: "Ei leitud", value: o.icecat.NOT_FOUND },
    { label: "Viga", value: o.icecat.ERROR },
    { label: "Ainult põhipilt", value: o.gallery.mainImageOnly },
    { label: "Mitu pilti", value: o.gallery.multipleImages },
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <p className="text-sm font-semibold text-warning">Arenduse vaade — productionis peidetud kuni admin-autentimiseni</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Tootepiltide andmekvaliteet</h1>

      <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-border p-4">
            <dt className="text-xs text-muted">{card.label}</dt>
            <dd className="tabular mt-1 text-2xl font-bold">{card.value}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-12 text-xl font-bold">Mudelid ilma pildita ({o.modelsWithoutImages.length})</h2>
      <table className="mt-4 w-full text-left text-sm">
        <thead className="text-muted">
          <tr>
            <th className="py-2 pr-4">Mudel</th>
            <th className="py-2 pr-4">Pakkumisi</th>
            <th className="py-2 pr-4">Staatus</th>
            <th className="py-2">Mida teha</th>
          </tr>
        </thead>
        <tbody>
          {o.modelsWithoutImages.map((row) => (
            <tr key={row.id} className="border-t border-border align-top">
              <td className="py-2 pr-4 font-medium">
                {row.title}
                <div className="font-mono text-xs text-muted">{row.id}</div>
              </td>
              <td className="tabular py-2 pr-4">{row.listingCount}</td>
              <td className="py-2 pr-4">{row.match?.status ?? "–"}</td>
              <td className="py-2 text-muted">
                {describeReason(row.match)}
                {row.match?.icecatTitle && <div className="mt-1 text-xs">Icecat {row.match.icecatId}: {row.match.icecatTitle}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-12 text-xl font-bold">Kõik mudelid</h2>
      <table className="mt-4 w-full text-left text-sm">
        <thead className="text-muted">
          <tr>
            <th className="py-2 pr-4">Mudel</th>
            <th className="py-2 pr-4">Pakkumisi</th>
            <th className="py-2 pr-4">Vaste</th>
            <th className="py-2 pr-4">Kindlus</th>
            <th className="py-2 pr-4">Pilte</th>
            <th className="py-2">Staatus</th>
          </tr>
        </thead>
        <tbody>
          {o.rows.map((row) => (
            <tr key={row.id} className="border-t border-border">
              <td className="py-2 pr-4 font-medium">{row.title}</td>
              <td className="tabular py-2 pr-4">{row.listingCount}</td>
              <td className="py-2 pr-4 text-muted">{row.match?.matchedBy ?? "–"}</td>
              <td className="tabular py-2 pr-4">{row.match?.confidence ?? "–"}</td>
              <td className="tabular py-2 pr-4">
                {row.imageCount}
                {row.hiddenCount > 0 && <span className="text-muted"> (+{row.hiddenCount} peidetud)</span>}
              </td>
              <td className="py-2">{row.match?.status ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-12 rounded-lg bg-surface-alt p-5 text-sm">
        <h2 className="font-semibold">Toimingud (käsurida)</h2>
        <pre className="mt-2 overflow-x-auto text-xs leading-relaxed">{`npm run icecat -- confirm <mudel> <icecatId>   # käsitsi vaste (kõrgeim prioriteet)
npm run icecat -- reject <mudel> <icecatId>    # lükka vaste tagasi
npm run icecat -- images <mudel>               # pildid ja nende ID-d
npm run icecat -- hide <mudel> <pildiId>       # peida eksitav pilt
npm run icecat -- retry <mudel>                # otsi vastet uuesti
npm run icecat -- refresh <mudel>              # lae pildid uuesti alla`}</pre>
      </section>
    </main>
  );
}
