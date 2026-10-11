<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Projekti püsireeglid (Sülearvutid.ee)

- Custom Next.js e-pood; ära lisa WordPressi, WooCommerce'i ega muud e-poe platvormi. Andmebaas: PostgreSQL (Neon) + Drizzle.
- ProductModel (mudel) ja SupplierListing (konkreetne müüdav konfiguratsioon) on eri mõisted; sama mudeli konfiguratsioonid jäävad eraldi tootekaartideks.
- Tarnija andmed on konfiguratsiooni spetsifikatsioonide tõeallikas; Icecat on mudeli piltide allikas ega kirjuta konfiguratsiooni andmeid üle.
- Puuduv tarnija väärtus jääb NULL-iks — vaikeväärtusi ei leiutata.
- Saladusi ja .env faile ei commit'ita, ei logita ega kuvata.
- Raha, hinnad, soodustused ja kassa summad arvutab ainult server.
- Admini parandusi (`manual_overrides`) ei tohi tarnija sync üle kirjutada.
- Ära alusta Foxway integratsiooni, makseid ega storefronti redesign'i ilma kasutaja selge käsuta.
- Enne arendustöö lõpetamist: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Suuremate muudatuste järel uuenda docs/ ja CHANGELOG.md. Seis ja ajalugu: docs/HANDOFF.md.

## Kataloogi reeglid (Laptopid.ee sync)

- Pood, otsing, ostukorv ja kassa loevad kataloogi AINULT PostgreSQL-ist (catalog-service / computeCheckout). Ära tee runtime päringuid Laptopid.ee API-sse — andmed tulevad sync'iga (docs/LAPTOPID_SYNC.md).
- Laoseis: `available` + `stock` (NULL = kogus teadmata). Teadmata kogust ära kuva ega käsitle kui "1 tk"; kasuta `src/domain/catalog/availability.ts`.
- Laptopid `sale_price`/`new_price` ei ole ostuhind — `supplier_price_cents` jääb NULL. Sync ei puuduta `manual_overrides`, `status` ega admini välju.

