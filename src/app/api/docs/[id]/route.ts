import { docById } from "@/lib/server/docs";

/** GET /api/docs/:id: a customer-facing document, for the citation drawer. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const doc = docById(id);
  if (!doc) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(doc, { headers: { "Cache-Control": "public, max-age=300" } });
}
