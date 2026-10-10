import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DiscountActions } from "@/components/admin/discount-actions";
import { DiscountForm, type DiscountFormDefaults } from "@/components/admin/discount-form";
import { DiscountPreview } from "@/components/admin/discount-preview";
import { Card, DefinitionList, PageHeader, StatusBadge } from "@/components/admin/ui";
import { formatDiscountValue } from "@/domain/discounts/discount-engine";
import { toTallinnLocalInput, formatTallinnDateTime } from "@/domain/time/tallinn";
import { updateDiscountAction } from "@/server/admin/discounts/actions";
import { getDiscountDetail, getDiscountTargetOptions } from "@/server/admin/discounts/queries";
import { uuidParam } from "@/server/admin/search-params";

/** Admin on alati päringupõhine (sessioon, värsked andmed) — eelrenderdust ega "instant" navigeerimist ei kasutata. */
export const instant = false;

export const metadata: Metadata = { title: "Sooduskood" };

const euros = (cents: number | null) => (cents === null ? "" : String(cents / 100).replace(".", ","));

export default async function DiscountDetailPage({ params }: PageProps<"/admin/discounts/[id]">) {
  const id = uuidParam((await params).id);
  if (!id) notFound();
  const [detail, options] = await Promise.all([getDiscountDetail(id), getDiscountTargetOptions()]);
  if (!detail) notFound();
  const { discount: d, effectiveStatus, targets, redemptions } = detail;
  const archived = d.status === "ARCHIVED";

  const defaults: DiscountFormDefaults = {
    code: d.code,
    name: d.name,
    internalDescription: d.internalDescription ?? "",
    type: d.type,
    value: d.type === "FREE_SHIPPING" ? "0" : String(d.value / 100).replace(".", ","),
    maximumDiscount: euros(d.maximumDiscountCents),
    minimumSubtotal: euros(d.minimumSubtotalCents),
    startsAt: toTallinnLocalInput(d.startsAt),
    expiresAt: toTallinnLocalInput(d.expiresAt),
    usageLimit: d.usageLimit === null ? "" : String(d.usageLimit),
    scope: d.scope,
    manufacturers: targets.manufacturers,
    productModelIds: targets.includedModelIds,
    listingIds: targets.includedListingIds,
    excludedProductModelIds: targets.excludedModelIds,
    excludedListingIds: targets.excludedListingIds,
    respectMinimumMargin: d.respectMinimumMargin,
  };

  return (
    <>
      <PageHeader
        title={d.code}
        breadcrumbs={[{ label: "Sooduskoodid", href: "/admin/discounts" }, { label: d.code }]}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={effectiveStatus} />
            <span>{d.name}</span>
            <span>· {formatDiscountValue(d)}</span>
          </span>
        }
        actions={<DiscountActions id={d.id} code={d.code} status={d.status} showEdit={false} />}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          {archived ? (
            <Card title="Arhiveeritud">
              <p className="text-sm text-muted">Arhiveeritud koodi ei saa muuta ega uuesti aktiveerida. Kampaania kordamiseks kasuta „Duplikeeri“.</p>
            </Card>
          ) : (
            <DiscountForm
              key={d.updatedAt.toISOString()}
              mode="edit"
              defaults={defaults}
              models={options.models}
              listings={options.listings}
              codeLocked={d.usageCount > 0}
              action={updateDiscountAction.bind(null, d.id)}
            />
          )}
        </div>
        <aside className="flex min-w-0 flex-col gap-6">
          <DiscountPreview id={d.id} listings={options.listings} />
          <Card title="Kasutus">
            <DefinitionList
              items={[
                { label: "Kinnitatud kasutusi", value: `${d.usageCount} / ${d.usageLimit ?? "∞"}` },
                { label: "Reserveeritud (ootel tellimused)", value: String(redemptions?.pending ?? 0) },
              ]}
            />
            <p className="mt-3 text-xs text-muted">
              Koodi kontrollimine ostukorvis ei ole kasutus. Kasutus loetakse alles kinnitatud tellimusest — see aktiveerub koos tellimuste ja maksete süsteemiga. Kasutuste ajalugu ilmub siia samal ajal.
            </p>
          </Card>
          <Card title="Ajalugu">
            <DefinitionList
              items={[
                { label: "Loodud", value: formatTallinnDateTime(d.createdAt) },
                { label: "Lõi", value: d.createdBy },
                { label: "Muudetud", value: formatTallinnDateTime(d.updatedAt) },
                { label: "Muutis", value: d.updatedBy },
                { label: "Kehtib alates", value: formatTallinnDateTime(d.startsAt) ?? "kohe" },
                { label: "Kehtib kuni", value: formatTallinnDateTime(d.expiresAt) ?? "tähtajatu" },
              ]}
            />
            <Link href={`/admin/system/activity?entity=${d.id}`} className="mt-3 inline-block text-sm text-primary hover:underline">
              Muudatuste ajalugu →
            </Link>
          </Card>
        </aside>
      </div>
    </>
  );
}
