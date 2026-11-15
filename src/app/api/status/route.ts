import { connection } from "next/server";
import { configuredModel, resolveMode } from "@/lib/server/engine";

/** GET /api/status: which engine is active. Never exposes the key itself. */
export async function GET(): Promise<Response> {
  await connection(); // Read the environment at request time, not build time.
  const mode = resolveMode();
  return Response.json({ mode, model: mode === "live" ? configuredModel() : null }, { headers: { "Cache-Control": "no-store" } });
}
