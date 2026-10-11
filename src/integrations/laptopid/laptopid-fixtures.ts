/**
 * Laptopid.ee API testandmed. Kuju ja väärtused on võetud päris vastusest (toode 6678, 2026-10-11),
 * et testid kontrolliksid päris vormingut (hinnad tekstina, omadused 0/1, HTML-killud, "//" pildi URL-is).
 */

export function laptopidProduct(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 6678,
    manufacturer: "Lenovo",
    model: "Thinkpad X1 Carbon G10",
    cpu: "Intel i5-1235U 4400MHz",
    ram: "16GB LPDDR5",
    storage: "256GB SSD",
    screen: '14" WUXGA (1920x1200) Touchscreen',
    gpu: "Intel Iris Xe Graphics",
    os: "Windows 11 Pro 64bit",
    usb_c: 2,
    usb_2: 0,
    usb_3: 2,
    thunderbolt_3: 0,
    thunderbolt_4: 1,
    hdmi: 1,
    displayport: 0,
    vga: 0,
    dvi: 0,
    lan: 0,
    sd_card_reader: 0,
    smartcard_reader: 0,
    webcam: 1,
    ir_camera: 1,
    fingerprint_reader: 1,
    docking_support: 1,
    backlit_keyboard: 1,
    keyboard_layout: "SWE",
    touchpad: 1,
    pointing_stick: 1,
    numpad: 0,
    mobile_4g: 1,
    privacy_screen: 0,
    refresh_rate: 60,
    yoga: 0,
    new_price: "2799.00",
    sale_price: "749.00",
    defects: "",
    mouse: "touchpad ja pointingstick",
    video_outputs: "HDMI, Thunderbolt 4",
    ports: "<p>2x USB 3.1, 2x USB-C / Thunderbolt 4, s&otilde;rmej&auml;ljelugeja, veebikaamera, Taustavalgustusega klaviatuur</p>",
    pdf_url: "",
    guarantee: 12,
    battery_hours: "17",
    weight: "1.10",
    slug: "lenovo-thinkpad-x1-carbon-g10-12",
    grade: "A",
    ...overrides,
  };
}

export function laptopidImages(productId: number | string, imageIds: number[]): Record<string, unknown>[] {
  return imageIds.map((imageId) => ({
    product_id: String(productId),
    image_id: imageId,
    sort_order: imageId,
    image_url: `https://laptopid.ee/images/product//${productId}/${imageId}/original.png`,
  }));
}

/** Lenovo V330-14IKB (Laptopid ID 1670) — päris vastus 2026-10-11, olulisemad väljad */
export function laptopidV330(): Record<string, unknown> {
  return laptopidProduct({
    id: 1670,
    manufacturer: "Lenovo",
    model: "V330-14IKB ",
    cpu: "Intel i5-8250U 3400Mhz",
    ram: "8GB DDR4",
    storage: "256GB SSD",
    screen: '14" FHD (1920x1080) matt',
    gpu: "Intel UHD 630",
    os: "Windows 11 Home 64-bit",
    thunderbolt_4: 0,
    lan: 1,
    sd_card_reader: 1,
    webcam: 0,
    ir_camera: 0,
    backlit_keyboard: 0,
    pointing_stick: 0,
    mobile_4g: 0,
    vga: 1,
    new_price: "1099.00",
    sale_price: "299.00",
    ports: "2x USB 3.0, 2x USB-C, SD-kaardilugeja, LAN, webcam, sõrmejäljelugeja",
    battery_hours: "5",
    weight: "1.70",
    slug: "lenovo-v330-14ikb",
    grade: "B",
  });
}

/** Väike, aga realistlik snapshot: sama mudel kolmes konfiguratsioonis + teised mudelid */
export function laptopidSnapshot() {
  const products = [
    laptopidProduct(),
    laptopidProduct({ id: 6675, cpu: "Intel i7-1265U 4800MHz", ram: "32GB LPDDR5", storage: "512GB SSD ", sale_price: "1299.00", slug: "lenovo-thinkpad-x1-carbon-g10-9" }),
    laptopidProduct({ id: 6602, cpu: "Intel i7-1260P 4700MHz", ram: "32GB LPDDR5", storage: "1TB SSD", grade: "A+", sale_price: "1349.00", slug: "lenovo-thinkpad-x1-carbon-g10-5" }),
    laptopidProduct({
      id: 6493,
      manufacturer: "Dell",
      model: "XPS 15 9530 ",
      cpu: "Intel i7-13700H 5000MHz",
      ram: "32GB DDR5",
      storage: "1TB SSD",
      screen: '15.6" FHD (1920x1080) IPS matt',
      gpu: "NVIDIA GeForce RTX 4070",
      grade: "B",
      sale_price: "1499.00",
      defects: "<p>&Uuml;ks USB-C ei t&ouml;&ouml;ta</p>",
      weight: "1.86",
      slug: "dell-xps-15-9530",
    }),
    laptopidProduct({ id: 6224, manufacturer: "HP", model: "Elitebook 840 G8", grade: "New", slug: "hp-elitebook-840-g8" }),
    // Päris andmed (2026-10-11): Demo, Outlet ja Lenovo V-seeria
    laptopidProduct({ id: 5643, manufacturer: "Dell", model: "XPS 15 9520 ", cpu: "Intel i9-12900HK 5000MHz", ram: "32GB DDR5", storage: "1TB SSD ", screen: '15.6" UHD+ 4K (3840 x 2400) Touchscreen', gpu: "NVIDIA GeForce RTX 3050ti", grade: "Demo", sale_price: "1349.00", slug: "dell-xps-15-9520" }),
    laptopidProduct({ id: 6629, model: "Thinkpad X1 2in1 G9", cpu: "Intel Ultra 7 155U 4800MHz", ram: "32GB LPDDR5", storage: "512GB SSD ", gpu: "Intel Arc Graphics", grade: "Outlet", sale_price: "1749.00", slug: "lenovo-thinkpad-x1-2in1-g9" }),
    laptopidV330(),
  ];
  const images = [...laptopidImages(6678, [30530, 30531]), ...laptopidImages(6675, [30400]), ...laptopidImages(6493, [29001, 29002]), ...laptopidImages(1670, [8001, 8002])];
  return { products, images };
}
