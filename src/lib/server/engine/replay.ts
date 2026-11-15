import "server-only";
import { sampleById } from "@/lib/domain/samples";
import { parseSlotId, SLOT_DURATION } from "@/lib/domain/slots";
import { techById } from "@/lib/domain/technicians";
import { addDays, fmtDayRelative, fmtWindow } from "@/lib/domain/time";
import type { Lang, UiEvent, Urgency, WireMessage } from "@/lib/domain/types";
import { locateQuote, docById, pricingQuote } from "../docs";
import { DIAGNOSTIC_FEE, MEMBER_DISCOUNT_PCT, serviceByCode } from "../pricebook";
import { extractZip } from "../service-area";
import { inlineLabel, type ToolContext, type ToolOutcome } from "../tools";
import { COMPANY } from "@/lib/domain/technicians";
import {
  detectLang,
  runToolWithEvents,
  stripAccents,
  toolContextFor,
  type Emit,
  type Engine,
  type EngineOptions,
  type TurnInput,
} from "./types";

/**
 * The replay engine: used when there is no API key (or PENNY_MODE=replay), and
 * as a fallback if the live budget runs out.
 *
 * Scripts decide what Penny says and which tools to call. Everything else is
 * real: the scripts call the same server tool functions as the live engine,
 * so prices, slots, bookings, state patches and cards are genuinely computed.
 * Only the language model's choices are scripted.
 */

export const OFF_SCRIPT_EN =
  "Penny's live AI is switched off in this preview. Try one of the suggested prompts.";
const OFF_SCRIPT_ES =
  "La IA en vivo de Penny está desactivada en esta vista previa. Pruebe una de las sugerencias.";

function envPace(): number {
  const raw = process.env.PENNY_REPLAY_PACE;
  if (raw === undefined || raw === "") return 1;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : 1;
}

interface Script {
  /** For tests and the eval harness. */
  id: string;
  run: (r: Replay) => Promise<void>;
}

class Replay {
  readonly tool: ToolContext;
  lang: Lang;
  scriptId = "";
  private aborted = false;

  constructor(
    readonly input: TurnInput,
    private readonly emit: Emit,
    private readonly pace: number,
    signal?: AbortSignal,
  ) {
    this.tool = toolContextFor(input);
    this.lang = input.state.lead.language;
    signal?.addEventListener("abort", () => {
      this.aborted = true;
    });
  }

  t(en: string, es: string): string {
    return this.lang === "es" ? es : en;
  }

  private async wait(ms: number): Promise<void> {
    if (this.pace <= 0 || this.aborted) return;
    await new Promise((resolve) => setTimeout(resolve, ms * this.pace));
  }

  /** A short pause, like a model reading the message before it answers. */
  async think(ms = 450): Promise<void> {
    await this.wait(ms);
  }

  /** Streams text a word at a time at a natural pace. */
  async say(text: string): Promise<void> {
    const chunks = text.match(/\S+\s*|\s+/g) ?? [text];
    for (const chunk of chunks) {
      if (this.aborted) return;
      this.emit({ type: "text", text: chunk });
      await this.wait(chunk.includes("\n") ? 90 : 26);
    }
  }

  /** Attaches a citation to the text just said. The quote must exist verbatim. */
  cite(docId: string, quote: string): void {
    const doc = docById(docId);
    const range = locateQuote(docId, quote);
    if (!doc || !range) return; // A unit test guarantees script quotes exist.
    this.emit({
      type: "citation",
      citation: { docId, docTitle: doc.title, quote, start: range.start, end: range.end },
    });
  }

  async call(name: string, input: unknown): Promise<ToolOutcome> {
    await this.wait(280);
    const outcome = runToolWithEvents(name, input, this.tool, this.emit);
    await this.wait(220);
    return outcome;
  }

  get lead() {
    return this.tool.state.lead;
  }

