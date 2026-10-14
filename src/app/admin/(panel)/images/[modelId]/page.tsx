import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IcecatPanel } from "@/components/admin/icecat-panel";
import { ImageManager } from "@/components/admin/image-manager";
import { EmptyState, PageHeader } from "@/components/admin/ui";
import { adminModelTitle } from "@/domain/admin/display";
import { getModelImages } from "@/server/admin/images/queries";
import { uuidParam } from "@/server/admin/search-params";

/** Admin on alati päringupõhine (sessioon, värsked andmed) — eelrenderdust ega "instant" navigeerimist ei kasutata. */
export const instant = false;

export const metadata: Metadata = { title: "Mudeli pildid" };

export default async function ModelImagesPage({ params }: PageProps<"/admin/images/[modelId]">) {
  const id = uuidParam((await params).modelId);
  if (!id) notFound();
  const data = await getModelImages(id);
  if (!data) notFound();
  const { model, images, icecat } = data;
  const title = adminModelTitle(model);

  return (
    <>
      <PageHeader
        title={`Pildid: ${title}`}
        breadcrumbs={[{ label: "Pildid", href: "/admin/images" }, { label: title }]}
        description={
          <>
            {images.filter((i) => !i.isHidden).length} nähtavat / {images.length} kokku ·{" "}
            <Link href={`/admin/products/models/${model.id}`} className="text-primary hover:underline">
              Mudeli andmed
            </Link>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        {images.length === 0 ? (
          <EmptyState title="Pilte pole" description="Poes kuvatakse placeholder. Otsi Icecatist vastet või kinnita vaste käsitsi." />
        ) : (
          <ImageManager
            images={images.map((image) => ({
              id: image.id,
              thumbnailPath: image.thumbnailPath,
              mediumPath: image.mediumPath,
              alt: image.alt,
              source: image.source,
              sourceId: image.sourceId,
              type: image.type,
              position: image.position,
              isMain: image.isMain,
              isHidden: image.isHidden,
              width: image.width,
              height: image.height,
            }))}
          />
        )}
        <aside>
          <IcecatPanel modelId={model.id} icecat={icecat} downloadEnabled={!process.env.VERCEL} />
        </aside>
      </div>
    </>
  );
}
