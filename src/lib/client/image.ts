"use client";

import type { UploadData } from "@/lib/domain/chat";

const MAX_EDGE = 1568;
const THUMB_EDGE = 240;
const MAX_RAW_BYTES = 20 * 1024 * 1024;

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
    const full = draw(bitmap, MAX_EDGE).toDataURL("image/jpeg", 0.82);
    const thumb = draw(bitmap, THUMB_EDGE).toDataURL("image/jpeg", 0.7);
    return { data: { mediaType: "image/jpeg", dataBase64: full.slice(full.indexOf(",") + 1) }, thumb };
  } finally {
    bitmap.close();
  }
}
