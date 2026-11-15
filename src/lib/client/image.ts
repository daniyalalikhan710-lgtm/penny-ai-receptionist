"use client";

import type { UploadData } from "@/lib/domain/chat";

const MAX_EDGE = 1568;
const THUMB_EDGE = 240;
const MAX_RAW_BYTES = 20 * 1024 * 1024;
/** Just under the server's per-image cap (see CAPS.maxImageBytes). */
const MAX_UPLOAD_BYTES = 850_000;

export interface PreparedUpload {
  data: UploadData;
  thumb: string;
}

function draw(bitmap: ImageBitmap, maxEdge: number): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-canvas");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Resizes a photo in the browser before it is sent: long edge ~1568px JPEG for
 * the model, plus a small thumbnail that is safe to keep in localStorage.
 */
export async function prepareUpload(file: File): Promise<PreparedUpload> {
  if (!file.type.startsWith("image/")) throw new Error("That file isn't a photo. Please choose a JPEG, PNG or WebP image.");
  if (file.size > MAX_RAW_BYTES) throw new Error("That photo is larger than 20 MB. Please choose a smaller one.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That image couldn't be opened. Please try a JPEG or PNG.");
  }
  try {
    // Step the quality (then the size) down until the photo fits the server's
    // per-image cap; a normal phone photo fits on the first try.
    const attempts: Array<[number, number]> = [[MAX_EDGE, 0.82], [MAX_EDGE, 0.68], [1280, 0.68], [1024, 0.6]];
    let base64 = "";
    for (const [edge, quality] of attempts) {
      const url = draw(bitmap, edge).toDataURL("image/jpeg", quality);
      base64 = url.slice(url.indexOf(",") + 1);
      if (base64.length * 0.75 <= MAX_UPLOAD_BYTES) break;
    }
    if (base64.length * 0.75 > MAX_UPLOAD_BYTES) throw new Error("That photo is too detailed to send here. Please try a different one.");
    const thumb = draw(bitmap, THUMB_EDGE).toDataURL("image/jpeg", 0.7);
    return { data: { mediaType: "image/jpeg", dataBase64: base64 }, thumb };
  } finally {
    bitmap.close();
  }
}