  firstName(): string {
    const name = this.lead.customerName;
    return name && name !== "Website visitor" ? name.split(" ")[0] : "";
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function slotText(r: Replay, slotIdValue: string, lang: Lang = r.lang): { when: string; tech: string } | null {
  const parsed = parseSlotId(slotIdValue);
  if (!parsed) return null;
  return {
    when: inlineLabel(`${fmtDayRelative(parsed.date, r.input.clock.today, lang)}, ${fmtWindow(parsed.startMin, SLOT_DURATION)}`),
    tech: techById(parsed.techId)?.name.split(" ")[0] ?? "your technician",
  };
}

const CREDIT_QUOTE = `the full $${DIAGNOSTIC_FEE} is credited toward your invoice`;

function money(n: unknown): string {
  return `$${Number(n).toLocaleString("en-US")}`;
}

interface ServiceHit {
  code: string;
}

/** Maps free text to a price-book service. Order matters: specific first. */
function serviceFromText(raw: string): ServiceHit | null {
  const text = stripAccents(raw.toLowerCase());
  const tune = /tune|maintenance|service check|mantenimiento/.test(text);
  if (/tankless/.test(text)) return { code: "WH-TANKLESS" };
  if (/water heater|hot water|calentador/.test(text)) {
    return { code: /replac|new |install|nuevo/.test(text) ? "WH-REPLACE" : "WH-REPAIR" };
  }
  if (/heat pump|bomba de calor/.test(text)) return { code: "HEATPUMP-REPAIR" };
  if (/thermostat|termostato/.test(text)) return { code: "THERMOSTAT" };
  if (/\bac\b|a\/c|air condition|aire acondicionado|cooling|not cooling/.test(text)) {
    return { code: tune ? "AC-TUNEUP" : "AC-REPAIR" };
  }
  if (/furnace|heater|no heat|heating|calefaccion|caldera/.test(text)) {
    return { code: tune ? "FURNACE-TUNEUP" : "FURNACE-REPAIR" };
  }
  if (/sewer|main line|alcantarilla/.test(text)) return { code: "SEWER-MAIN" };
  if (/toilet|inodoro|sanitario/.test(text)) return { code: "TOILET-REPAIR" };
  if (/disposal|triturador/.test(text)) return { code: "DISPOSAL" };
  if (/sump/.test(text)) return { code: "SUMP" };
  if (/faucet|tap\b|grifo|llave/.test(text)) return { code: "FAUCET" };
  const leaking = /leak|drip|burst|corrod|fuga|gotea/.test(text);
  const blocked = /drain|clog|backed up|backing up|won't drain|wont drain|slow|standing water|desague|tapad/.test(text);
  if (leaking && !blocked) return { code: "LEAK-REPAIR" };
  if (blocked || /sink|shower|tub|fregadero/.test(text)) return { code: "DRAIN-CLEAR" };
  if (/pipe|tuberia/.test(text)) return { code: "LEAK-REPAIR" };
  return null;
}

function lastOf<R extends WireMessage["role"]>(
  messages: WireMessage[],
  role: R,
  before = messages.length,
): Extract<WireMessage, { role: R }> | null {
  for (let i = before - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === role) return m as Extract<WireMessage, { role: R }>;
  }
  return null;
}

/** The booking code Penny most recently looked up, if any. */
function codeUnderDiscussion(messages: WireMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant") {
      const hit = m.tools.find((tool) => tool.name === "lookup_booking" && !tool.isError);
      const code = (hit?.output as { booking_code?: unknown } | undefined)?.booking_code;
      if (typeof code === "string") return code;
    }
    if (m.role === "user") {
      const match = m.text.match(/CPL[-\s]?(\d{4,6})/i);
      if (match) return `CPL-${match[1]}`;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Scripts: sample photos                                              */
/* ------------------------------------------------------------------ */

interface PhotoScript {
  summary: string;
  whatISee: string;
  issue: string;
  confidence: "low" | "medium" | "high";
  severity: Urgency;
  steps: string[];
  serviceCode: string;
  opener: string;
  explain: string;
  /** Optional citation attached to the explanation. */
  cite?: { doc: string; quote: string };
}

export const PHOTO_SCRIPTS: Record<string, PhotoScript> = {
  "water-heater": {
    summary: "Water heater leaking; photo shows streaks running down the tank from the top fittings.",
    whatISee: "A tank water heater with dark streaks running down the jacket from the fittings on top.",
    issue: "Leak at a top connection or valve",
    confidence: "medium",
    severity: "urgent",
    steps: [
      "Close the cold-water supply valve on top of the heater (turn it clockwise).",
      "Switch the heater off: gas control knob to OFF, or its breaker if it is electric.",
      "Put a bucket or towels under the drip and keep the area clear.",
      "Don't touch the tank or the relief valve if they are hot.",
    ],
    serviceCode: "WH-REPAIR",
    opener: "Thanks for the photo. Let me take a look.",
    explain:
      "Those streaks start at the fittings on top of the tank, which usually means a leaking connection or valve rather than the tank itself. That's good news: it's normally a repair, not a replacement. Shutting off the cold-water supply will stop it getting worse.",
    cite: { doc: "emergency", quote: "Turn the cold-water supply valve on top of the heater clockwise to close it." },
  },
  "clogged-sink": {
    summary: "Kitchen sink will not drain; photo shows a basin full of standing water.",
    whatISee: "A kitchen sink basin full to the rim with standing soapy water. The strainer has been pulled out and it still isn't draining.",
    issue: "Clogged kitchen drain line",
    confidence: "high",
    severity: "soon",
    steps: [
      "Stop running water into that basin.",
      "Don't run the dishwasher or disposal until the line is cleared.",
      "Skip chemical drain cleaners: they rarely clear a full blockage and are harsh on pipes.",
    ],
    serviceCode: "DRAIN-CLEAR",
    opener: "Thanks, that photo helps.",
    explain:
      "With the strainer out and the water still sitting there, the blockage is further down the drain line, past the trap. That needs a cable to clear properly.",
  },
  "ac-unit": {
    summary: "Mini-split AC running but not cooling; nothing visibly wrong with the outdoor unit in the photo.",
    whatISee: "A ductless mini-split outdoor unit. I can't see ice, damage or debris on it from this angle.",
    issue: "Cooling fault inside the system",
    confidence: "low",
    severity: "soon",
    steps: [
      "Check the indoor unit's filter and rinse it if it is dusty.",
      "Make sure the remote is set to COOL, not FAN or DRY.",
      "If you see ice on the lines or the indoor coil, switch the system off and let it thaw.",
    ],
    serviceCode: "AC-REPAIR",
    opener: "Got the photo, thanks.",
    explain:
      "The outdoor unit looks fine from the outside, so I can't pin this down from a photo alone. When a system runs without cooling, the usual causes are low refrigerant, a dirty coil or a failed capacitor, and a technician needs gauges to tell which.",
  },
  thermostat: {
    summary: "Thermostat shows heat mode at 69°F but vents blow cold; likely a furnace fault rather than the thermostat.",
    whatISee: "A smart thermostat in heat mode, reading 69° with the setpoint at 69°. The thermostat itself looks like it is working.",
    issue: "Furnace not producing heat",
    confidence: "medium",
    severity: "soon",
    steps: [
      "Check the furnace filter and replace it if it is clogged.",
      "Make sure the furnace's power switch and breaker are on.",
      "If you smell gas at any point, leave the house and call your gas utility.",
    ],
    serviceCode: "FURNACE-REPAIR",
    opener: "Thanks, I can read the display clearly.",
    explain:
      "Your thermostat is calling for heat normally, so the problem is most likely at the furnace: a dirty flame sensor or a failed igniter are the common ones when the fan runs but the air stays cold.",
  },
  "pipe-joint": {
    summary: "Heavily corroded pipe fitting, no active leak yet; customer wants it checked before it fails.",
    whatISee: "A metal pipe fitting with heavy corrosion: white scale, rust spots and green patina. I don't see an active drip.",
    issue: "Advanced corrosion on a fitting",
    confidence: "medium",
    severity: "soon",
    steps: [
      "Find the shut-off valve for that line so you can close it quickly if it starts to drip.",
      "Don't scrape or tighten the fitting: corroded metal can give way.",
      "Keep the area dry and check it daily until it is replaced.",
    ],
    serviceCode: "LEAK-REPAIR",
    opener: "Thanks for sending that.",
    explain:
      "It isn't leaking in the photo, but that much scale and green patina means the metal has been weeping and thinning for a while. I'd replace the fitting before it lets go rather than after.",
  },
  toilet: {
    summary: "Toilet keeps running after flushing; likely a worn flapper or fill valve.",
    whatISee: "A two-piece toilet with the tank, flush lever and supply valve visible. Nothing looks cracked or leaking on the outside.",
    issue: "Worn flapper or fill valve",
    confidence: "medium",
    severity: "routine",
    steps: [
      "Turn the supply valve at the wall clockwise to stop the water between uses.",
      "Lift the tank lid and check that the flapper chain isn't tangled.",
      "A running toilet wastes a lot of water, so it is worth fixing this week.",
    ],
    serviceCode: "TOILET-REPAIR",
    opener: "Thanks for the photo.",
    explain:
      "Nothing is wrong on the outside, which fits a running toilet: the cause is almost always inside the tank, a flapper that no longer seals or a fill valve that doesn't shut off.",
  },
};

function photoScript(sampleId: string): Script {
  const script = PHOTO_SCRIPTS[sampleId];
  return {
    id: `photo:${sampleId}`,
    run: async (r) => {
      await r.think(700);
      await r.say(script.opener);
      await r.call("update_lead", {
        summary_en: script.summary,
        intent: "booking",
        urgency: script.severity,
        customer_language: "en",
        customer_name: null,
      });
      const diagnosis = await r.call("report_photo_diagnosis", {
        is_home_repair_photo: true,
        what_i_see: script.whatISee,
        likely_issue: script.issue,
        confidence: script.confidence,
        severity: script.severity,
        immediate_steps: script.steps,
        service_code: script.serviceCode,
      });
      await r.say(script.explain);
      if (script.cite) r.cite(script.cite.doc, script.cite.quote);
      const out = diagnosis.output as { service?: string; price_low_usd?: number; price_high_usd?: number };
      await r.say(
        ` ${out.service} typically runs ${money(out.price_low_usd)} to ${money(out.price_high_usd)} from our price book,`,
      );
      r.cite("pricing", pricingQuote(script.serviceCode));
      await r.say(` and the ${money(DIAGNOSTIC_FEE)} diagnostic fee is credited toward the repair.`);
      r.cite("pricing", CREDIT_QUOTE);
      await r.say("\n\nHere are the earliest times I can get someone out:");
      const slots = await r.call("find_available_slots", {
        service_code: script.serviceCode,
        urgency: script.severity,
        preferred_date: null,
        reschedule_booking_code: null,
      });
      if (slots.isError) {
        await r.say(" I couldn't find an open window this week. Would you like a call back from our office?");
      } else {
        await r.say("Tap a time and I'll hold it for you.");
        await afterHoursNote(r, script.severity, slots);
      }
    },
  };
}

/**
 * Outside working hours the first open window is tomorrow. For something
 * urgent, say what the documents promise: emergency dispatch around the clock.
 */
async function afterHoursNote(r: Replay, urgency: Urgency, offered: ToolOutcome): Promise<void> {
  if (urgency !== "urgent" && urgency !== "emergency") return;
  const card = offered.card;
  const sameDay = card?.kind === "slots" && card.slots.some((slot) => slot.date === r.input.clock.today);
  if (sameDay || offered.isError) return;
  await r.say(
    r.t(
      " If it can't wait until then, tell me and I'll have our after-hours dispatcher call you: emergency dispatch runs around the clock,",
      " Si no puede esperar hasta entonces, dígamelo y haré que le llame nuestro despachador nocturno: el servicio de emergencia funciona las 24 horas,",
    ),
  );
  r.cite("service-area", "Emergency dispatch for active leaks, no heat in freezing weather and similar urgent problems is available around the clock");
  await r.say(r.t(" with a flat after-hours surcharge.", " con un recargo fijo fuera de horario."));
  r.cite("pricing", "Visits that start outside those hours add a flat $95 after-hours surcharge.");
}

/* ------------------------------------------------------------------ */
/* Scripts: UI events (the booking flow)                               */
/* ------------------------------------------------------------------ */

function eventScript(event: UiEvent, messages: WireMessage[]): Script {
  switch (event.kind) {
    case "slot_selected":
      if (event.purpose === "reschedule" && event.bookingCode) {
        const code = event.bookingCode;
        return {
          id: "event:reschedule_slot",
          run: async (r) => {
            await r.think();
            const result = await r.call("reschedule_booking", { booking_code: code, slot_id: event.slotId });
            if (result.isError) {
              await r.say(r.t("I couldn't move it to that time: ", "No pude cambiarla a ese horario: "));
              await r.say(String(result.output.error));
              return;
            }
            const slot = slotText(r, event.slotId);
            await r.say(
              r.t(
                `Done. ${code} is now ${slot?.when} with ${slot?.tech}, and there's no charge for the change.`,
                `Listo. ${code} ahora es ${slot?.when} con ${slot?.tech}, sin costo por el cambio.`,
              ),
            );
            r.cite("booking-policy", "You can reschedule free of charge up to 2 hours before your arrival window starts.");
            await r.say(r.t(" I've sent an updated confirmation text.", " Le envié un mensaje con la confirmación actualizada."));
            await r.call("update_lead", {
              summary_en: `Rescheduled ${code} to ${slotText(r, event.slotId, "en")?.when ?? "a new window"} at the customer's request.`,
              intent: "reschedule",
              urgency: "routine",
              customer_language: r.lang,
              customer_name: null,
            });
          },
        };
      }
      return {
        id: "event:booking_slot",
        run: async (r) => {
          await r.think();
          const slot = slotText(r, event.slotId);
          await r.say(r.t(`Good choice: ${slot?.when} with ${slot?.tech}.`, `Buena elección: ${slot?.when} con ${slot?.tech}.`));
          const result = await r.call("request_customer_details", { slot_id: event.slotId, service_code: event.serviceCode });
          if (result.isError) {
            await r.say(
              r.t(
                " I'm sorry, that window was just taken. Here are the current openings:",
                " Disculpe, ese horario acaba de ocuparse. Estos son los horarios disponibles:",
              ),
            );
            await r.call("find_available_slots", {
              service_code: event.serviceCode,
              urgency: r.lead.urgency,
              preferred_date: null,
              reschedule_booking_code: null,
            });
            return;
          }
          await r.say(
            r.t(
              "Please check these details so the technician knows where to go.",
              "Revise estos datos para que el técnico sepa a dónde ir.",
            ),
          );
        },
      };

    case "details_submitted":
      return {
        id: "event:details",
        run: async (r) => {
          await r.think();
          const d = event.details;
          const result = await r.call("create_booking", {
            service_code: event.serviceCode,
            slot_id: event.slotId,
            customer_name: d.name,
            phone: d.phone,
            email: d.email,
            address: d.address,
            zip: d.zip,
            issue_summary_en: r.lead.summary || `${serviceByCode(event.serviceCode)?.name ?? "Service"} visit requested via website chat.`,
            urgency: r.lead.urgency,
          });
          if (result.isError) {
            const reason = String(result.output.error);
            if (/outside the service area/.test(reason)) {
              await r.say(
                r.t(
                  `I'm sorry, ${d.zip} is outside the area we serve, so I can't book a visit at that address. If the ZIP code was a typo, correct it in the form above and confirm again.`,
                  `Lo siento, ${d.zip} está fuera de nuestra zona de servicio, así que no puedo agendar una visita en esa dirección. Si el código postal tenía un error, corríjalo en el formulario de arriba y confirme de nuevo.`,
                ),
              );
              r.cite("service-area", "If your ZIP code is not listed, we cannot schedule a visit there.");
            } else if (/just taken|already started|too soon/.test(reason)) {
              await r.say(r.t("I'm sorry, that window is no longer available. Here are the current openings:", "Disculpe, ese horario ya no está disponible. Estos son los horarios actuales:"));
              await r.call("find_available_slots", { service_code: event.serviceCode, urgency: r.lead.urgency, preferred_date: null, reschedule_booking_code: null });
            } else {
              await r.say(
                r.t(
                  "I couldn't hold that visit with those details. Please check the form above and confirm again.",
                  "No pude reservar la visita con esos datos. Revise el formulario de arriba y confirme de nuevo.",
                ),
              );
            }
            return;
          }
          const slot = slotText(r, event.slotId);
          const first = d.name.split(" ")[0];
          await r.say(
            r.t(
              `Thanks, ${first}. I'm holding ${slot?.when} with ${slot?.tech} for you. The ${money(DIAGNOSTIC_FEE)} diagnostic fee secures the visit and comes off the repair if you go ahead.`,
              `Gracias, ${first}. Le estoy reservando ${slot?.when} con ${slot?.tech}. El diagnóstico de ${money(DIAGNOSTIC_FEE)} asegura la visita y se descuenta de la reparación si decide hacerla.`,
            ),
          );
          r.cite("booking-policy", "The diagnostic fee is collected when you book and holds your window.");
        },
      };

    case "payment_confirmed":
      return {
        id: "event:payment",
        run: async (r) => {
          await r.think(300);
          const result = await r.call("send_confirmation", { booking_code: event.bookingCode });
          if (result.isError) {
            await r.say(
              r.t(
                "I don't see that payment yet. Please finish the checkout card above and I'll confirm right away.",
                "Aún no veo el pago. Complete el pago en la tarjeta de arriba y confirmo enseguida.",
              ),
            );
            return;
          }
          const out = result.output as { when?: string; technician?: string; booking_code?: string };
          const job = r.tool.state.jobs.find((j) => j.code === out.booking_code);
          const slot = job ? slotText(r, `${job.techId}|${job.date}|${job.startMin}`) : null;
          await r.say(
            r.t(
              `You're all set. ${slot?.tech ?? "Your technician"} will arrive ${slot?.when ?? out.when}, and I've sent your confirmation by text and email.`,
              `Todo listo. ${slot?.tech ?? "Su técnico"} llegará ${slot?.when ?? out.when}, y le envié la confirmación por mensaje de texto y correo.`,
            ),
          );
          await r.say(
            r.t(
              ` One thing worth knowing: Care Club members skip the diagnostic fee and get ${MEMBER_DISCOUNT_PCT}% off repairs. Your technician can tell you more on the day, no pressure.`,
              ` Un dato útil: los miembros del Care Club no pagan el diagnóstico y tienen ${MEMBER_DISCOUNT_PCT}% de descuento en reparaciones. Su técnico puede contarle más, sin compromiso.`,
            ),
          );
          r.cite("care-club", "Members never pay the diagnostic fee.");
          await r.call("update_lead", {
            summary_en: `${r.lead.summary ? `${r.lead.summary} ` : ""}Booked ${out.booking_code} (${job?.serviceName ?? "service visit"}) for ${out.when} with ${out.technician}; diagnostic fee paid.`.slice(0, 380),
            intent: "booking",
            urgency: r.lead.urgency,
            customer_language: r.lang,
            customer_name: job?.customerName ?? null,
          });
        },
      };

    case "callback_requested":
      return {
        id: "event:callback",
        run: async (r) => {
          await r.think(300);
          const emergency = r.lead.emergency;
          const result = await r.call("request_callback", {
            phone: event.phone,
            reason_en: r.lead.summary || "Customer asked to speak with a person.",
            priority: emergency ? "emergency" : "standard",
          });
          if (result.isError) {
            await r.say(r.t("That number doesn't look right. Could you check it?", "Ese número no parece correcto. ¿Puede revisarlo?"));
            return;
          }
          await r.call("update_lead", {
            summary_en: emergency
              ? `${r.lead.summary} Callback requested on ${event.phone}; Penny told the customer a dispatcher will call within 5 minutes.`.trim().slice(0, 380)
              : `Customer asked to speak with a person. Callback requested on ${event.phone}.`,
            intent: emergency ? "emergency" : "other",
            urgency: r.lead.urgency,
            customer_language: r.lang,
            customer_name: null,
          });
          await r.say(
            emergency
              ? r.t(
                  `A Copperline dispatcher will call you at ${event.phone} within 5 minutes. Please stay outside until emergency responders say it's safe to go back in.`,
                  `Un despachador de Copperline le llamará al ${event.phone} en los próximos 5 minutos. Permanezca afuera hasta que los servicios de emergencia indiquen que es seguro volver.`,
                )
              : r.t(
                  `Done. Someone from the Copperline team will call you at ${event.phone} within one business hour. They'll have this conversation in front of them, so you won't need to repeat yourself.`,
                  `Listo. Alguien del equipo de Copperline le llamará al ${event.phone} dentro de una hora hábil. Tendrán esta conversación a la vista, así que no tendrá que repetir nada.`,
                ),
          );
        },
      };

    case "handback":
      return {
        id: "event:handback",
        run: async (r) => {
          await r.think(500);
          const staff = lastOf(messages, "staff");
          const name = r.firstName();
          const hello = name ? `, ${name}` : "";
          if (!staff) {
            await r.say(r.t(`I'm back${hello}. What else can I help with?`, `Ya estoy de vuelta${hello}. ¿En qué más le ayudo?`));
            return;
          }
          const quote = staff.text.length > 160 ? `${staff.text.slice(0, 157)}…` : staff.text;
          await r.say(
            r.t(
              `Thanks, ${staff.name}. I'm back with you${hello}. So we're on the same page, ${staff.name}'s note was: “${quote}” Is there anything else I can help with?`,
              `Gracias, ${staff.name}. Ya estoy de vuelta${hello}. Para que quede claro, la nota de ${staff.name} fue: “${quote}” ¿Le ayudo con algo más?`,
            ),
          );
          await r.call("update_lead", {
            summary_en: `${r.lead.summary ? `${r.lead.summary} ` : ""}${staff.name} took over the chat and told the customer: “${quote}” Handed back to Penny.`.slice(0, 390),
            intent: r.lead.intent,
            urgency: r.lead.urgency,
            customer_language: r.lang,
            customer_name: null,
          });
        },
      };
  }
}

/* ------------------------------------------------------------------ */
/* Scripts: typed text                                                 */
/* ------------------------------------------------------------------ */

const EMERGENCY_PATTERNS: Array<{ kind: "gas" | "co" | "electrical" | "flood"; re: RegExp; summary: string }> = [
  { kind: "gas", re: /(smell|smelling|huele|olor).{0,25}\bgas\b|\bgas\b.{0,15}(leak|smell|odor)|fuga de gas/, summary: "Customer reports smelling gas at home." },
  { kind: "co", re: /carbon monoxide|\bco\b (alarm|detector)|monoxido/, summary: "Customer reports a carbon monoxide alarm sounding." },
  { kind: "electrical", re: /spark|burning smell|smells? (like )?burn|smoke coming|chispa|olor a quemado/, summary: "Customer reports sparking or a burning smell from equipment." },
  { kind: "flood", re: /flood|burst pipe|pipe burst|water (is )?(everywhere|pouring|gushing)|inundac|inundad/, summary: "Customer reports active flooding or a burst pipe." },
];

function emergencyScript(kind: "gas" | "co" | "electrical" | "flood", summary: string): Script {
  return {
    id: `emergency:${kind}`,
    run: async (r) => {
      await r.call("flag_emergency", { kind, summary_en: summary, customer_language: r.lang });
      if (kind === "gas") {
        await r.say(
          r.t(
            "Please leave the house right now and take everyone with you. Don't touch light switches or appliances on your way out.",
            "Por favor salga de la casa ahora mismo con todas las personas. No toque interruptores ni aparatos al salir.",
          ),
        );
        r.cite("emergency", "If you smell gas, leave the building immediately and take everyone with you.");
        await r.say(
          r.t(
            " Once you're outside and away from the building, call 911 or your gas utility's emergency line.",
            " Una vez afuera y lejos del edificio, llame al 911 o a la línea de emergencias de su compañía de gas.",
          ),
        );
        r.cite("emergency", "Once you are outside and away from the building, call 911 or your gas utility's emergency line.");
      } else if (kind === "co") {
        await r.say(
          r.t(
            "Please get everyone outside into fresh air right now, then call 911 from outside.",
            "Por favor saque a todos al aire libre ahora mismo y llame al 911 desde afuera.",
          ),
        );
        r.cite("emergency", "If a carbon monoxide alarm sounds, get everyone outside into fresh air right away and call 911.");
      } else if (kind === "electrical") {
        await r.say(
          r.t(
            "Please move away from that equipment and don't touch it. If you see smoke or fire, call 911.",
            "Por favor aléjese de ese equipo y no lo toque. Si hay humo o fuego, llame al 911.",
          ),
        );
        r.cite("emergency", "Call 911 if there is smoke or fire. Do not touch the equipment.");
      } else {
        await r.say(
          r.t(
            "First, shut off the water at the main shut-off valve, and keep clear of any standing water near outlets or appliances.",
            "Primero cierre la llave de paso principal y manténgase lejos del agua acumulada cerca de enchufes o aparatos.",
          ),
        );
        r.cite("emergency", "Shut off the water at the main shut-off valve, usually where the water line enters the home or beside the water meter.");
      }
      await r.say(
        r.t(
          "\n\nI've alerted the Copperline team. When you're safe, tap the button on the card and a dispatcher will call you straight back.",
          "\n\nYa avisé al equipo de Copperline. Cuando esté a salvo, toque el botón de la tarjeta y un despachador le llamará de inmediato.",
        ),
      );
    },
  };
}

const zipScript = (zip: string): Script => ({
  id: "zip",
  run: async (r) => {
    await r.think();
    const result = await r.call("check_service_area", { zip });
    const out = result.output as { in_service_area?: boolean; town?: string };
    if (out.in_service_area) {
      await r.say(r.t(`Yes, we do. ${zip} is ${out.town}, which is inside our service area,`, `Sí. ${zip} es ${out.town}, dentro de nuestra zona de servicio,`));
      await r.say(r.t(" and there's no trip charge.", " y no cobramos desplazamiento."));
      r.cite("service-area", "There is no travel or trip charge anywhere inside the service area.");
      await r.say(r.t(" What's going on at your place?", " ¿Qué problema tiene en casa?"));
    } else {
      await r.say(
        r.t(
          `I'm sorry, we don't schedule visits in ${zip} yet. Copperline covers the Riverbend metro area, ZIP codes 97401 to 97412.`,
          `Lo siento, todavía no agendamos visitas en ${zip}. Copperline cubre el área metropolitana de Riverbend, códigos postales 97401 a 97412.`,
        ),
      );
      r.cite("service-area", "If your ZIP code is not listed, we cannot schedule a visit there.");
      await r.say(
        r.t(
          " We do keep a waitlist for nearby towns. If you'd like to be on it, send me a phone number and our office will be in touch.",
          " Tenemos una lista de espera para zonas cercanas. Si quiere anotarse, envíeme un teléfono y nuestra oficina le contactará.",
        ),
      );
      r.cite("service-area", "We keep a waitlist for nearby towns and will let you know if we expand.");
    }
    await r.call("update_lead", {
      summary_en: out.in_service_area
        ? `Asked whether we serve ${zip}; confirmed it is in the service area (${out.town}).`
        : `Asked whether we serve ${zip}; it is outside the service area. Offered the expansion waitlist.`,
      intent: "question",
      urgency: "routine",
      customer_language: r.lang,
      customer_name: null,
    });
  },
});

const warrantyScript: Script = {
  id: "warranty",
  run: async (r) => {
    await r.think();
    await r.say("Every repair we do carries a 2-year warranty on parts and labor.");
    r.cite("warranty", "All repairs carry a 2-year warranty on parts and labor.");
    await r.say(" If a repair fails in that time, we come back and fix it at no charge.");
    r.cite("warranty", "If a repair we made fails within that period, we come back and fix it at no charge.");
    await r.say("\n\nTwo things work a little differently: drain clearing is guaranteed for 30 days,");
    r.cite("warranty", "Drain and sewer clearing is guaranteed for 30 days.");
    await r.say(" and new equipment we install keeps its manufacturer's warranty plus a 2-year Copperline labor warranty.");
    r.cite("warranty", "plus a 2-year Copperline labor warranty on the installation");
    await r.say(" Is there a particular repair you're asking about?");
    await r.call("update_lead", {
      summary_en: "Asked about the warranty on repairs; Penny explained the 2-year parts and labor warranty.",
      intent: "question",
      urgency: "routine",
      customer_language: "en",
      customer_name: null,
    });
  },
};

const humanScript: Script = {
  id: "are_you_human",
  run: async (r) => {
    await r.think();
    await r.say(r.t("I'm Penny, Copperline's AI receptionist, so no, not a person.", "Soy Penny, la recepcionista con IA de Copperline; no soy una persona."));
    r.cite("faq", "No. Penny is Copperline's AI receptionist.");
    await r.say(
      r.t(
        " I can answer questions, give price ranges from our price book, look at photos of a problem and book a visit. If you'd rather deal with a person, just say so and someone from the team will take over.",
        " Puedo responder preguntas, dar rangos de precios, revisar fotos del problema y agendar una visita. Si prefiere hablar con una persona, dígamelo y alguien del equipo continuará la conversación.",
      ),
    );
    r.cite("faq", "You can ask for a person at any time and a member of the Copperline team will take over the chat or call you back.");
  },
};

const wantsHumanScript: Script = {
  id: "wants_human",
  run: async (r) => {
    await r.think();
    await r.say(
      r.t(
        "Of course. I'll have someone from the Copperline team call you. What's the best number to reach you on?",
        "Por supuesto. Haré que alguien del equipo de Copperline le llame. ¿A qué número le podemos llamar?",
      ),
    );
    await r.call("update_lead", {
      summary_en: "Customer asked to speak with a person; Penny is collecting a callback number.",
      intent: "other",
      urgency: r.lead.urgency,
      customer_language: r.lang,
      customer_name: null,
    });
  },
};

const injectionScript: Script = {
  id: "injection",
  run: async (r) => {
    await r.think();
    await r.say(
      "I can't do that. I'm here to help with Copperline's plumbing, heating and cooling services, and I can't change prices, apply discounts that aren't in the price book, or share my internal instructions.",
    );
    await r.say(" The one real saving I can point to is the Care Club: members pay no diagnostic fee and get 15% off every repair.");
    r.cite("care-club", "Members never pay the diagnostic fee.");
    await r.say(" Is there a repair I can help you with?");
    await r.call("update_lead", {
      summary_en: "Visitor tried to get Penny to ignore her instructions or give an unauthorised discount; declined politely.",
      intent: "other",
      urgency: "routine",
      customer_language: "en",
      customer_name: null,
    });
  },
};

const financingScript: Script = {
  id: "financing",
  run: async (r) => {
    await r.think();
    await r.say("Yes. Financing is available on any single job over $500.");
    r.cite("financing", "Financing is available on any single job over $500, such as a water heater replacement or a new furnace.");
    await r.say(" There's a 0% plan if it's paid within 12 months on jobs up to $2,999, and fixed monthly payments on larger ones.");
    r.cite("financing", "0% interest if paid in full within 12 months, on jobs from $500 to $2,999.");
    await r.say(" Your technician can start the application on site once you have a fixed price. I can't quote a monthly payment myself, since the lender sets the rates.");
    r.cite("financing", "Penny cannot quote a monthly payment or approve an application.");
  },
};

const careClubScript: Script = {
  id: "care_club",
  run: async (r) => {
    await r.think();
    await r.say("The Care Club is our maintenance membership: $19 a month, cancel any time.");
    r.cite("care-club", "It costs $19 per month, billed monthly, and you can cancel at any time.");
    await r.say(" Members never pay the diagnostic fee,");
    r.cite("care-club", "Members never pay the diagnostic fee.");
    await r.say(" get 15% off every repair, and a furnace and an AC tune-up are included each year.");
    r.cite("care-club", "One furnace tune-up and one air conditioner tune-up each year, included.");
    await r.say(" You can join when you book or at any visit.");
  },
};

const hoursScript: Script = {
  id: "hours",
  run: async (r) => {
    await r.think();
    await r.say("Our technicians are out 8 AM to 6 PM, seven days a week, weekends included.");
    r.cite("service-area", "Technicians are on the road 8:00 AM to 6:00 PM, seven days a week.");
    await r.say(" For urgent problems like an active leak, emergency dispatch runs around the clock, with a flat after-hours surcharge outside those hours.");
    r.cite("pricing", "Visits that start outside those hours add a flat $95 after-hours surcharge.");
  },
};

const policyScript: Script = {
  id: "booking_policy",
  run: async (r) => {
    await r.think();
    await r.say("You can reschedule for free up to 2 hours before your arrival window.");
    r.cite("booking-policy", "You can reschedule free of charge up to 2 hours before your arrival window starts.");
    await r.say(" If you cancel at least 24 hours ahead, the diagnostic fee is refunded in full; later than that, it stays on your account as a credit for 12 months.");
    r.cite("booking-policy", "Cancel at least 24 hours before your window and the diagnostic fee is refunded in full.");
    await r.say(" If you have a booking code, I can look it up and move or cancel it for you.");
  },
};

const licensedScript: Script = {
  id: "licensed",
  run: async (r) => {
    await r.think();
    await r.say("Yes. Every Copperline technician is licensed for their trade, background-checked and insured.");
    r.cite("faq", "Every Copperline technician is licensed for the trade they work in, background-checked and covered by our liability insurance.");
  },
};

const greetingScript: Script = {
  id: "greeting",
  run: async (r) => {
    await r.think(300);
    await r.say(
      r.t(
        "Hi! I'm Penny, Copperline's AI receptionist. Tell me what's going on, or send a photo of the problem, and I'll give you a price range and the earliest time we can come out.",
        "¡Hola! Soy Penny, la recepcionista con IA de Copperline. Cuénteme qué sucede o envíe una foto del problema, y le doy un rango de precio y el primer horario disponible.",
      ),
    );
  },
};

const thanksScript: Script = {
  id: "thanks",
  run: async (r) => {
    await r.think(300);
    await r.say(r.t("You're welcome! I'm here if anything else comes up.", "¡Con gusto! Aquí estoy si necesita algo más."));
  },
};

const offScript: Script = {
  id: "off_script",
  run: async (r) => {
    await r.think(300);
    await r.say(r.t(OFF_SCRIPT_EN, OFF_SCRIPT_ES));
  },
};

const askCodeScript: Script = {
  id: "ask_code",
  run: async (r) => {
    await r.think();
    await r.say(
      r.t(
        "Happy to help with that. What's your booking code? It starts with CPL and is in your confirmation text.",
        "Con gusto. ¿Cuál es su código de reserva? Empieza con CPL y está en su mensaje de confirmación.",
      ),
    );
  },
};

function rescheduleScript(code: string): Script {
  return {
    id: "reschedule",
    run: async (r) => {
      await r.think();
      const found = await r.call("lookup_booking", { booking_code: code });
      if (found.isError) {
        await r.say(r.t(`I couldn't find a booking with the code ${code}. Could you check it? It starts with CPL.`, `No encontré una reserva con el código ${code}. ¿Puede revisarlo? Empieza con CPL.`));
        return;
      }
      const raw = found.output as { service?: string; service_code?: string; when?: string; technician?: string; customer_first_name?: string; status?: string };
      const out = { ...raw, customer: raw.customer_first_name };
      if (out.status === "cancelled") {
        await r.say(r.t("That booking was cancelled, so there's nothing to move. Would you like to book a new visit?", "Esa reserva fue cancelada. ¿Quiere agendar una visita nueva?"));
        return;
      }
      const first = out.customer?.split(" ")[0];
      await r.say(
        r.t(
          `Found it${first ? `, ${first}` : ""}: your ${out.service?.toLowerCase()} with ${out.technician?.split(" ")[0]}, ${inlineLabel(out.when ?? "")}.`,
          `La encontré${first ? `, ${first}` : ""}: ${out.service?.toLowerCase()} con ${out.technician?.split(" ")[0]}, ${inlineLabel(out.when ?? "")}.`,
        ),
      );
      const slots = await r.call("find_available_slots", {
        service_code: out.service_code,
        urgency: "routine",
        preferred_date: null,
        reschedule_booking_code: code,
      });
      if (slots.isError) {
        await r.say(r.t(" I don't see another opening this week. Would you like a call from our office instead?", " No veo otro horario esta semana. ¿Prefiere que le llame nuestra oficina?"));
        return;
      }
      await r.say(r.t(" Here are the nearest openings. Tap one and I'll move it.", " Estos son los horarios más cercanos. Toque uno y la cambio."));
      await r.say(r.t(" Rescheduling is free up to 2 hours before your window.", " Cambiarla es gratis hasta 2 horas antes de su horario."));
      r.cite("booking-policy", "You can reschedule free of charge up to 2 hours before your arrival window starts.");
      await r.call("update_lead", {
        summary_en: `Wants to reschedule ${code} (${out.service}); Penny offered new windows.`,
        intent: "reschedule",
        urgency: "routine",
        customer_language: r.lang,
        customer_name: out.customer ?? null,
      });
    },
  };
}

function cancelAskScript(code: string): Script {
  return {
    id: "cancel_ask",
    run: async (r) => {
      await r.think();
      const found = await r.call("lookup_booking", { booking_code: code });
      if (found.isError) {
        await r.say(`I couldn't find a booking with the code ${code}. Could you check it? It starts with CPL.`);
        return;
      }
      const out = found.output as { service?: string; when?: string; status?: string };
      if (out.status === "cancelled") {
        await r.say("That booking is already cancelled.");
        return;
      }
      await r.say(`I found ${code}: your ${out.service?.toLowerCase()}, ${inlineLabel(out.when ?? "")}. Do you want me to cancel it? Just reply “yes, cancel it” to confirm.`);
      await r.say(" If the timing is the problem, I can move it instead at no charge.");
      r.cite("booking-policy", "You can reschedule free of charge up to 2 hours before your arrival window starts.");
      await r.call("update_lead", {
        summary_en: `Asked to cancel ${code} (${out.service}); Penny is waiting for the customer to confirm.`,
        intent: "cancel",
        urgency: "routine",
        customer_language: r.lang,
        customer_name: null,
      });
    },
  };
}

function cancelConfirmScript(code: string): Script {
  return {
    id: "cancel_confirm",
    run: async (r) => {
      await r.think();
      const result = await r.call("cancel_booking", { booking_code: code, customer_confirmed: true });
      if (result.isError) {
        await r.say(String(result.output.error));
        return;
      }
      await r.say(`Done. ${code} is cancelled. ${String(result.output.refund)}`);
      r.cite("booking-policy", "Cancel at least 24 hours before your window and the diagnostic fee is refunded in full.");
      await r.say(" I've sent a text to confirm. If you'd like to rebook later, I'm here.");
      await r.call("update_lead", {
        summary_en: `Cancelled ${code} at the customer's request after they confirmed. ${String(result.output.refund)}`,
        intent: "cancel",
        urgency: "routine",
        customer_language: r.lang,
        customer_name: null,
      });
    },
  };
}

function lookupScript(code: string): Script {
  return {
    id: "lookup",
    run: async (r) => {
      await r.think();
      const found = await r.call("lookup_booking", { booking_code: code });
      if (found.isError) {
        await r.say(`I couldn't find a booking with the code ${code}. Could you check it? It starts with CPL.`);
        return;
      }
      await r.say("Here's that booking. Would you like to move it or cancel it?");
    },
  };
}

function priceScript(code: string): Script {
  return {
    id: "price",
    run: async (r) => {
      await r.think();
      const result = await r.call("get_estimate", { service_code: code, after_hours: false, care_club_member: false });
      const out = result.output as { service?: string; price_low_usd?: number; price_high_usd?: number };
      await r.say(
        r.t(
          `${out.service} typically runs ${money(out.price_low_usd)} to ${money(out.price_high_usd)}, parts and labor included.`,
          `${out.service} suele costar entre ${money(out.price_low_usd)} y ${money(out.price_high_usd)}, con piezas y mano de obra.`,
        ),
      );
      r.cite("pricing", pricingQuote(code));
      await r.say(
        r.t(
          ` Every visit starts with a diagnostic (${money(DIAGNOSTIC_FEE)}, credited toward the repair), and the technician gives you a fixed price before any work starts.`,
          ` Cada visita empieza con un diagnóstico de ${money(DIAGNOSTIC_FEE)}, que se descuenta de la reparación, y el técnico le da un precio fijo antes de empezar.`,
        ),
      );
      r.cite("pricing", CREDIT_QUOTE);
      await r.say(r.t(" Want me to find a time?", " ¿Le busco un horario?"));
      await r.call("update_lead", {
        summary_en: `Asked for a price on ${out.service?.toLowerCase()}; quoted ${money(out.price_low_usd)}–${money(out.price_high_usd)} from the price book.`,
        intent: "pricing",
        urgency: "routine",
        customer_language: r.lang,
        customer_name: null,
      });
    },
  };
}

const genericPriceScript: Script = {
  id: "price_generic",
  run: async (r) => {
    await r.think();
    await r.say(`Every visit starts with a diagnostic. It costs ${money(DIAGNOSTIC_FEE)}, and that comes off the repair if you go ahead.`);
    r.cite("pricing", CREDIT_QUOTE);
    await r.say(" Prices depend on the job, and I can give you the range from our price book. What needs fixing?");
  },
};

/** A described problem (no photo): estimate, then the earliest slots. */
function problemScript(code: string, text: string, preferTomorrow: boolean): Script {
  return {
    id: `problem:${code}`,
    run: async (r) => {
      await r.think(600);
      const service = serviceByCode(code);
      const urgency: Urgency = /urgent|asap|today|right now|emergency|ahora|urgente|hoy/.test(stripAccents(text.toLowerCase())) ? "urgent" : "soon";
      await r.call("update_lead", {
        summary_en:
          r.lang === "es"
            ? `Customer (writing in Spanish) needs ${service?.name.toLowerCase()}${preferTomorrow ? " and asked for a visit tomorrow" : ""}.`
            : `Customer needs ${service?.name.toLowerCase()}: “${text.slice(0, 120)}”`,
        intent: "booking",
        urgency,
        customer_language: r.lang,
        customer_name: null,
      });
      const estimate = await r.call("get_estimate", { service_code: code, after_hours: false, care_club_member: false });
      const out = estimate.output as { service?: string; price_low_usd?: number; price_high_usd?: number };
      await r.say(
        r.t(
          `We can help with that. ${out.service} typically runs ${money(out.price_low_usd)} to ${money(out.price_high_usd)},`,
          `Con gusto le ayudamos. ${serviceNameEs(code) ?? out.service} suele costar entre ${money(out.price_low_usd)} y ${money(out.price_high_usd)},`,
        ),
      );
      r.cite("pricing", pricingQuote(code));
      await r.say(
        r.t(
          ` and the ${money(DIAGNOSTIC_FEE)} diagnostic fee is credited toward the repair.`,
          ` y el diagnóstico de ${money(DIAGNOSTIC_FEE)} se descuenta de la reparación.`,
        ),
      );
      r.cite("pricing", CREDIT_QUOTE);
      const tomorrow = addDays(r.input.clock.today, 1);
      const slots = await r.call("find_available_slots", {
        service_code: code,
        urgency,
        preferred_date: preferTomorrow ? tomorrow : null,
        reschedule_booking_code: null,
      });
      if (slots.isError) {
        await r.say(r.t(" I don't see an open window this week. Would you like a call back from our office?", " No veo horarios disponibles esta semana. ¿Quiere que le llame nuestra oficina?"));
        return;
      }
      const gotTomorrow = !String(slots.output.note ?? "").startsWith("Nothing is open");
      if (preferTomorrow && gotTomorrow) {
        await r.say(r.t("\n\nHere's what I have for tomorrow. Tap a time and I'll hold it.", "\n\nEstos son los horarios que tengo para mañana. Toque uno y se lo reservo."));
      } else if (preferTomorrow) {
        await r.say(r.t("\n\nTomorrow is fully booked, but these are the nearest openings. Tap a time and I'll hold it.", "\n\nMañana está completo, pero estos son los horarios más cercanos. Toque uno y se lo reservo."));
      } else {
        await r.say(r.t("\n\nHere are the earliest openings. Tap a time and I'll hold it.", "\n\nEstos son los primeros horarios disponibles. Toque uno y se lo reservo."));
      }
      await afterHoursNote(r, urgency, slots);
    },
  };
}

const contactScript: Script = {
  id: "contact",
  run: async (r) => {
    await r.think();
    await r.say(
      r.t(
        `You can reach the Copperline office on ${COMPANY.phone}. Technicians are out 8 AM to 6 PM, seven days a week,`,
        `Puede llamar a la oficina de Copperline al ${COMPANY.phone}. Los técnicos trabajan de 8 AM a 6 PM, los siete días,`,
      ),
    );
    r.cite("service-area", "Technicians are on the road 8:00 AM to 6:00 PM, seven days a week.");
    await r.say(r.t(" and I can book a visit for you right here if that's easier.", " y si prefiere, le agendo una visita aquí mismo."));
  },
};

const whatsWrongScript: Script = {
  id: "whats_wrong",
  run: async (r) => {
    await r.think();
    await r.say(
      r.t(
        "Happy to get someone out to you. What's going on? A sentence is enough (for example “my water heater is leaking” or “the AC isn't cooling”), or tap the camera and send a photo, and I'll give you a price range and the earliest times.",
        "Con gusto le enviamos a alguien. ¿Qué sucede? Basta una frase (por ejemplo “mi calentador gotea” o “el aire no enfría”), o toque la cámara y envíe una foto, y le doy un rango de precio y los primeros horarios.",
      ),
    );
  },
};

const uploadScript: Script = {
  id: "off_script",
  run: async (r) => {
    await r.think(300);
    await r.say(
      r.t(
        "I can only look at your own photos when my live AI is switched on, and it's off in this preview. Tap the camera and try one of the sample photos instead.",
        "Solo puedo revisar sus propias fotos cuando mi IA en vivo está activada, y en esta vista previa está desactivada. Toque la cámara y pruebe una de las fotos de ejemplo.",
      ),
    );
  },
};

const noNumberScript: Script = {
  id: "no_number",
  run: async (r) => {
    await r.think(300);
    await r.say(
      r.t(
        "I didn't catch a phone number there. What number should we call you on? Digits only is fine.",
        "No vi un número de teléfono. ¿A qué número le llamamos? Solo los dígitos está bien.",
      ),
    );
  },
};

/** The service Penny most recently quoted, so "yes" can mean "yes, find a time". */
function lastQuotedService(messages: WireMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const hit = m.tools.find((tool) => tool.name === "get_estimate" && !tool.isError);
    const code = (hit?.input as { service_code?: unknown } | undefined)?.service_code;
    if (typeof code === "string" && serviceByCode(code)) return code;
  }
  return null;
}

function serviceNameEs(code: string): string | null {
  const names: Record<string, string> = {
    "AC-REPAIR": "La reparación de aire acondicionado",
    "AC-TUNEUP": "El mantenimiento de aire acondicionado",
    "FURNACE-REPAIR": "La reparación de calefacción",
    "WH-REPAIR": "La reparación de calentador de agua",
    "DRAIN-CLEAR": "El destape de desagües",
    "LEAK-REPAIR": "La reparación de fugas",
    "TOILET-REPAIR": "La reparación de inodoro",
  };
  return names[code] ?? null;
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

export function routeReplay(input: TurnInput): { script: Script; lang: Lang } {
  const messages = input.messages;
  const last = messages[messages.length - 1];
  const leadLang = input.state.lead.language;

  if (last.role === "event") return { script: eventScript(last.event, messages), lang: leadLang };
  if (last.role !== "user") return { script: offScript, lang: leadLang };

  const raw = last.text.trim();
  const lang = raw ? detectLang(raw) : leadLang;
  const text = stripAccents(raw.toLowerCase());
  const pick = (script: Script) => ({ script, lang });

  // Safety always wins, whatever else the message contains.
  for (const pattern of EMERGENCY_PATTERNS) {
    if (pattern.re.test(text)) return pick(emergencyScript(pattern.kind, pattern.summary));
  }

  if (last.image) {
    if (last.image.kind === "sample" && sampleById(last.image.sampleId) && PHOTO_SCRIPTS[last.image.sampleId]) {
      return pick(photoScript(last.image.sampleId));
    }
    return pick(uploadScript); // An uploaded photo needs the live model.
  }

  if (/ignore (all |your |any |the |previous |prior )*(instructions|rules|prompt)|system prompt|reveal (your )?(prompt|instructions)|jailbreak|developer mode|(give|get) (me|us) (a |an )?\d{2,3} ?%|(i want|i need|apply|take|knock) (a |an |me )?\d{2,3} ?%|\d{2,3} ?% (off|discount) (or|now|please|right now)|for free\b|pretend (you|to be)|you are now/.test(text)) {
    return pick(injectionScript);
  }

  if (/\b(are|r) (you|u) (a |an )?(real|human|person|robot|bot|ai|machine)|am i (talking|chatting|speaking) (to|with) (a |an )?|is this (a |an )?(bot|person|human|real|ai)|eres (un |una )?(humano|robot|persona|bot|ia)|hablo con una persona/.test(text)) {
    return pick(humanScript);
  }

  if (/(talk|speak|chat) (to|with) (a |an )?(human|person|someone|agent|representative|manager|owner|real)|call me|hablar con (una persona|alguien|un humano)/.test(text)) {
    return pick(wantsHumanScript);
  }

  // A phone number, right after Penny asked for one.
  const digits = raw.replace(/\D/g, "");
  const previousAssistant = lastOf(messages, "assistant", messages.length - 1);
  if (digits.length >= 7 && digits.length <= 15 && previousAssistant && /number|numero|número|phone|teléfono|telefono/i.test(previousAssistant.text)) {
    const phone = raw.match(/[+()\d][\d\s().-]{6,}/)?.[0].trim() ?? raw;
    return pick(eventScript({ kind: "callback_requested", phone }, messages));
  }
  if (previousAssistant && /(best number|what number|a qué número)/i.test(previousAssistant.text) && digits.length < 7) {
    return pick(noNumberScript);
  }

  const codeMatch = raw.match(/CPL[-\s]?(\d{4,6})/i);
  const code = codeMatch ? `CPL-${codeMatch[1]}` : null;
  const wantsReschedule = /resched|move (my|the|it)|change (my|the) (appointment|booking|visit|time)|different (time|day)|cambiar (mi|la) (cita|reserva|visita)|reprogramar/.test(text);
  const wantsCancel = /\bcancel|cancelar/.test(text);
  const asksPolicy = /policy|fee|charge|how (late|long)|refund|politica/.test(text);

  if (/^(yes|yep|yeah|si|confirm|please do|go ahead)\b.*|yes,? cancel/.test(text) && previousAssistant && /cancel it\?/.test(previousAssistant.text)) {
    const pending = codeUnderDiscussion(messages.slice(0, -1));
    if (pending) return pick(cancelConfirmScript(pending));
  }
  if ((wantsReschedule || wantsCancel) && asksPolicy && !code) return pick(policyScript);
  if (wantsReschedule) return pick(code ? rescheduleScript(code) : askCodeScript);
  if (wantsCancel) return pick(code ? cancelAskScript(code) : askCodeScript);
  if (code) return pick(lookupScript(code));

  const zip = extractZip(raw);
  if (zip && /serv|cover|area|zip|come (out )?to|atienden|llegan|zona|codigo postal|do you (go|work)/.test(text)) {
    return pick(zipScript(zip));
  }
  if (zip && raw.replace(/\D/g, "").length === 5 && raw.length <= 12) return pick(zipScript(zip));

  if (/warrant|guarantee|garantia/.test(text)) return pick(warrantyScript);
  if (/financ|payment plan|monthly payment|pay over time|installment/.test(text)) return pick(financingScript);
  if (/care club|membership|member\b|membresia/.test(text)) return pick(careClubScript);
  if (/licen[sc]ed|insured|background/.test(text)) return pick(licensedScript);
  if (/\bhours\b|open (on|today|tomorrow|now)|weekend|sunday|saturday|what time (do|are)|horario/.test(text)) return pick(hoursScript);
  if (asksPolicy && /resched|cancel|late|no.?show/.test(text)) return pick(policyScript);

  const service = serviceFromText(raw);
  const asksPrice = /how much|cost|price|pricing|estimate|quote|charge|cuanto|precio|cuesta/.test(text);
  if (service && asksPrice && !/book|schedule|appointment|come out|send someone|manana|tomorrow|today/.test(text)) {
    return pick(priceScript(service.code));
  }
  if (service) {
    const preferTomorrow = /manana|tomorrow/.test(text);
    return pick(problemScript(service.code, raw, preferTomorrow));
  }
  if (asksPrice) return pick(genericPriceScript);

  // "Yes" right after a quote means "yes, find me a time".
  if (/^(yes|yep|yeah|sure|ok|okay|please|si|sí|claro|go ahead|do it|sounds good)\b/.test(text) && raw.length < 40 && previousAssistant && /(find a time|busco un horario)/i.test(previousAssistant.text)) {
    const quoted = lastQuotedService(messages);
    if (quoted) return pick(problemScript(quoted, serviceByCode(quoted)?.name ?? raw, false));
  }
  if (/phone number|your number|call (you|the office)|contact|email address|where are you|your address|numero de telefono|como los contacto/.test(text)) return pick(contactScript);
  if (/plumber|technician|someone (to |out|come)|appointment|\bbook\b|schedule|a visit|need help|fix (it|this|my)|repair|plomero|tecnico|una cita|necesito ayuda/.test(text)) return pick(whatsWrongScript);

  if (/^(hi|hello|hey|hola|buenas|good (morning|afternoon|evening))\b/.test(text) && raw.length < 40) return pick(greetingScript);
  if (/^(thanks|thank you|thx|gracias|great|perfect|ok|okay|cool)\b/.test(text) && raw.length < 40) return pick(thanksScript);

  return pick(offScript);
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export interface ReplayOptions {
  /** 1 = natural pace, 0 = instant (tests, evals). */
  pace?: number;
}

export function createReplayEngine(options: ReplayOptions = {}): Engine {
  return {
    mode: "replay",
    async run(input: TurnInput, emit: Emit, engineOptions?: EngineOptions) {
      const pace = options.pace ?? envPace();
      const replay = new Replay(input, emit, pace, engineOptions?.signal);
      const { script, lang } = routeReplay(input);
      replay.lang = lang;
      replay.scriptId = script.id;
      if (script.id === "off_script") {
        emit({ type: "notice", code: "off_script", message: "Replay mode: this message is outside the scripted scenarios." });
      }
      await script.run(replay);
      return { stopReason: "end_turn" };
    },
  };
}
