import { z } from "zod";

/**
 * Laptopid.ee API toorvastuse skeem (kontrollitud päris vastuse põhjal, 2026-10-11).
 *
 *   GET <LAPTOPID_API_BASE_URL>products.php  (päis X-API-Key) → toodete massiiv
 *   GET <LAPTOPID_API_BASE_URL>images.php    (päis X-API-Key) → piltide massiiv
 *
 * Vastuses EI OLE ümbrist (count, snapshot_complete vms) — ainult massiiv. Täielikkuse kontroll on
 * seetõttu meie poolel (vt snapshot-policy.ts ja docs/LAPTOPID_SYNC.md).
 *
 * Skeem on teadlikult "loose": uued väljad ei murra sync'i. Tüübid on laiad (number | string), sest
 * API annab hinnad tekstina ("749.00") ja omadused arvudena (0/1).
 */

const scalar = z.union([z.number(), z.string(), z.boolean()]).nullish();
const text = z.string().nullish();

export const laptopidProductSchema = z.looseObject({
  id: z.union([z.number().int().positive(), z.string().regex(/^\d{1,12}$/)]),
  manufacturer: z.string().trim().min(1),
  model: z.string().trim().min(1),
  cpu: text,
  ram: text,
  storage: text,
  screen: text,
  gpu: text,
  os: text,
  usb_c: scalar,
  usb_2: scalar,
  usb_3: scalar,
  thunderbolt_3: scalar,
  thunderbolt_4: scalar,
  hdmi: scalar,
  displayport: scalar,
  vga: scalar,
  dvi: scalar,
  lan: scalar,
  sd_card_reader: scalar,
  smartcard_reader: scalar,
  webcam: scalar,
  ir_camera: scalar,
  fingerprint_reader: scalar,
  docking_support: scalar,
  backlit_keyboard: scalar,
  keyboard_layout: text,
  touchpad: scalar,
  pointing_stick: scalar,
  numpad: scalar,
  mobile_4g: scalar,
  privacy_screen: scalar,
  refresh_rate: scalar,
  yoga: scalar,
  new_price: scalar,
  sale_price: z.union([z.number(), z.string()]),
  defects: text,
  mouse: text,
  video_outputs: text,
  ports: text,
  pdf_url: text,
  guarantee: scalar,
  battery_hours: scalar,
  weight: scalar,
  slug: text,
  grade: text,
});
export type LaptopidProduct = z.infer<typeof laptopidProductSchema>;

export const laptopidImageSchema = z.looseObject({
  product_id: z.union([z.number().int().positive(), z.string().regex(/^\d{1,12}$/)]),
  image_id: z.union([z.number().int().positive(), z.string().regex(/^\d{1,12}$/)]),
  sort_order: z.union([z.number(), z.string()]).nullish(),
  image_url: z.string().min(1),
});
export type LaptopidImage = z.infer<typeof laptopidImageSchema>;
