/**
 * ⚠️ DEVELOPMENT SEED DATA — ARENDUSE TESTANDMED ⚠️
 *
 * Need ei ole päris tooted, hinnad ega laoseisud. Mudelinimed ja spetsifikatsioonid on
 * realistlikud, et kasutajaliidest ja filtreid saaks testida, kuid kõik numbrid on välja mõeldud.
 *
 * Andmed on meelega tarnija "toorkujul" (tekstilised väljad nagu "16GB DDR4", erinevad
 * seisukorra kirjapildid), et normaliseerimise kood saaks päris tööd teha — täpselt nagu
 * päris tarnija API puhul.
 */

export interface MockSupplierRecord {
  sku: string;
  manufacturer: string;
  model_name: string;
  cpu: string;
  ram: string;
  storage: string;
  display: string;
  gpu: string;
  gpu_dedicated?: boolean;
  keyboard: string | null;
  condition: string;
  os: string | null;
  weight_kg: number | null;
  usb_a: number | null;
  usb_c: number | null;
  wifi: string | null;
  bluetooth: string | null;
  features: string[];
  /** Ostuhind eurodes ilma KM-ita */
  price_eur: number;
  vat: "standard" | "margin";
  qty: number;
  warranty_months: number | null;
  battery_health: number | null;
  charger: boolean | null;
  images: string[];
  listed_at: string;
}

const T = ["thunderbolt", "usb_c", "hdmi"];
const BUSINESS = ["fingerprint", "backlit"];

