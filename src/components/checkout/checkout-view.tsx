"use client";

import { AlertTriangle, Info, Loader2, ShoppingBag } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { handlePlaceOrderResult } from "@/client/checkout-flow";
import { clearCart, setAppliedDiscountCode, useAppliedDiscountCode, useCart } from "@/client/cart-store";
import { Button, ButtonLink } from "@/components/ui/button";
import { cx } from "@/components/ui/class-names";
import { CHECKOUT_COUNTRIES, TERMS_HREF, parseCheckoutForm } from "@/domain/checkout/checkout-form";
import { CHECKOUT_BLOCKED_MESSAGE, TEST_ORDER_NOTICE } from "@/domain/checkout/checkout-mode";
import { formatEur } from "@/domain/money/money";
import { getCheckoutQuoteAction, placeOrderAction, type PlaceOrderActionResult } from "@/server/checkout/checkout-actions";
import type { CheckoutQuote, PriceChange } from "@/server/checkout/checkout-service";

const ATTEMPT_KEY = "checkout:attempt:v1";

/** Ühe kassakatse võti: sama klikkide ja korduste vahel (ka lehe värskendusel), uus pärast edukat tellimust. */
function getAttemptId(): string {
  try {
    const existing = sessionStorage.getItem(ATTEMPT_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(ATTEMPT_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

const inputClass = "h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-base sm:text-sm aria-[invalid=true]:border-danger";

function Field({ name, label, error, required, children, wide, hint }: { name: string; label: string; error?: string; required?: boolean; children?: ReactNode; wide?: boolean; hint?: string }) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-1", wide && "sm:col-span-2")}>
      <label htmlFor={`co-${name}`} className="text-sm font-medium">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      {children}
      {error ? (
        <p id={`co-${name}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-border bg-surface p-4 sm:p-5">
      <legend className="px-1 text-lg font-semibold">{title}</legend>
      <div className="mt-2 grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Summary({ quote }: { quote: CheckoutQuote }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h2 className="text-lg font-semibold">Tellimuse kokkuvõte</h2>
      <ul className="mt-4 divide-y divide-border">
        {quote.lines.map((line) => (
          <li key={line.variantId} className="flex gap-3 py-3">
            <span className="relative size-14 shrink-0 overflow-hidden rounded border border-border bg-white">
              {line.imageUrl && <Image src={line.imageUrl} alt="" fill sizes="56px" className="object-contain" />}
            </span>
            <span className="min-w-0 flex-1 text-sm">
              <span className="block font-medium">{line.title}</span>
              <span className="block text-xs text-muted">{line.specLine}</span>
              <span className="block text-xs text-muted">
                {line.quantity} × {formatEur(line.unitPriceCents)}
              </span>
            </span>
            <span className="tabular shrink-0 text-sm font-semibold">{formatEur(line.lineSubtotalCents)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">Vahesumma</dt>
          <dd className="tabular">{formatEur(quote.subtotalCents)}</dd>
        </div>
        {quote.discount && (
          <div className="flex justify-between text-success">
            <dt>{quote.discount.code}</dt>
            <dd className="tabular">{quote.discount.amountCents ? `−${formatEur(quote.discount.amountCents)}` : "tasuta tarne"}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-muted">Tarne ({quote.shipping.name})</dt>
          <dd className="tabular">{quote.shipping.amountCents === 0 ? "0,00 €" : formatEur(quote.shipping.amountCents)}</dd>
        </div>
      </dl>
      <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
        <span className="font-semibold">Kokku</span>
        <span className="tabular text-2xl font-bold">{formatEur(quote.totalCents)}</span>
      </div>
      <p className="mt-1 text-xs text-muted">Hinnad sisaldavad käibemaksu.</p>
    </div>
  );
}

export function CheckoutView() {
  const router = useRouter();
  const refs = useCart();
  const appliedCode = useAppliedDiscountCode();
  const [quote, setQuote] = useState<CheckoutQuote | null | "error">(null);
  const [isCompany, setIsCompany] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [review, setReview] = useState<{ messages: string[]; priceChanges: PriceChange[] } | null>(null);
  const [failure, setFailure] = useState<{ message: string; errorId?: string } | null>(null);
  const [submitting, startSubmit] = useTransition();
  const [, startLoad] = useTransition();
  const submittedRef = useRef(false);
  const key = JSON.stringify([refs, appliedCode]);

  useEffect(() => {
    if (refs.length === 0) return;
    startLoad(async () => {
      const result = await getCheckoutQuoteAction(refs, appliedCode);
      setQuote(result ?? "error");
      setReview(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (refs.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center rounded-lg border border-dashed border-border-strong bg-surface px-6 py-16 text-center">
        <ShoppingBag className="size-10 text-muted" aria-hidden />
        <h2 className="mt-4 text-lg font-semibold">Ostukorv on tühi</h2>
        <ButtonLink href="/sulearvutid" className="mt-6">
          Vaata sülearvuteid
        </ButtonLink>
      </div>
    );
  }
  if (quote === null) return <div className="h-96 animate-pulse rounded-lg bg-surface-sunken" aria-label="Laen kassat" />;
  if (quote === "error") return <p className="rounded-md bg-danger-soft p-4 text-danger">Kassat ei õnnestunud laadida. Proovi lehte värskendada.</p>;
  if (quote.mode === "BLOCKED") return <p className="rounded-md bg-warning-soft p-4 text-warning">{CHECKOUT_BLOCKED_MESSAGE}</p>;

  const blockingIssues = quote.issues.length > 0;

  const submit = (form: HTMLFormElement) => {
    if (submittedRef.current || submitting) return; // topeltklikk
    const data = new FormData(form);
    const values = {
      firstName: data.get("firstName"),
      lastName: data.get("lastName"),
      email: data.get("email"),
      phone: data.get("phone"),
      addressLine1: data.get("addressLine1"),
      addressLine2: data.get("addressLine2"),
      city: data.get("city"),
      postalCode: data.get("postalCode"),
      country: data.get("country"),
      isCompany,
      companyName: data.get("companyName") ?? "",
      companyRegistryCode: data.get("companyRegistryCode") ?? "",
      companyVatNumber: data.get("companyVatNumber") ?? "",
      customerNote: data.get("customerNote"),
      acceptTerms: data.get("acceptTerms") === "on",
    };
    const local = parseCheckoutForm(values);
    if (!local.success) {
      setErrors(local.fieldErrors);
      form.querySelector<HTMLElement>(`[name="${Object.keys(local.fieldErrors)[0]}"]`)?.focus();
      return;
    }
    setErrors({});
    setFailure(null);
    submittedRef.current = true;
    startSubmit(async () => {
      let result: PlaceOrderActionResult;
      try {
        result = await placeOrderAction({
          checkoutAttemptId: getAttemptId(),
          items: refs,
          couponCode: appliedCode,
          form: values,
          acknowledged: {
            lines: quote.lines.map((l) => ({ variantId: l.variantId, unitPriceCents: l.unitPriceCents })),
            totalCents: quote.totalCents,
            discountCents: quote.discount?.amountCents ?? 0,
          },
        });
      } catch {
        result = { ok: false, kind: "ERROR", message: "Ühendus katkes. Proovi uuesti — sama tellimust topelt ei looda." };
      }
      // Ostukorv tühjendatakse alles siis, kui server kinnitas tellimuse loomise
      const outcome = handlePlaceOrderResult(result, {
        clearCart,
        navigate: (url) => router.push(url),
        forgetAttempt: () => {
          try {
            sessionStorage.removeItem(ATTEMPT_KEY);
          } catch {
            /* privaatrežiim */
          }
        },
      });
      if (outcome === "DONE" || result.ok) return;
      submittedRef.current = false;
      if (result.kind === "VALIDATION") setErrors(result.fieldErrors);
      else if (result.kind === "REVIEW") {
        setQuote(result.quote);
        setReview({ messages: result.messages, priceChanges: result.priceChanges });
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else setFailure({ message: result.message, errorId: result.errorId });
    });
  };

  const fieldProps = (name: string) => ({
    id: `co-${name}`,
    name,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `co-${name}-error` : undefined,
    className: inputClass,
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit(event.currentTarget);
      }}
      className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_380px]"
    >
      <div className="flex min-w-0 flex-col gap-6">
        {quote.mode === "TEST" && (
          <div role="note" className="flex gap-3 rounded-lg border border-warning/40 bg-warning-soft p-4 text-sm">
            <Info className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
            <div>
              <p className="font-semibold">{TEST_ORDER_NOTICE}</p>
              <p className="mt-1 text-muted">Ära sisesta testimiseks päris tundlikke andmeid.</p>
            </div>
          </div>
        )}

        {(review || blockingIssues) && (
          <div role="alert" className="rounded-lg border border-danger/40 bg-danger-soft p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-danger">
              <AlertTriangle className="size-5" aria-hidden /> Kontrolli tellimust
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {(review?.messages ?? quote.issues.map((i) => i.message)).map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            {review && review.priceChanges.length > 0 && (
              <table className="mt-3 w-full text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="py-1 font-medium">Toode</th>
                    <th className="py-1 text-right font-medium">Vana hind</th>
                    <th className="py-1 text-right font-medium">Uus hind</th>
                  </tr>
                </thead>
                <tbody>
                  {review.priceChanges.map((c) => (
                    <tr key={c.variantId}>
                      <td className="py-1 pr-2">{c.title}</td>
                      <td className="py-1 text-right text-muted line-through">{formatEur(c.oldCents)}</td>
                      <td className="py-1 text-right font-semibold">{formatEur(c.newCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {blockingIssues ? (
              <ButtonLink href="/ostukorv" variant="outline" size="sm" className="mt-3">
                Muuda ostukorvi
              </ButtonLink>
            ) : quote.discountError && appliedCode ? (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setAppliedDiscountCode(null)}>
                Eemalda sooduskood
              </Button>
            ) : (
              <p className="mt-2 text-xs text-muted">Kokkuvõte on uuendatud. Kui summa sobib, esita tellimus uuesti.</p>
            )}
          </div>
        )}

        <Section title="Kontakt">
          <Field name="firstName" label="Eesnimi" required error={errors.firstName}>
            <input {...fieldProps("firstName")} autoComplete="given-name" maxLength={60} />
          </Field>
          <Field name="lastName" label="Perekonnanimi" required error={errors.lastName}>
            <input {...fieldProps("lastName")} autoComplete="family-name" maxLength={60} />
          </Field>
          <Field name="email" label="E-post" required error={errors.email} hint="Tellimuse otsinguks on vaja tellimuse numbrit ja e-posti">
            <input {...fieldProps("email")} type="email" autoComplete="email" maxLength={200} />
          </Field>
          <Field name="phone" label="Telefon" required error={errors.phone}>
            <input {...fieldProps("phone")} type="tel" autoComplete="tel" maxLength={20} placeholder="+372 5123 4567" />
          </Field>
        </Section>

        <Section title="Tarne">
          <Field name="addressLine1" label="Aadress" required error={errors.addressLine1} wide>
            <input {...fieldProps("addressLine1")} autoComplete="address-line1" maxLength={120} placeholder="Tänav, maja, korter" />
          </Field>
          <Field name="addressLine2" label="Aadressi täpsustus" error={errors.addressLine2} wide>
            <input {...fieldProps("addressLine2")} autoComplete="address-line2" maxLength={120} />
          </Field>
          <Field name="city" label="Linn" required error={errors.city}>
            <input {...fieldProps("city")} autoComplete="address-level2" maxLength={60} />
          </Field>
          <Field name="postalCode" label="Postiindeks" required error={errors.postalCode}>
            <input {...fieldProps("postalCode")} autoComplete="postal-code" inputMode="numeric" maxLength={12} />
          </Field>
          <Field name="country" label="Riik" error={errors.country}>
            <select {...fieldProps("country")} defaultValue="EE" autoComplete="country">
              {Object.entries(CHECKOUT_COUNTRIES).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Tarneviis</span>
            <p className="flex min-h-11 items-center rounded-md border border-border bg-surface-alt px-3">
              {quote.shipping.name} — {quote.shipping.amountCents === 0 ? "tasuta" : formatEur(quote.shipping.amountCents)}
            </p>
          </div>
        </Section>

        <fieldset className="rounded-lg border border-border bg-surface p-4 sm:p-5">
          <legend className="px-1 text-lg font-semibold">Ettevõte</legend>
          <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={isCompany} onChange={(e) => setIsCompany(e.target.checked)} className="size-5 accent-[var(--c-primary)]" />
            Ostan ettevõttele
          </label>
          {isCompany && (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field name="companyName" label="Ettevõtte nimi" required error={errors.companyName} wide>
                <input {...fieldProps("companyName")} autoComplete="organization" maxLength={120} />
              </Field>
              <Field name="companyRegistryCode" label="Registrikood" required error={errors.companyRegistryCode}>
                <input {...fieldProps("companyRegistryCode")} inputMode="numeric" maxLength={20} />
              </Field>
              <Field name="companyVatNumber" label="KMKR number" error={errors.companyVatNumber}>
                <input {...fieldProps("companyVatNumber")} maxLength={20} placeholder="EE101234567" />
              </Field>
            </div>
          )}
        </fieldset>

        <Section title="Märkus">
          <Field name="customerNote" label="Tellimuse märkus" error={errors.customerNote} wide>
            <textarea {...fieldProps("customerNote")} rows={3} maxLength={1000} className={cx(inputClass, "h-auto py-2")} />
          </Field>
        </Section>

        <Section title="Makse">
          <p className="text-sm text-muted sm:col-span-2">
            {quote.mode === "TEST" ? "Testtellimuse eest makset ei võeta. Makseviis lisatakse enne poe avamist." : "Makseviis lisatakse enne poe avamist."}
          </p>
        </Section>
      </div>

      <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <Summary quote={quote} />
        {failure && (
          <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
            {failure.message}
            {failure.errorId && <span className="mt-1 block text-xs">Veakood: {failure.errorId}</span>}
          </p>
        )}
        <div className="flex flex-col gap-1">
          <label className="flex min-h-11 items-start gap-2 text-sm">
            <input
              type="checkbox"
              id="co-acceptTerms"
              name="acceptTerms"
              defaultChecked={false}
              aria-invalid={errors.acceptTerms ? true : undefined}
              aria-describedby={errors.acceptTerms ? "co-acceptTerms-error" : undefined}
              className="mt-0.5 size-5 shrink-0 accent-[var(--c-primary)]"
            />
            <span>
              Olen tutvunud ja nõustun{" "}
              <Link href={TERMS_HREF} target="_blank" className="underline">
                E-poe tingimustega
              </Link>
              .<span className="text-danger"> *</span>
            </span>
          </label>
          {errors.acceptTerms && (
            <p id="co-acceptTerms-error" className="text-xs text-danger">
              {errors.acceptTerms}
            </p>
          )}
        </div>
        <Button type="submit" size="lg" fullWidth disabled={submitting || blockingIssues || quote.lines.length === 0}>
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden /> Tellimust luuakse...
            </>
          ) : review ? (
            quote.mode === "TEST" ? "Kinnitan uue summa — esita testtellimus" : "Kinnitan uue summa"
          ) : quote.mode === "TEST" ? (
            "Esita testtellimus"
          ) : (
            "Esita tellimus"
          )}
        </Button>
        {quote.mode === "TEST" && <p className="text-center text-xs text-muted">Testtellimus salvestatakse, aga makset ei võeta ja tellimust ei täideta.</p>}
        <p className="text-center text-xs text-muted">
          Tellimuse esitamisel töödeldakse sinu andmeid tellimuse täitmiseks.{" "}
          <Link href="/info/muugitingimused" className="underline">
            E-poe tingimused
          </Link>{" "}
          ·{" "}
          <Link href="/info/privaatsus" className="underline">
            Isikuandmed ja privaatsus
          </Link>
        </p>
      </aside>
    </form>
  );
}
