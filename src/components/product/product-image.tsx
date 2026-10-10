import Image from "next/image";
import type { CatalogItem } from "@/domain/catalog/types";
import { cx } from "@/components/ui/class-names";
import { LaptopIllustration, type IllustrationView } from "./laptop-illustration";

/**
 * Toote pilt: päris foto (next/image → WebP/AVIF, lazy loading) või neutraalne illustratsioon.
 */
export function ProductImage({
  item,
  index = 0,
  sizes,
  priority,
  className,
}: {
  item: CatalogItem;
  index?: number;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  const image = item.variant.images[index];
  return (
    <div className={cx("relative aspect-[4/3] overflow-hidden bg-surface-alt", className)}>
      {image ? (
        <Image
          src={image.url}
          alt={image.alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-contain p-4 mix-blend-multiply"
        />
      ) : (
        <LaptopIllustration
          view={(["front", "closed", "side"] as IllustrationView[])[index % 3]}
          screenSizeIn={item.product.screenSizeIn}
          className="absolute inset-0 m-auto h-[80%] w-[80%]"
        />
      )}
    </div>
  );
}
