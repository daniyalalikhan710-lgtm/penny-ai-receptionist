import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sampleById } from "@/lib/domain/samples";

const cache = new Map<string, string>();

/**
 * Base64 of a bundled sample photo, for the vision request. The id is checked
 * against the registry, so this can never read an arbitrary path.
 */
export function loadSampleBase64(sampleId: string): string | null {
  const sample = sampleById(sampleId);
  if (!sample) return null;
  const cached = cache.get(sample.id);
  if (cached) return cached;
  try {
    const file = path.join(process.cwd(), "public", "samples", `${sample.id}.jpg`);
    const data = readFileSync(file).toString("base64");
    cache.set(sample.id, data);
    return data;
  } catch {
    return null;
  }
}
