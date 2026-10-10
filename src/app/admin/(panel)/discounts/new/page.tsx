import type { Metadata } from "next";
import { DiscountForm, EMPTY_DISCOUNT_DEFAULTS } from "@/components/admin/discount-form";
import { PageHeader } from "@/components/admin/ui";
import { createDiscountAction } from "@/server/admin/discounts/actions";
import { getDiscountTargetOptions } from "@/server/admin/discounts/queries";

/** Admin on alati päringupõhine (sessioon, värsked andmed) — eelrenderdust ega "instant" navigeerimist ei kasutata. */
export const instant = false;

export const metadata: Metadata = { title: "Uus sooduskood" };

export default async function NewDiscountPage() {
  const { models, listings } = await getDiscountTargetOptions();
  return (
    <>
      <PageHeader
        title="Uus sooduskood"
        breadcrumbs={[{ label: "Sooduskoodid", href: "/admin/discounts" }, { label: "Uus" }]}
        description="Soovitus: loo kood mustandina, testi seda eelvaates ja aktiveeri siis."
      />
      <div className="max-w-4xl">
        <DiscountForm mode="create" defaults={EMPTY_DISCOUNT_DEFAULTS} models={models} listings={listings} action={createDiscountAction} />
      </div>
    </>
  );
}
