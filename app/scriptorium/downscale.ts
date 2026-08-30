/**
 * app/scriptorium/downscale.ts — client-side image discipline (SPEC §5,
 * DATA-CAVEATS addendum 2 §10): downscale to <= MAX_LONGEST_EDGE, JPEG,
 * before the base64 data URL ever leaves the browser. Never store the image
 * server-side — only its transcription and sha256 travel further (SPEC §4).
 */
import { MAX_LONGEST_EDGE } from "./registry";

export type DownscaledImage = {
  dataUrl: string;
  width: number;
  height: number;
  sha256: string;
};

async function sha256Hex(input: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Downscale `file` to a JPEG data URL with its longest edge capped at
 * MAX_LONGEST_EDGE, and hash the ORIGINAL bytes for provenance (SPEC §4: "the
 * image's sha256 (provenance key)"). Throws on a non-decodable file — the
 * caller renders that as an inline input error, not a crash.
 */
export async function downscaleToJpeg(file: File): Promise<DownscaledImage> {
  const originalBytes = await file.arrayBuffer();
  const sha256 = await sha256Hex(originalBytes);

  const bitmap = await createImageBitmap(new Blob([originalBytes], { type: file.type }));
  try {
    const scale = Math.min(1, MAX_LONGEST_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context unavailable in this browser");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return { dataUrl, width, height, sha256 };
  } finally {
    bitmap.close();
  }
}