export const MOCK_SUPPLIER_RECORDS: MockSupplierRecord[] = [
  // ---------------- Lenovo ThinkPad ----------------
  {
    sku: "MS-10231", manufacturer: "Lenovo", model_name: "ThinkPad T14 Gen 3", cpu: "Intel Core i5-1235U",
    ram: "16GB DDR4", storage: "512GB NVMe SSD", display: '14" WUXGA 1920x1200 IPS', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "Grade A", os: "Windows 11 Pro", weight_kg: 1.21, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6E", bluetooth: "5.2", features: [...T, ...BUSINESS, "ir_camera", "rj45", "smartcard"],
    price_eur: 340, vat: "standard", qty: 7, warranty_months: 12, battery_health: 85, charger: true, images: [],
    listed_at: "2026-10-09T08:15:00Z",
  },
  {
    sku: "MS-10232", manufacturer: "Lenovo", model_name: "ThinkPad T14 Gen 3", cpu: "Intel Core i7-1265U vPro",
    ram: "32GB DDR4", storage: "1TB NVMe SSD", display: '14" WUXGA 1920x1200 IPS', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "A+", os: "Windows 11 Pro", weight_kg: 1.21, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6E", bluetooth: "5.2", features: [...T, ...BUSINESS, "ir_camera", "rj45", "smartcard"],
    price_eur: 470, vat: "standard", qty: 2, warranty_months: 12, battery_health: 90, charger: true, images: [],
    listed_at: "2026-10-04T10:00:00Z",
  },
  {
    sku: "MS-10233", manufacturer: "Lenovo", model_name: "ThinkPad T14 Gen 3", cpu: "Intel Core i5-1245U vPro",
    ram: "16GB DDR4", storage: "256GB NVMe SSD", display: '14" WUXGA 1920x1200 IPS', gpu: "Intel Iris Xe",
    keyboard: "US", condition: "B", os: "Windows 11 Pro", weight_kg: 1.21, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6E", bluetooth: "5.2", features: [...T, ...BUSINESS, "rj45"],
    price_eur: 290, vat: "standard", qty: 12, warranty_months: 12, battery_health: 80, charger: true, images: [],
    listed_at: "2026-09-22T09:00:00Z",
  },
  {
    sku: "MS-10240", manufacturer: "Lenovo", model_name: "ThinkPad T14 Gen 2", cpu: "Intel Core i5-1145G7",
    ram: "16GB DDR4", storage: "256GB SSD", display: '14" FHD 1920x1080 IPS', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "Grade B", os: "Windows 11 Pro", weight_kg: 1.5, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6", bluetooth: "5.1", features: [...T, ...BUSINESS, "rj45", "smartcard"],
    price_eur: 220, vat: "margin", qty: 15, warranty_months: 12, battery_health: 80, charger: true, images: [],
    listed_at: "2026-09-18T12:00:00Z",
  },
  {
    sku: "MS-10241", manufacturer: "Lenovo", model_name: "ThinkPad T14 Gen 2", cpu: "AMD Ryzen 5 PRO 5650U",
    ram: "16GB DDR4", storage: "512GB SSD", display: '14" FHD 1920x1080 IPS', gpu: "AMD Radeon Graphics",
    keyboard: "NO", condition: "A", os: "Windows 11 Pro", weight_kg: 1.5, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6", bluetooth: "5.1", features: ["usb_c", "hdmi", "rj45", ...BUSINESS],
    price_eur: 235, vat: "standard", qty: 4, warranty_months: 12, battery_health: 85, charger: true, images: [],
    listed_at: "2026-09-25T07:30:00Z",
  },
  {
    sku: "MS-10250", manufacturer: "Lenovo", model_name: "ThinkPad T14s Gen 2", cpu: "Intel Core i7-1185G7 vPro",
    ram: "16GB LPDDR4x", storage: "512GB SSD", display: '14" FHD 1920x1080 IPS Touch', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "A", os: "Windows 11 Pro", weight_kg: 1.27, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6", bluetooth: "5.1", features: [...T, ...BUSINESS, "ir_camera"],
    price_eur: 300, vat: "standard", qty: 3, warranty_months: 12, battery_health: 85, charger: true, images: [],
    listed_at: "2026-10-06T11:00:00Z",
  },
  {
    sku: "MS-10260", manufacturer: "Lenovo", model_name: "ThinkPad X1 Carbon Gen 9", cpu: "Intel Core i7-1165G7",
    ram: "16GB LPDDR4x", storage: "512GB SSD", display: '14" WUXGA 1920x1200 IPS', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "A+", os: "Windows 11 Pro", weight_kg: 1.13, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6", bluetooth: "5.2", features: [...T, ...BUSINESS, "ir_camera", "lte"],
    price_eur: 420, vat: "standard", qty: 2, warranty_months: 12, battery_health: 90, charger: true, images: [],
    listed_at: "2026-10-01T09:00:00Z",
  },
  {
    sku: "MS-10261", manufacturer: "Lenovo", model_name: "ThinkPad X1 Carbon Gen 9", cpu: "Intel Core i5-1145G7",
    ram: "16GB LPDDR4x", storage: "256GB SSD", display: '14" WUXGA 1920x1200 IPS', gpu: "Intel Iris Xe",
    keyboard: "US", condition: "B", os: "Windows 11 Pro", weight_kg: 1.13, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6", bluetooth: "5.2", features: [...T, ...BUSINESS],
    price_eur: 330, vat: "standard", qty: 5, warranty_months: 12, battery_health: 80, charger: true, images: [],
    listed_at: "2026-09-20T09:00:00Z",
  },
  {
    sku: "MS-10265", manufacturer: "Lenovo", model_name: "ThinkPad X1 Carbon Gen 11", cpu: "Intel Core i7-1365U vPro",
    ram: "32GB LPDDR5", storage: "1TB SSD", display: '14" WUXGA 1920x1200 IPS Touch', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "A+", os: "Windows 11 Pro", weight_kg: 1.12, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6E", bluetooth: "5.3", features: [...T, ...BUSINESS, "ir_camera", "5g"],
    price_eur: 760, vat: "standard", qty: 1, warranty_months: 12, battery_health: 95, charger: true, images: [],
    listed_at: "2026-10-08T14:00:00Z",
  },
  {
    sku: "MS-10270", manufacturer: "Lenovo", model_name: "ThinkPad X13 Gen 2", cpu: "Intel Core i5-1145G7",
    ram: "16GB LPDDR4x", storage: "256GB SSD", display: '13.3" WUXGA 1920x1200 IPS', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "A", os: "Windows 11 Pro", weight_kg: 1.2, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6", bluetooth: "5.1", features: [...T, ...BUSINESS],
    price_eur: 230, vat: "margin", qty: 6, warranty_months: 12, battery_health: 85, charger: true, images: [],
    listed_at: "2026-09-28T08:00:00Z",
  },
  {
    sku: "MS-10275", manufacturer: "Lenovo", model_name: "ThinkPad X1 Yoga Gen 6", cpu: "Intel Core i7-1185G7 vPro",
    ram: "16GB LPDDR4x", storage: "512GB SSD", display: '14" WUXGA 1920x1200 IPS Touch', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "A", os: "Windows 11 Pro", weight_kg: 1.36, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6", bluetooth: "5.2", features: [...T, ...BUSINESS, "ir_camera", "x360"],
    price_eur: 400, vat: "standard", qty: 1, warranty_months: 12, battery_health: 85, charger: true, images: [],
    listed_at: "2026-10-03T13:00:00Z",
  },
  {
    sku: "MS-10280", manufacturer: "Lenovo", model_name: "ThinkPad L14 Gen 2", cpu: "Intel Core i5-1135G7",
    ram: "8GB DDR4", storage: "256GB SSD", display: '14" FHD 1920x1080 IPS', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "C", os: "Windows 11 Pro", weight_kg: 1.55, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6", bluetooth: "5.1", features: ["usb_c", "hdmi", "rj45", "sd"],
    price_eur: 140, vat: "margin", qty: 20, warranty_months: 12, battery_health: 75, charger: true, images: [],
    listed_at: "2026-09-15T10:00:00Z",
  },
  {
    sku: "MS-10285", manufacturer: "Lenovo", model_name: "ThinkPad T490", cpu: "Intel Core i5-8365U",
    ram: "8GB DDR4", storage: "256GB SSD", display: '14" FHD 1920x1080 IPS', gpu: "Intel UHD 620",
    keyboard: "SE", condition: "B", os: "Windows 11 Pro", weight_kg: 1.46, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 5", bluetooth: "5.0", features: [...T, ...BUSINESS, "rj45"],
    price_eur: 120, vat: "margin", qty: 25, warranty_months: 12, battery_health: 75, charger: true, images: [],
    listed_at: "2026-09-12T10:00:00Z",
  },
  {
    sku: "MS-10290", manufacturer: "Lenovo", model_name: "ThinkPad T16 Gen 1", cpu: "Intel Core i5-1245U vPro",
    ram: "16GB DDR4", storage: "512GB SSD", display: '16" WUXGA 1920x1200 IPS', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "A", os: "Windows 11 Pro", weight_kg: 1.81, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6E", bluetooth: "5.2", features: [...T, ...BUSINESS, "rj45", "numpad", "smartcard"],
    price_eur: 380, vat: "standard", qty: 4, warranty_months: 12, battery_health: 90, charger: true, images: [],
    listed_at: "2026-10-07T09:30:00Z",
  },
  {
    sku: "MS-10295", manufacturer: "Lenovo", model_name: "ThinkPad T14 Gen 4", cpu: "Intel Core i5-1345U vPro",
    ram: "16GB DDR5", storage: "512GB SSD", display: '14" WUXGA 1920x1200 IPS', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "A", os: "Windows 11 Pro", weight_kg: 1.22, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6E", bluetooth: "5.3", features: [...T, ...BUSINESS, "ir_camera", "rj45"],
    price_eur: 470, vat: "standard", qty: 3, warranty_months: 12, battery_health: 95, charger: true, images: [],
    listed_at: "2026-10-09T15:00:00Z",
  },
  {
    sku: "MS-10297", manufacturer: "Lenovo", model_name: "ThinkPad T14 Gen 5", cpu: "Intel Core Ultra 5 135U",
    ram: "16GB DDR5", storage: "512GB SSD", display: '14" WUXGA 1920x1200 IPS', gpu: "Intel Graphics",
    keyboard: "SE", condition: "A+", os: "Windows 11 Pro", weight_kg: 1.31, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6E", bluetooth: "5.3", features: [...T, ...BUSINESS, "ir_camera", "rj45"],
    price_eur: 640, vat: "standard", qty: 2, warranty_months: 12, battery_health: 98, charger: true, images: [],
    listed_at: "2026-10-10T06:00:00Z",
  },
  {
    sku: "MS-10300", manufacturer: "Lenovo", model_name: "ThinkPad L13 Yoga Gen 2", cpu: "Intel Core i5-1135G7",
    ram: "8GB DDR4", storage: "256GB SSD", display: '13.3" FHD 1920x1080 IPS Touch', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "B", os: "Windows 11 Pro", weight_kg: 1.39, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6", bluetooth: "5.1", features: ["usb_c", "hdmi", "x360", "fingerprint"],
    price_eur: 170, vat: "margin", qty: 4, warranty_months: 12, battery_health: 80, charger: true, images: [],
    listed_at: "2026-09-26T10:00:00Z",
  },
  {
    sku: "MS-10310", manufacturer: "Lenovo", model_name: "ThinkPad P1 Gen 4", cpu: "Intel Core i7-11800H",
    ram: "32GB DDR4", storage: "1TB SSD", display: '16" WQXGA 2560x1600 IPS', gpu: "NVIDIA RTX A2000 4GB",
    gpu_dedicated: true, keyboard: "SE", condition: "A", os: "Windows 11 Pro", weight_kg: 1.81, usb_a: 2,
    usb_c: 2, wifi: "Wi-Fi 6E", bluetooth: "5.2", features: [...T, ...BUSINESS, "ir_camera", "sd"],
    price_eur: 780, vat: "standard", qty: 2, warranty_months: 12, battery_health: 85, charger: true, images: [],
    listed_at: "2026-10-02T12:00:00Z",
  },
  {
    sku: "MS-10315", manufacturer: "Lenovo", model_name: "ThinkPad P14s Gen 2", cpu: "AMD Ryzen 7 PRO 5850U",
    ram: "32GB DDR4", storage: "1TB SSD", display: '14" FHD 1920x1080 IPS', gpu: "AMD Radeon Graphics",
    keyboard: "SE", condition: "A", os: "Windows 11 Pro", weight_kg: 1.47, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6", bluetooth: "5.1", features: ["usb_c", "hdmi", "rj45", ...BUSINESS],
    price_eur: 400, vat: "standard", qty: 3, warranty_months: 12, battery_health: 85, charger: true, images: [],
    listed_at: "2026-09-30T09:00:00Z",
  },

  // ---------------- Dell Latitude / Precision ----------------
  {
    sku: "MS-20101", manufacturer: "Dell", model_name: "Latitude 5420", cpu: "Intel Core i5-1145G7",
    ram: "16GB DDR4", storage: "256GB SSD", display: '14" FHD 1920x1080 IPS', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "Grade B", os: "Windows 11 Pro", weight_kg: 1.36, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6", bluetooth: "5.1", features: [...T, ...BUSINESS, "rj45", "smartcard", "sd"],
    price_eur: 200, vat: "margin", qty: 18, warranty_months: 12, battery_health: 80, charger: true, images: [],
    listed_at: "2026-09-16T10:00:00Z",
  },
  {
    sku: "MS-20102", manufacturer: "Dell", model_name: "Latitude 5420", cpu: "Intel Core i7-1185G7 vPro",
    ram: "16GB DDR4", storage: "512GB SSD", display: '14" FHD 1920x1080 IPS', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "Grade A", os: "Windows 11 Pro", weight_kg: 1.36, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6", bluetooth: "5.1", features: [...T, ...BUSINESS, "rj45", "smartcard", "sd"],
    price_eur: 260, vat: "standard", qty: 6, warranty_months: 12, battery_health: 85, charger: true, images: [],
    listed_at: "2026-09-27T10:00:00Z",
  },
  {
    sku: "MS-20110", manufacturer: "Dell", model_name: "Latitude 5430", cpu: "Intel Core i5-1245U vPro",
    ram: "16GB DDR4", storage: "512GB SSD", display: '14" FHD 1920x1080 IPS', gpu: "Intel Iris Xe",
    keyboard: "US", condition: "A", os: "Windows 11 Pro", weight_kg: 1.36, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6E", bluetooth: "5.2", features: [...T, ...BUSINESS, "rj45", "smartcard"],
    price_eur: 300, vat: "standard", qty: 9, warranty_months: 12, battery_health: 90, charger: true, images: [],
    listed_at: "2026-10-05T08:00:00Z",
  },
  {
    sku: "MS-20111", manufacturer: "Dell", model_name: "Latitude 5430", cpu: "Intel Core i7-1265U vPro",
    ram: "32GB DDR4", storage: "512GB SSD", display: '14" FHD 1920x1080 IPS', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "A+", os: "Windows 11 Pro", weight_kg: 1.36, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6E", bluetooth: "5.2", features: [...T, ...BUSINESS, "rj45", "smartcard", "ir_camera"],
    price_eur: 380, vat: "standard", qty: 2, warranty_months: 12, battery_health: 92, charger: true, images: [],
    listed_at: "2026-10-08T09:00:00Z",
  },
  {
    sku: "MS-20120", manufacturer: "Dell", model_name: "Latitude 7420", cpu: "Intel Core i7-1185G7 vPro",
    ram: "16GB LPDDR4x", storage: "512GB SSD", display: '14" FHD 1920x1080 IPS Touch', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "A", os: "Windows 11 Pro", weight_kg: 1.26, usb_a: 1, usb_c: 2,
    wifi: "Wi-Fi 6", bluetooth: "5.1", features: [...T, ...BUSINESS, "ir_camera", "lte", "smartcard"],
    price_eur: 300, vat: "standard", qty: 5, warranty_months: 12, battery_health: 85, charger: true, images: [],
    listed_at: "2026-09-29T09:00:00Z",
  },
  {
    sku: "MS-20125", manufacturer: "Dell", model_name: "Latitude 7430", cpu: "Intel Core i5-1245U vPro",
    ram: "16GB LPDDR4x", storage: "256GB SSD", display: '14" FHD 1920x1080 IPS', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "B", os: "Windows 11 Pro", weight_kg: 1.22, usb_a: 1, usb_c: 2,
    wifi: "Wi-Fi 6E", bluetooth: "5.2", features: [...T, ...BUSINESS, "smartcard"],
    price_eur: 290, vat: "standard", qty: 7, warranty_months: 12, battery_health: 82, charger: true, images: [],
    listed_at: "2026-09-24T09:00:00Z",
  },
  {
    sku: "MS-20130", manufacturer: "Dell", model_name: "Latitude 5520", cpu: "Intel Core i5-1145G7",
    ram: "16GB DDR4", storage: "512GB SSD", display: '15.6" FHD 1920x1080 IPS', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "B", os: "Windows 11 Pro", weight_kg: 1.59, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6", bluetooth: "5.1", features: [...T, ...BUSINESS, "rj45", "numpad", "sd"],
    price_eur: 220, vat: "margin", qty: 10, warranty_months: 12, battery_health: 80, charger: true, images: [],
    listed_at: "2026-09-19T09:00:00Z",
  },
  {
    sku: "MS-20135", manufacturer: "Dell", model_name: "Latitude 5530", cpu: "Intel Core i5-1245U vPro",
    ram: "16GB DDR4", storage: "512GB SSD", display: '15.6" FHD 1920x1080 IPS', gpu: "Intel Iris Xe",
    keyboard: "NO", condition: "A", os: "Windows 11 Pro", weight_kg: 1.59, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6E", bluetooth: "5.2", features: [...T, ...BUSINESS, "rj45", "numpad"],
    price_eur: 320, vat: "standard", qty: 4, warranty_months: 12, battery_health: 90, charger: true, images: [],
    listed_at: "2026-10-04T09:00:00Z",
  },
  {
    sku: "MS-20140", manufacturer: "Dell", model_name: "Latitude 7320", cpu: "Intel Core i5-1145G7",
    ram: "8GB LPDDR4x", storage: "256GB SSD", display: '13.3" FHD 1920x1080 IPS', gpu: "Intel Iris Xe",
    keyboard: "US", condition: "C", os: "Windows 11 Pro", weight_kg: 1.13, usb_a: 1, usb_c: 2,
    wifi: "Wi-Fi 6", bluetooth: "5.1", features: [...T, "backlit"],
    price_eur: 150, vat: "margin", qty: 8, warranty_months: 12, battery_health: 75, charger: true, images: [],
    listed_at: "2026-09-14T09:00:00Z",
  },
  {
    sku: "MS-20145", manufacturer: "Dell", model_name: "Latitude 9420 2-in-1", cpu: "Intel Core i7-1185G7 vPro",
    ram: "16GB LPDDR4x", storage: "512GB SSD", display: '14" QHD+ 2560x1600 IPS Touch', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "A", os: "Windows 11 Pro", weight_kg: 1.5, usb_a: 0, usb_c: 2,
    wifi: "Wi-Fi 6", bluetooth: "5.2", features: [...T, ...BUSINESS, "ir_camera", "x360"],
    price_eur: 450, vat: "standard", qty: 1, warranty_months: 12, battery_health: 88, charger: true, images: [],
    listed_at: "2026-10-06T09:00:00Z",
  },
  {
    sku: "MS-20150", manufacturer: "Dell", model_name: "Latitude 5440", cpu: "Intel Core i5-1345U vPro",
    ram: "16GB DDR4", storage: "512GB SSD", display: '14" FHD 1920x1080 IPS', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "A", os: "Windows 11 Pro", weight_kg: 1.4, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6E", bluetooth: "5.3", features: [...T, ...BUSINESS, "rj45", "smartcard"],
    price_eur: 420, vat: "standard", qty: 5, warranty_months: 12, battery_health: 95, charger: true, images: [],
    listed_at: "2026-10-09T10:00:00Z",
  },
  {
    sku: "MS-20155", manufacturer: "Dell", model_name: "Latitude 7440", cpu: "Intel Core i7-1365U vPro",
    ram: "32GB LPDDR5", storage: "1TB SSD", display: '14" FHD+ 1920x1200 IPS', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "A+", os: "Windows 11 Pro", weight_kg: 1.21, usb_a: 1, usb_c: 2,
    wifi: "Wi-Fi 6E", bluetooth: "5.3", features: [...T, ...BUSINESS, "ir_camera", "smartcard"],
    price_eur: 640, vat: "standard", qty: 2, warranty_months: 12, battery_health: 96, charger: true, images: [],
    listed_at: "2026-10-07T10:00:00Z",
  },
  {
    sku: "MS-20158", manufacturer: "Dell", model_name: "Latitude 5550", cpu: "Intel Core Ultra 7 165U",
    ram: "32GB DDR5", storage: "1TB SSD", display: '15.6" FHD 1920x1080 IPS', gpu: "Intel Graphics",
    keyboard: "SE", condition: "A+", os: "Windows 11 Pro", weight_kg: 1.62, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6E", bluetooth: "5.3", features: [...T, ...BUSINESS, "rj45", "numpad", "ir_camera"],
    price_eur: 780, vat: "standard", qty: 1, warranty_months: 12, battery_health: 98, charger: true, images: [],
    listed_at: "2026-10-10T07:00:00Z",
  },
  {
    sku: "MS-20160", manufacturer: "Dell", model_name: "Precision 5560", cpu: "Intel Core i7-11850H vPro",
    ram: "32GB DDR4", storage: "1TB SSD", display: '15.6" FHD+ 1920x1200 IPS', gpu: "NVIDIA RTX A2000 4GB",
    gpu_dedicated: true, keyboard: "SE", condition: "A", os: "Windows 11 Pro", weight_kg: 1.84, usb_a: 0,
    usb_c: 3, wifi: "Wi-Fi 6", bluetooth: "5.1", features: [...T, ...BUSINESS, "ir_camera", "sd"],
    price_eur: 820, vat: "standard", qty: 2, warranty_months: 12, battery_health: 85, charger: true, images: [],
    listed_at: "2026-10-01T10:00:00Z",
  },
  {
    sku: "MS-20165", manufacturer: "Dell", model_name: "Precision 7560", cpu: "Intel Core i7-11850H vPro",
    ram: "32GB DDR4", storage: "1TB SSD", display: '15.6" FHD 1920x1080 IPS', gpu: "NVIDIA RTX A3000 6GB",
    gpu_dedicated: true, keyboard: "SE", condition: "B", os: "Windows 11 Pro", weight_kg: 2.5, usb_a: 2,
    usb_c: 2, wifi: "Wi-Fi 6", bluetooth: "5.1", features: [...T, ...BUSINESS, "rj45", "numpad", "sd", "smartcard"],
    price_eur: 760, vat: "standard", qty: 1, warranty_months: 12, battery_health: 80, charger: true, images: [],
    listed_at: "2026-09-23T10:00:00Z",
  },

  // ---------------- HP EliteBook / ProBook / ZBook ----------------
  {
    sku: "MS-30101", manufacturer: "HP", model_name: "EliteBook 840 G8", cpu: "Intel Core i5-1145G7",
    ram: "16GB DDR4", storage: "256GB SSD", display: '14" FHD 1920x1080 IPS', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "B", os: "Windows 11 Pro", weight_kg: 1.33, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6", bluetooth: "5.0", features: [...T, ...BUSINESS],
    price_eur: 210, vat: "margin", qty: 22, warranty_months: 12, battery_health: 80, charger: true, images: [],
    listed_at: "2026-09-17T10:00:00Z",
  },
  {
    sku: "MS-30102", manufacturer: "HP", model_name: "EliteBook 840 G8", cpu: "Intel Core i7-1185G7 vPro",
    ram: "32GB DDR4", storage: "512GB SSD", display: '14" FHD 1920x1080 IPS', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "A", os: "Windows 11 Pro", weight_kg: 1.33, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6", bluetooth: "5.0", features: [...T, ...BUSINESS, "ir_camera", "smartcard"],
    price_eur: 300, vat: "standard", qty: 6, warranty_months: 12, battery_health: 85, charger: true, images: [],
    listed_at: "2026-10-03T10:00:00Z",
  },
  {
    sku: "MS-30110", manufacturer: "HP", model_name: "EliteBook 845 G8", cpu: "AMD Ryzen 5 PRO 5650U",
    ram: "16GB DDR4", storage: "512GB SSD", display: '14" FHD 1920x1080 IPS', gpu: "AMD Radeon Graphics",
    keyboard: "US", condition: "A", os: "Windows 11 Pro", weight_kg: 1.33, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6", bluetooth: "5.0", features: ["usb_c", "hdmi", ...BUSINESS],
    price_eur: 240, vat: "standard", qty: 7, warranty_months: 12, battery_health: 85, charger: true, images: [],
    listed_at: "2026-09-21T10:00:00Z",
  },
  {
    sku: "MS-30120", manufacturer: "HP", model_name: "EliteBook 850 G8", cpu: "Intel Core i5-1135G7",
    ram: "16GB DDR4", storage: "512GB SSD", display: '15.6" FHD 1920x1080 IPS', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "B", os: "Windows 11 Pro", weight_kg: 1.71, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6", bluetooth: "5.0", features: [...T, ...BUSINESS, "numpad"],
    price_eur: 230, vat: "margin", qty: 9, warranty_months: 12, battery_health: 80, charger: true, images: [],
    listed_at: "2026-09-18T10:00:00Z",
  },
  {
    sku: "MS-30130", manufacturer: "HP", model_name: "ProBook 450 G8", cpu: "Intel Core i5-1135G7",
    ram: "8GB DDR4", storage: "256GB SSD", display: '15.6" FHD 1920x1080 IPS', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "C", os: "Windows 11 Pro", weight_kg: 1.74, usb_a: 2, usb_c: 1,
    wifi: "Wi-Fi 6", bluetooth: "5.0", features: ["usb_c", "hdmi", "rj45", "numpad"],
    price_eur: 150, vat: "margin", qty: 14, warranty_months: 12, battery_health: 75, charger: true, images: [],
    listed_at: "2026-09-13T10:00:00Z",
  },
  {
    sku: "MS-30131", manufacturer: "HP", model_name: "ProBook 450 G8", cpu: "Intel Core i7-1165G7",
    ram: "16GB DDR4", storage: "512GB SSD", display: '15.6" FHD 1920x1080 IPS', gpu: "Intel Iris Xe",
    keyboard: "NO", condition: "B", os: "Windows 11 Pro", weight_kg: 1.74, usb_a: 2, usb_c: 1,
    wifi: "Wi-Fi 6", bluetooth: "5.0", features: ["usb_c", "hdmi", "rj45", "numpad", "backlit", "fingerprint"],
    price_eur: 210, vat: "margin", qty: 6, warranty_months: 12, battery_health: 80, charger: true, images: [],
    listed_at: "2026-09-25T10:00:00Z",
  },
  {
    sku: "MS-30135", manufacturer: "HP", model_name: "ProBook 440 G9", cpu: "Intel Core i5-1235U",
    ram: "16GB DDR4", storage: "256GB SSD", display: '14" FHD 1920x1080 IPS', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "A", os: "Windows 11 Pro", weight_kg: 1.38, usb_a: 2, usb_c: 1,
    wifi: "Wi-Fi 6", bluetooth: "5.2", features: ["usb_c", "hdmi", "rj45", ...BUSINESS],
    price_eur: 280, vat: "standard", qty: 6, warranty_months: 12, battery_health: 90, charger: true, images: [],
    listed_at: "2026-10-02T10:00:00Z",
  },
  {
    sku: "MS-30140", manufacturer: "HP", model_name: "EliteBook 840 G9", cpu: "Intel Core i5-1245U vPro",
    ram: "16GB DDR5", storage: "512GB SSD", display: '14" WUXGA 1920x1200 IPS', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "A", os: "Windows 11 Pro", weight_kg: 1.36, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6E", bluetooth: "5.3", features: [...T, ...BUSINESS, "ir_camera"],
    price_eur: 370, vat: "standard", qty: 5, warranty_months: 12, battery_health: 92, charger: true, images: [],
    listed_at: "2026-10-08T10:00:00Z",
  },
  {
    sku: "MS-30145", manufacturer: "HP", model_name: "EliteBook x360 1040 G8", cpu: "Intel Core i7-1185G7 vPro",
    ram: "16GB LPDDR4x", storage: "512GB SSD", display: '14" FHD 1920x1080 IPS Touch', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "A+", os: "Windows 11 Pro", weight_kg: 1.33, usb_a: 1, usb_c: 2,
    wifi: "Wi-Fi 6", bluetooth: "5.0", features: [...T, ...BUSINESS, "ir_camera", "lte", "x360"],
    price_eur: 420, vat: "standard", qty: 1, warranty_months: 12, battery_health: 90, charger: true, images: [],
    listed_at: "2026-10-05T10:00:00Z",
  },
  {
    sku: "MS-30150", manufacturer: "HP", model_name: "ZBook Firefly 14 G8", cpu: "Intel Core i7-1165G7",
    ram: "32GB DDR4", storage: "1TB SSD", display: '14" FHD 1920x1080 IPS', gpu: "NVIDIA T500 4GB",
    gpu_dedicated: true, keyboard: "SE", condition: "A", os: "Windows 11 Pro", weight_kg: 1.35, usb_a: 2,
    usb_c: 2, wifi: "Wi-Fi 6", bluetooth: "5.0", features: [...T, ...BUSINESS],
    price_eur: 380, vat: "standard", qty: 2, warranty_months: 12, battery_health: 85, charger: true, images: [],
    listed_at: "2026-09-30T10:00:00Z",
  },
  {
    sku: "MS-30155", manufacturer: "HP", model_name: "EliteBook 860 G10", cpu: "Intel Core i7-1355U",
    ram: "16GB DDR5", storage: "512GB SSD", display: '16" WUXGA 1920x1200 IPS', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "A+", os: "Windows 11 Pro", weight_kg: 1.74, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6E", bluetooth: "5.3", features: [...T, ...BUSINESS, "numpad"],
    price_eur: 560, vat: "standard", qty: 3, warranty_months: 12, battery_health: 96, charger: true, images: [],
    listed_at: "2026-10-09T12:00:00Z",
  },
  {
    sku: "MS-30160", manufacturer: "HP", model_name: "EliteBook 840 G11", cpu: "Intel Core Ultra 5 125U",
    ram: "16GB DDR5", storage: "512GB SSD", display: '14" WUXGA 1920x1200 IPS', gpu: "Intel Graphics",
    keyboard: "SE", condition: "A+", os: "Windows 11 Pro", weight_kg: 1.37, usb_a: 2, usb_c: 2,
    wifi: "Wi-Fi 6E", bluetooth: "5.3", features: [...T, ...BUSINESS, "ir_camera"],
    price_eur: 680, vat: "standard", qty: 2, warranty_months: 12, battery_health: 98, charger: true, images: [],
    listed_at: "2026-10-10T08:00:00Z",
  },
  // Vigane kirje — näitab, et normaliseerimine lükkab selle tagasi, mitte ei pane poodi
  {
    sku: "MS-99999", manufacturer: "Lenovo", model_name: "ThinkPad T14 Gen 3", cpu: "Intel Core i5-1235U",
    ram: "16GB DDR4", storage: "512GB SSD", display: '14" WUXGA 1920x1200 IPS', gpu: "Intel Iris Xe",
    keyboard: "SE", condition: "Grade Z", os: "Windows 11 Pro", weight_kg: 1.21, usb_a: 2, usb_c: 2,
    wifi: null, bluetooth: null, features: [], price_eur: 300, vat: "standard", qty: 3, warranty_months: 12,
    battery_health: null, charger: true, images: [], listed_at: "2026-10-01T10:00:00Z",
  },
];

/** Tooted, mille admin on märkinud esiletõstetuks (Phase 3-s tuleb see andmebaasist). */
export const MOCK_FEATURED_SKUS = ["MS-10231", "MS-20110", "MS-30102", "MS-10260", "MS-20120", "MS-30140", "MS-10270", "MS-20155"];
