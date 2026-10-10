"use client";

import { Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/class-names";
import { BRAND_CODES, BRAND_NAMES } from "@/domain/catalog/types";
import { generateCode } from "@/domain/discounts/code";
import { discountFormToObject, parseDiscountForm } from "@/domain/discounts/discount-form";
import type { DiscountActionResult } from "@/server/admin/discounts/actions";
import { inputClass } from "./entity-form";
import { MultiPicker, type PickerOption } from "./multi-picker";
import { useToast } from "./toast";

export interface DiscountFormDefaults {
  code: string;
  name: string;
  internalDescription: string;
  type: "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_SHIPPING";
  value: string;
  maximumDiscount: string;
  minimumSubtotal: string;
  startsAt: string;
  expiresAt: string;
  usageLimit: string;
  scope: "ALL_PRODUCTS" | "SELECTED_MANUFACTURERS" | "SELECTED_PRODUCT_MODELS" | "SELECTED_LISTINGS";
  manufacturers: string[];
  productModelIds: string[];
  listingIds: string[];
  excludedProductModelIds: string[];
  excludedListingIds: string[];
  respectMinimumMargin: boolean;
}

export const EMPTY_DISCOUNT_DEFAULTS: DiscountFormDefaults = {
  code: "",
  name: "",
  internalDescription: "",
  type: "PERCENTAGE",
  value: "",
  maximumDiscount: "",
  minimumSubtotal: "",
  startsAt: "",
  expiresAt: "",
  usageLimit: "",
  scope: "ALL_PRODUCTS",
  manufacturers: [],
  productModelIds: [],
  listingIds: [],
  excludedProductModelIds: [],
  excludedListingIds: [],
  respectMinimumMargin: true,
};

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-border bg-surface p-4 sm:p-5">
      <legend className="px-1 font-semibold">{title}</legend>
      {description && <p className="mb-3 text-sm text-muted">{description}</p>}
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Field({ label, error, hint, wide, children }: { label: string; error?: string; hint?: ReactNode; wide?: boolean; children: ReactNode }) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-1 text-sm", wide && "sm:col-span-2")}>
      <span className="font-medium">{label}</span>
      {children}
      <span className="min-h-4 text-xs">{error ? <span className="text-danger">{error}</span> : <span className="text-muted">{hint}</span>}</span>
    </div>
  );
}

const SCOPES = [
  { value: "ALL_PRODUCTS", label: "Kõikidele toodetele" },
  { value: "SELECTED_MANUFACTURERS", label: "Valitud tootjatele" },
  { value: "SELECTED_PRODUCT_MODELS", label: "Valitud mudelitele" },
  { value: "SELECTED_LISTINGS", label: "Valitud konfiguratsioonidele" },
] as const;

const TYPES = [
  { value: "PERCENTAGE", label: "Protsent", hint: "nt 10%" },
  { value: "FIXED_AMOUNT", label: "Fikseeritud summa", hint: "nt 75 €" },
  { value: "FREE_SHIPPING", label: "Tasuta tarne", hint: "rakendub kassas" },
] as const;

/**
 * Sooduskoodi loomise/muutmise vorm. Valideeritakse kohe brauseris (sama skeem mis serveris),
 * aga ainult serveri valideerimist usaldatakse.
 */
