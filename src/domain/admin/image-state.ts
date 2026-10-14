/**
 * Mudeli piltide olek adminis — ausalt: "vaste leitud" ei ole edu, kui ühtegi kasutatavat pilti pole.
 * Tuletatakse olemasolevast andmest (icecat_metadata.status + nähtavad product_images allika järgi), migratsiooni pole.
 */
export const IMAGE_STATES = {
  REVIEW: { label: "Icecat: ülevaatusel", tone: "warning" },
  REJECTED: { label: "Icecat: tagasi lükatud", tone: "neutral" },
  MATCHED_LOCAL: { label: "Icecat: vaste, pildid olemas", tone: "success" },
  MATCHED_NO_IMAGES: { label: "Icecat: vaste kinnitatud, pildid alla laadimata", tone: "warning" },
  OWN_IMAGES: { label: "Oma / Laptopid.ee pildid", tone: "success" },
  NO_MATCH: { label: "Vastet pole, pilte pole", tone: "danger" },
} as const;

export type ImageState = keyof typeof IMAGE_STATES;

export function imageState(input: {
  icecatStatus: string | null;
  /** Nähtavad mudelipildid allikaga ICECAT */
  icecatImages: number;
  /** Nähtavad mudelipildid muust allikast (admin / Laptopid.ee koopiad) */
  otherImages: number;
}): ImageState {
  switch (input.icecatStatus) {
    case "NEEDS_REVIEW":
      return "REVIEW";
    case "REJECTED":
      return "REJECTED";
    case "MATCHED":
      return input.icecatImages > 0 ? "MATCHED_LOCAL" : "MATCHED_NO_IMAGES";
    default:
      return input.otherImages > 0 ? "OWN_IMAGES" : "NO_MATCH";
  }
}
