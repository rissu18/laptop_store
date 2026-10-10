/**
 * Structured data (schema.org) Google'i jaoks.
 * `<` asendatakse, et andmetes olev tekst ei saaks script-tag'i "katki teha" (XSS kaitse).
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
