import { payRequestSchema } from "@/lib/domain/schemas";
import { LIVE_LEAD_ID } from "@/lib/domain/seed";
import { techById } from "@/lib/domain/technicians";
import { diffDays, localDayStr } from "@/lib/domain/time";
import { checkRate, clientIp, crossSiteProblem, readBodyCapped } from "@/lib/server/limits";
import { confirmPayment } from "@/lib/server/tools";

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/pay: the simulated checkout. The *visitor* confirms payment here,
 * never the model. Nothing is charged and no card data is stored or logged;
 * only the well-known 4242 test card is accepted. The amount is always the
 * price book's diagnostic fee, whatever the client sent.
 */
export async function POST(request: Request): Promise<Response> {
  const crossSite = crossSiteProblem(request);
  if (crossSite) return json(crossSite.status, { ok: false, reason: crossSite.reason });

  const rate = await checkRate(clientIp(request.headers));
  if (!rate.ok) return json(429, { ok: false, reason: "Demo limit reached. Give it a minute and try again." });

  let body: unknown;
  try {
    const raw = await readBodyCapped(request, 1_000_000);
    if (raw === null) return json(413, { ok: false, reason: "Request too large." });
    body = JSON.parse(raw);
  } catch {
    return json(400, { ok: false, reason: "Request body must be JSON." });
  }
  const parsed = payRequestSchema.safeParse(body);
  if (!parsed.success) return json(400, { ok: false, reason: "Request did not match the expected shape." });
  const input = parsed.data;
  if (Math.abs(diffDays(input.clock.today, localDayStr(new Date()))) > 1) {
    return json(400, { ok: false, reason: "Your device clock looks wrong. Reload the page and try again." });
  }
  if (input.state.jobs.some((job) => !techById(job.techId))) return json(400, { ok: false, reason: "Unknown technician in state." });

  if (!/^\d{2}\s*\/\s*\d{2}$/.test(input.card.expiry.trim()) || !/^\d{3,4}$/.test(input.card.cvc.trim())) {
    return json(200, { ok: false, reason: "Check the expiry date (MM/YY) and security code." });
  }

  const result = confirmPayment(input.bookingCode, input.card.number, {
    state: { jobs: input.state.jobs, lead: { ...input.state.lead, id: LIVE_LEAD_ID, live: true }, outbox: [], alerts: [] },
    clock: input.clock,
    photo: null,
  });
  // A short pause so the processing state is visible, like a real gateway.
  await new Promise((resolve) => setTimeout(resolve, Number(process.env.PENNY_PAY_DELAY_MS ?? 900)));
  if (!result.ok) return json(200, { ok: false, reason: result.reason });
  return json(200, { ok: true, patches: result.patches, amount: result.amount, last4: "4242", bookingCode: result.job.code });
}