export function DiscountForm({
  mode,
  defaults,
  models,
  listings,
  codeLocked,
  action,
}: {
  mode: "create" | "edit";
  defaults: DiscountFormDefaults;
  models: PickerOption[];
  listings: PickerOption[];
  codeLocked?: boolean;
  action: (prev: DiscountActionResult | null, formData: FormData) => Promise<DiscountActionResult>;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [type, setType] = useState(defaults.type);
  const [scope, setScope] = useState(defaults.scope);
  const [code, setCode] = useState(defaults.code);
  // Enne hüdreerimist on nupp lukus — muidu saadaks brauser vormi tavalise GET päringuna (andmed URL-i)
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const local = parseDiscountForm(discountFormToObject(formData));
        if (!local.success) {
          setErrors(local.fieldErrors);
          toast.error("Kontrolli välju");
          return;
        }
        setErrors({});
        startTransition(async () => {
          const result = await action(null, formData);
          if (result.ok) {
            toast.success(result.message);
            if (mode === "create" && result.id) router.push(`/admin/discounts/${result.id}`);
            else router.refresh();
          } else {
            setErrors(result.fieldErrors ?? {});
            toast.error(result.error);
          }
        });
      }}
    >
      <Section title="Põhiinfo">
        <Field label="Kood" error={errors.code} hint={codeLocked ? "Kood on tellimustes kasutusel — teksti ei saa muuta" : "Suur- ja väiketähed ei loe: GARANTII = garantii"}>
          <div className="flex gap-2">
            <input
              name="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              readOnly={codeLocked}
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
              className={cx(inputClass, "font-mono uppercase")}
              aria-invalid={errors.code ? true : undefined}
            />
            {!codeLocked && (
              <Button type="button" variant="outline" size="sm" className="h-10 shrink-0" onClick={() => setCode(generateCode())}>
                <Wand2 className="size-4" aria-hidden /> Genereeri
              </Button>
            )}
          </div>
        </Field>
        <Field label="Kampaania nimi" error={errors.name}>
          <input name="name" defaultValue={defaults.name} maxLength={120} className={inputClass} aria-invalid={errors.name ? true : undefined} />
        </Field>
        <Field label="Admini märkmed" error={errors.internalDescription} hint="Kliendile ei kuvata" wide>
          <textarea name="internalDescription" defaultValue={defaults.internalDescription} rows={3} maxLength={2000} className={cx(inputClass, "h-auto py-2")} />
        </Field>
      </Section>

      <Section title="Soodustus">
        <div className="flex flex-col gap-2 sm:col-span-2" role="radiogroup" aria-label="Soodustuse tüüp">
          <span className="text-sm font-medium">Tüüp</span>
          <div className="grid gap-2 sm:grid-cols-3">
            {TYPES.map((t) => (
              <label key={t.value} className={cx("flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm", type === t.value ? "border-primary bg-primary-soft" : "border-border")}>
                <input type="radio" name="type" value={t.value} checked={type === t.value} onChange={() => setType(t.value)} className="mt-0.5 accent-[var(--c-primary)]" />
                <span>
                  <span className="block font-medium">{t.label}</span>
                  <span className="text-xs text-muted">{t.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        {type !== "FREE_SHIPPING" ? (
          <Field label={type === "PERCENTAGE" ? "Väärtus (%)" : "Väärtus (€)"} error={errors.value}>
            <input name="value" defaultValue={defaults.value} inputMode="decimal" className={inputClass} aria-invalid={errors.value ? true : undefined} />
          </Field>
        ) : (
          <p className="rounded-md bg-info-soft p-3 text-sm sm:col-span-2">
            Tasuta tarne arvestatakse tellimuse vormistamisel. Ostukorvis näidatakse koodi kehtivust, aga tarneviisi ja -hinda valitakse alles kassas (lisandub koos kassaga).
            <input type="hidden" name="value" value="0" />
          </p>
        )}
        {type === "PERCENTAGE" && (
          <Field label="Maksimaalne soodustus (€)" error={errors.maximumDiscount} hint="Tühi = piiranguta. Nt 10%, aga kuni 100 €">
            <input name="maximumDiscount" defaultValue={defaults.maximumDiscount} inputMode="decimal" className={inputClass} />
          </Field>
        )}
      </Section>

      <Section title="Tingimused">
        <Field label="Minimaalne ostukorvi summa (€)" error={errors.minimumSubtotal} hint="Tühi = piiranguta">
          <input name="minimumSubtotal" defaultValue={defaults.minimumSubtotal} inputMode="decimal" className={inputClass} />
        </Field>
        <div className="flex flex-col gap-2 sm:col-span-2" role="radiogroup" aria-label="Kehtib">
          <span className="text-sm font-medium">Kehtib</span>
          {SCOPES.map((s) => (
            <label key={s.value} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name="scope" value={s.value} checked={scope === s.value} onChange={() => setScope(s.value)} className="accent-[var(--c-primary)]" />
              {s.label}
            </label>
          ))}
          {errors.scope && <span className="text-xs text-danger">{errors.scope}</span>}
        </div>
        {scope === "SELECTED_MANUFACTURERS" && (
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            {BRAND_CODES.map((brand) => (
              <label key={brand} className="flex min-h-9 items-center gap-2 rounded-md border border-border px-3 text-sm">
                <input type="checkbox" name="manufacturers" value={brand} defaultChecked={defaults.manufacturers.includes(brand)} className="size-4 accent-[var(--c-primary)]" />
                {BRAND_NAMES[brand]}
              </label>
            ))}
          </div>
        )}
        {scope === "SELECTED_PRODUCT_MODELS" && (
          <div className="sm:col-span-2">
            <MultiPicker name="productModelIds" options={models} defaultSelected={defaults.productModelIds} placeholder="Otsi mudelit…" emptyLabel="Mudeleid pole valitud" />
          </div>
        )}
        {scope === "SELECTED_LISTINGS" && (
          <div className="sm:col-span-2">
            <MultiPicker name="listingIds" options={listings} defaultSelected={defaults.listingIds} placeholder="Otsi SKU, mudeli või CPU järgi…" emptyLabel="Konfiguratsioone pole valitud" />
          </div>
        )}
        <div className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-sm font-medium">Välistatud mudelid</span>
          <MultiPicker name="excludedProductModelIds" options={models} defaultSelected={defaults.excludedProductModelIds} placeholder="Otsi mudelit…" emptyLabel="Välistusi pole" />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-sm font-medium">Välistatud konfiguratsioonid</span>
          <p className="text-xs text-muted">Nt väga väikese marginaaliga toode. Välistus on alati ülimuslik.</p>
          <MultiPicker name="excludedListingIds" options={listings} defaultSelected={defaults.excludedListingIds} placeholder="Otsi SKU, mudeli või CPU järgi…" emptyLabel="Välistusi pole" />
        </div>
      </Section>

      <Section title="Kehtivus" description="Eesti aeg. Kehtivust kontrollib server oma kella järgi (mitte kliendi brauser).">
        <Field label="Kehtib alates" error={errors.startsAt} hint="Tühi = kohe">
          <input type="datetime-local" name="startsAt" defaultValue={defaults.startsAt} className={inputClass} />
        </Field>
        <Field label="Kehtib kuni" error={errors.expiresAt} hint="Tühi = tähtajatu">
          <input type="datetime-local" name="expiresAt" defaultValue={defaults.expiresAt} className={inputClass} />
        </Field>
      </Section>

      <Section title="Kasutus ja kaitse">
        <Field label="Kasutuspiirang (kokku)" error={errors.usageLimit} hint="Tühi = piiranguta. Kasutuseks loetakse ainult kinnitatud tellimus (tellimuste süsteemiga).">
          <input name="usageLimit" defaultValue={defaults.usageLimit} inputMode="numeric" className={inputClass} />
        </Field>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="respectMinimumMargin" defaultChecked={defaults.respectMinimumMargin} className="mt-0.5 size-4 accent-[var(--c-primary)]" />
          <span>
            <span className="font-medium">Kaitse minimaalset marginaali</span>
            <span className="block text-xs text-muted">Soodustus ei vii toote hinda alla hinnastamise miinimumkasumi (Hinnastamine → min kasum). Soovitatav jätta sisse.</span>
          </span>
        </label>
      </Section>

      {mode === "create" && (
        <Section title="Olek">
          <div className="flex flex-col gap-2 sm:col-span-2" role="radiogroup" aria-label="Olek">
            <label className="flex min-h-9 items-center gap-2 text-sm">
              <input type="radio" name="status" value="DRAFT" defaultChecked className="accent-[var(--c-primary)]" /> Mustand — ei tööta poes
            </label>
            <label className="flex min-h-9 items-center gap-2 text-sm">
              <input type="radio" name="status" value="ACTIVE" className="accent-[var(--c-primary)]" /> Aktiivne — töötab kehtivusaja jooksul
            </label>
          </div>
        </Section>
      )}

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
        {Object.keys(errors).length > 0 && <p className="mr-auto text-sm text-danger">Kontrolli märgitud välju</p>}
        <Button type="submit" disabled={pending || !hydrated}>
          {pending ? "Salvestan…" : mode === "create" ? "Loo sooduskood" : "Salvesta"}
        </Button>
      </div>
    </form>
  );
}
