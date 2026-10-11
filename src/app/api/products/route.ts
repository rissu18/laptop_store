import { NextResponse } from "next/server";

const PRODUCTS_URL =
  "https://laptopid.ee/api/sulearvutid/products.php";

const IMAGES_URL =
  "https://laptopid.ee/api/sulearvutid/images.php";

type RawProduct = {
  id: string | number;
  manufacturer: string;
  model: string;

  cpu: string | null;
  ram: string | null;
  storage: string | null;
  screen: string | null;
  gpu: string | null;
  os: string | null;

  usb_c: string | number | null;
  usb_2: string | number | null;
  usb_3: string | number | null;

  thunderbolt_3: string | number | null;
  thunderbolt_4: string | number | null;

  hdmi: string | number | null;
  displayport: string | number | null;
  vga: string | number | null;
  dvi: string | number | null;
  lan: string | number | null;

  sd_card_reader: string | number | null;
  smartcard_reader: string | number | null;

  webcam: string | number | null;
  ir_camera: string | number | null;
  fingerprint_reader: string | number | null;

  docking_support: string | number | null;
  backlit_keyboard: string | number | null;
  keyboard_layout: string | null;

  touchpad: string | number | null;
  pointing_stick: string | number | null;
  numpad: string | number | null;

  mobile_4g: string | number | null;
  privacy_screen: string | number | null;
  refresh_rate: string | number | null;
  yoga: string | number | null;

  new_price: string | number | null;
  sale_price: string | number | null;

  defects: string | null;
  mouse: string | null;
  video_outputs: string | null;
  ports: string | null;
  pdf_url: string | null;

  guarantee: string | number | null;
  battery_hours: string | number | null;
  weight: string | number | null;

  slug: string | null;
  grade: string | null;
};

type RawImage = {
  product_id: string | number;
  image_id: string | number;
  sort_order: string | number;
  image_url: string;
};

function numberOrNull(value: unknown): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function booleanValue(value: unknown): boolean {
  return Number(value) === 1;
}

export async function GET() {
  const apiKey = process.env.LAPTOPID_API_KEY;

  if (!apiKey) {
    console.error(
      "LAPTOPID_API_KEY environment variable is missing"
    );

    return NextResponse.json(
      {
        error: "Server configuration error",
      },
      {
        status: 500,
      }
    );
  }

  try {
    const headers = {
      "X-API-Key": apiKey,
    };

    const [productsResponse, imagesResponse] =
      await Promise.all([
        fetch(PRODUCTS_URL, {
          headers,
        }),

        fetch(IMAGES_URL, {
          headers,
        }),
      ]);

    if (!productsResponse.ok) {
      console.error(
        "Laptopid.ee products API failed:",
        productsResponse.status,
        productsResponse.statusText
      );

      throw new Error(
        "Products API request failed"
      );
    }

    if (!imagesResponse.ok) {
      console.error(
        "Laptopid.ee images API failed:",
        imagesResponse.status,
        imagesResponse.statusText
      );

      throw new Error(
        "Images API request failed"
      );
    }

    const products: RawProduct[] =
      await productsResponse.json();

    const images: RawImage[] =
      await imagesResponse.json();

    const imagesByProduct = new Map<
      number,
      RawImage[]
    >();

    for (const image of images) {
      const productId =
        Number(image.product_id);

      const current =
        imagesByProduct.get(productId) ?? [];

      current.push(image);

      imagesByProduct.set(
        productId,
        current
      );
    }

    const result = products.map(
      (product) => {
        const id = Number(product.id);

        const productImages = [
          ...(imagesByProduct.get(id) ?? []),
        ].sort(
          (a, b) =>
            Number(a.sort_order) -
            Number(b.sort_order)
        );

        const imageUrls =
          productImages.map(
            (image) => image.image_url
          );

        return {
          id,

          manufacturer:
            product.manufacturer,

          model: product.model,

          cpu: product.cpu,
          ram: product.ram,
          storage: product.storage,
          screen: product.screen,
          gpu: product.gpu,
          os: product.os,

          usb_c:
            numberOrNull(
              product.usb_c
            ) ?? 0,

          usb_2:
            numberOrNull(
              product.usb_2
            ) ?? 0,

          usb_3:
            numberOrNull(
              product.usb_3
            ) ?? 0,

          thunderbolt_3:
            booleanValue(
              product.thunderbolt_3
            ),

          thunderbolt_4:
            booleanValue(
              product.thunderbolt_4
            ),

          hdmi:
            booleanValue(
              product.hdmi
            ),

          displayport:
            booleanValue(
              product.displayport
            ),

          vga:
            booleanValue(
              product.vga
            ),

          dvi:
            booleanValue(
              product.dvi
            ),

          lan:
            booleanValue(
              product.lan
            ),

          sd_card_reader:
            booleanValue(
              product.sd_card_reader
            ),

          smartcard_reader:
            booleanValue(
              product.smartcard_reader
            ),

          webcam:
            booleanValue(
              product.webcam
            ),

          ir_camera:
            booleanValue(
              product.ir_camera
            ),

          fingerprint_reader:
            booleanValue(
              product.fingerprint_reader
            ),

          docking_support:
            booleanValue(
              product.docking_support
            ),

          backlit_keyboard:
            booleanValue(
              product.backlit_keyboard
            ),

          keyboard_layout:
            product.keyboard_layout,

          touchpad:
            booleanValue(
              product.touchpad
            ),

          pointing_stick:
            booleanValue(
              product.pointing_stick
            ),

          numpad:
            booleanValue(
              product.numpad
            ),

          mobile_4g:
            booleanValue(
              product.mobile_4g
            ),

          privacy_screen:
            booleanValue(
              product.privacy_screen
            ),

          refresh_rate:
            numberOrNull(
              product.refresh_rate
            ),

          yoga:
            booleanValue(
              product.yoga
            ),

          wifi: true,
          bluetooth: true,

          new_price:
            numberOrNull(
              product.new_price
            ),

          sale_price:
            numberOrNull(
              product.sale_price
            ),

          guarantee:
            numberOrNull(
              product.guarantee
            ),

          battery_hours:
            numberOrNull(
              product.battery_hours
            ),

          weight:
            numberOrNull(
              product.weight
            ),

          defects:
            product.defects,

          mouse:
            product.mouse,

          video_outputs:
            product.video_outputs,

          ports:
            product.ports,

          pdf_url:
            product.pdf_url,

          slug:
            product.slug,

          grade:
            product.grade,

          main_image:
            imageUrls.length > 0
              ? imageUrls[0]
              : null,

          images:
            imageUrls,

          image_count:
            imageUrls.length,
        };
      }
    );

    return NextResponse.json(
      {
        count:
          result.length,

        image_count:
          images.length,

        cache_seconds:
          300,

        updated_at:
          new Date().toISOString(),

        products:
          result,
      },
      {
        headers: {
          /*
           * Vercel/CDN hoiab vastust 5 minutit.
           */
          "Cache-Control":
            "public, s-maxage=300",
        },
      }
    );
  } catch (error) {
    console.error(
      "Laptopid.ee API import error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to load products",
      },
      {
        status: 500,
      }
    );
  }
}
