import { imagesForDisplay } from "@/domain/images/product-image";
import type { CatalogItem } from "@/domain/catalog/types";
import { cx } from "@/components/ui/class-names";
import { LaptopIllustration } from "./laptop-illustration";
import { StoredImage } from "./stored-image";

/**
 * Toote põhipilt kaardil, ostukorvis ja võrdluses.
 * Pildiala on alati sama kujuga (4:3), pilt "contain" — kaardid jäävad ühekõrgused.
 * Pilte pole → bränditud illustratsioon.
 */
export function ProductImage({ item, sizes, priority, className }: { item: CatalogItem; sizes: string; priority?: boolean; className?: string }) {
  const image = imagesForDisplay(item)[0];
  return (
    <div className={cx("relative aspect-[4/3] overflow-hidden bg-white", !image && "bg-surface-alt", className)}>
      {image ? (
        <StoredImage image={image} sizes={sizes} priority={priority} includeLarge={false} screenSizeIn={item.product.screenSizeIn} className="p-3" />
      ) : (
        <LaptopIllustration screenSizeIn={item.product.screenSizeIn} className="absolute inset-0 m-auto h-[80%] w-[80%]" />
      )}
    </div>
  );
}
