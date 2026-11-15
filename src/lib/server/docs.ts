import "server-only";
import {
  AFTER_HOURS_SURCHARGE,
  DIAGNOSTIC_FEE,
  MEMBERSHIP_MONTHLY,
  MEMBER_DISCOUNT_PCT,
  SERVICES,
} from "./pricebook";
import { SERVICE_AREA } from "./service-area";

/**
 * Copperline's customer-facing documents. They are passed to Claude as
 * document blocks with citations enabled, so every policy or price Penny
 * states can be traced to a passage here. Plain text on purpose: citation
 * character offsets then index straight into what the drawer displays.
 */

export interface CompanyDoc {
  id: string;
  title: string;
  text: string;
}

function money(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

/** The exact sentence the pricing guide uses for a service; also used to cite it. */
export function pricingQuote(code: string): string {
  const s = SERVICES.find((x) => x.code === code);
  if (!s) throw new Error(`Unknown service code ${code}`);
  return `${s.name} (${s.code}): ${money(s.low)} to ${money(s.high)}.`;
}

function pricingGuide(): string {
  const line = (code: string) => {
    const s = SERVICES.find((x) => x.code === code);
    if (!s) throw new Error(`Unknown service code ${code}`);
    return `- ${pricingQuote(code)} ${s.blurb}`;
  };
  const plumbing = SERVICES.filter((s) => s.trade === "plumbing").map((s) => line(s.code));
  const hvac = SERVICES.filter((s) => s.trade === "hvac").map((s) => line(s.code));
  return [
    "# Services & Pricing Guide",
    "",
    "Copperline gives upfront price ranges before anyone comes out, and a fixed price on site before any work starts. You approve the price first. No surprises.",
    "",
    "## How pricing works",
    `Every visit starts with a diagnostic. The diagnostic fee is ${money(DIAGNOSTIC_FEE)}, paid when you book. If you go ahead with the repair, the full ${money(DIAGNOSTIC_FEE)} is credited toward your invoice.`,
    `Standard hours are 8:00 AM to 6:00 PM, seven days a week. Visits that start outside those hours add a flat ${money(AFTER_HOURS_SURCHARGE)} after-hours surcharge.`,
    `Care Club members pay no diagnostic fee and get ${MEMBER_DISCOUNT_PCT}% off every repair.`,
    "The ranges below cover typical jobs, parts and labor included. Unusual access, code upgrades or specialty parts can move a job outside the range; your technician will explain why before you decide.",
    "",
    "## Plumbing",
    ...plumbing,
    "",
    "## Heating & cooling",
    ...hvac,
    "",
    "## What we do not do",
    "We do not service commercial refrigeration, pools, septic tanks, wells or gas utility meters. For gas meter problems, contact your gas utility.",
  ].join("\n");
}

function serviceArea(): string {
  const towns = SERVICE_AREA.map((t) => `- ${t.zip}: ${t.town}`);
  return [
    "# Service Area",
    "",
    "Copperline serves the Riverbend metro area. We schedule visits in the following ZIP codes:",
    "",
    ...towns,
    "",
    "## Outside the area",
    "If your ZIP code is not listed, we cannot schedule a visit there. We keep a waitlist for nearby towns and will let you know if we expand.",
    "",
    "## Travel",
    "There is no travel or trip charge anywhere inside the service area.",
    "",
    "## Hours",
    "Technicians are on the road 8:00 AM to 6:00 PM, seven days a week. Emergency dispatch for active leaks, no heat in freezing weather and similar urgent problems is available around the clock; visits outside standard hours carry the after-hours surcharge.",
  ].join("\n");
}

const WARRANTY = [
  "# Warranty & Satisfaction Guarantee",
  "",
  "## Repairs",
  "All repairs carry a 2-year warranty on parts and labor. If a repair we made fails within that period, we come back and fix it at no charge.",
  "",
  "## New equipment",
  "Water heaters, furnaces, air conditioners and heat pumps we install carry the manufacturer's warranty on the equipment, which is typically 6 to 12 years on tanks and heat exchangers, plus a 2-year Copperline labor warranty on the installation.",
  "",
  "## Drain clearing",
  "Drain and sewer clearing is guaranteed for 30 days. If the same drain clogs again within 30 days, we clear it again free. Lines with root intrusion or a collapsed pipe are excluded until the pipe itself is repaired.",
  "",
  "## What the warranty does not cover",
  "The warranty does not cover damage from freezing, flooding, misuse, or work done by anyone other than Copperline after our visit. Customer-supplied parts are covered for labor only.",
  "",
  "## Satisfaction guarantee",
  "If you are not happy with the work, tell us within 30 days. We will send a senior technician to make it right, and if we still cannot, we refund what you paid for that repair.",
  "",
  "## Making a claim",
  "Reply to your confirmation text, use the chat on our website, or call the office. Have your booking code ready; it starts with CPL.",
].join("\n");

const BOOKING_POLICY = [
  "# Booking, Cancellation & Reschedule Policy",
  "",
  "## Arrival windows",
  "We book two-hour arrival windows: 8 to 10 AM, 10 AM to 12 PM, 12 to 2 PM, 2 to 4 PM and 4 to 6 PM. Your technician texts when they are on the way.",
  "",
  "## Diagnostic fee",
  "The diagnostic fee is collected when you book and holds your window. It is credited toward the repair if you go ahead.",
  "",
  "## Rescheduling",
  "You can reschedule free of charge up to 2 hours before your arrival window starts. Use the chat, reply to your confirmation text, or call the office with your booking code.",
  "",
  "## Cancelling",
  "Cancel at least 24 hours before your window and the diagnostic fee is refunded in full. Cancel later than that and the fee is kept as a credit on your account, good for 12 months.",
  "",
  "## If we are late",
  "If your technician arrives after the end of your window, the diagnostic fee is waived.",
  "",
  "## Someone must be home",
  "An adult of 18 or over needs to be present for the visit. If nobody is home, we wait 15 minutes, then the visit is treated as a late cancellation.",
].join("\n");

const EMERGENCY_GUIDE = [
  "# Emergency Safety Guide",
  "",
  "Your safety comes before any repair. For the situations below, follow these steps first and call us only once you are safe.",
  "",
  "## Gas smell",
  "If you smell gas, leave the building immediately and take everyone with you. Do not use light switches, phones, lighters or anything that could spark while you are inside. Once you are outside and away from the building, call 911 or your gas utility's emergency line. Do not try to find or fix the leak yourself.",
  "",
  "## Carbon monoxide alarm",
  "If a carbon monoxide alarm sounds, get everyone outside into fresh air right away and call 911. Do not go back inside until emergency responders say it is safe. Symptoms of exposure include headache, dizziness and nausea.",
  "",
  "## Sparking, burning smell or scorched outlets",
  "If you see sparks or smell burning from a furnace, water heater, outlet or panel, leave the area. If you can reach the main breaker safely without touching anything wet or hot, switch it off. Call 911 if there is smoke or fire. Do not touch the equipment.",
  "",
  "## Active flooding or a burst pipe",
  "Shut off the water at the main shut-off valve, usually where the water line enters the home or beside the water meter. Keep away from standing water near outlets or appliances. Move valuables if it is safe and call us for emergency dispatch.",
  "",
  "## Leaking water heater",
  "Turn the cold-water supply valve on top of the heater clockwise to close it. For a gas heater turn the gas control knob to OFF; for an electric heater switch off its breaker. Do not touch the tank or the relief valve if they are hot.",
  "",
  "## No heat in freezing weather",
  "Open cabinet doors under sinks and let faucets drip to protect pipes. Never heat your home with an oven or an outdoor grill.",
].join("\n");

const FAQ = [
  "# Frequently Asked Questions",
  "",
  "## Is Penny a real person?",
  "No. Penny is Copperline's AI receptionist. She can answer questions, give price ranges, look at photos and book visits. You can ask for a person at any time and a member of the Copperline team will take over the chat or call you back.",
  "",
  "## Are your technicians licensed and insured?",
  "Yes. Every Copperline technician is licensed for the trade they work in, background-checked and covered by our liability insurance.",
  "",
  "## Do you charge by the hour?",
  "No. We quote a fixed price for the job before work starts, so the price does not change if the job takes longer than expected.",
  "",
  "## What payment methods do you accept?",
  "All major credit and debit cards, and financing on jobs over $500. We do not accept cash at the door.",
  "",
  "## Can I send a photo?",
  "Yes. A photo of the problem helps us send the right technician with the right parts. Photos are used only to assess your job.",
  "",
  "## Do I need to be home?",
  "Yes. An adult needs to be present to approve the price and let the technician in.",
  "",
  "## How soon can someone come?",
  "Same-day visits are often available when you book before early afternoon. The chat shows the earliest open windows.",
  "",
  "## Do you work on all brands?",
  "We repair all major residential brands of water heaters, furnaces, air conditioners and heat pumps.",
].join("\n");

const FINANCING = [
  "# Financing",
  "",
  "Larger jobs do not have to be paid all at once.",
  "",
  "## Who it is for",
  "Financing is available on any single job over $500, such as a water heater replacement or a new furnace.",
  "",
  "## Plans",
  "- 0% interest if paid in full within 12 months, on jobs from $500 to $2,999.",
  "- Fixed monthly payments over 36 or 60 months on jobs of $3,000 or more.",
  "",
  "## How to apply",
  "Your technician can start a short application on site once you have a fixed price. Most decisions come back in a few minutes. Applying does not commit you to the work.",
  "",
  "## Good to know",
  "Financing is provided by a third-party lender and is subject to credit approval. Copperline does not set the lender's rates, and Penny cannot quote a monthly payment or approve an application.",
].join("\n");

function careClub(): string {
  return [
    "# Copperline Care Club",
    "",
    `The Care Club is our maintenance membership. It costs ${money(MEMBERSHIP_MONTHLY)} per month, billed monthly, and you can cancel at any time.`,
    "",
    "## What members get",
    "- Members never pay the diagnostic fee.",
    `- ${MEMBER_DISCOUNT_PCT}% off every repair.`,
    "- One furnace tune-up and one air conditioner tune-up each year, included.",
    "- One whole-home plumbing inspection each year, included.",
    "- Priority scheduling: members are offered the earliest open window.",
    "- No after-hours surcharge on emergency visits.",
    "",
    "## Joining",
    "You can join when you book or at any visit. Benefits start right away, including on the visit where you join.",
    "",
    "## The fine print",
    "The membership covers one home. Tune-ups not used within the membership year do not roll over.",
  ].join("\n");
}

export const DOCS: CompanyDoc[] = [
  { id: "pricing", title: "Services & Pricing Guide", text: pricingGuide() },
  { id: "service-area", title: "Service Area", text: serviceArea() },
  { id: "warranty", title: "Warranty & Satisfaction Guarantee", text: WARRANTY },
  { id: "booking-policy", title: "Booking, Cancellation & Reschedule Policy", text: BOOKING_POLICY },
  { id: "emergency", title: "Emergency Safety Guide", text: EMERGENCY_GUIDE },
  { id: "faq", title: "Frequently Asked Questions", text: FAQ },
  { id: "financing", title: "Financing", text: FINANCING },
  { id: "care-club", title: "Copperline Care Club", text: careClub() },
];

export function docById(id: string): CompanyDoc | undefined {
  return DOCS.find((d) => d.id === id);
}

/** Locates an exact quote inside a document, for replay-mode citations. */
export function locateQuote(docId: string, quote: string): { start: number; end: number } | null {
  const doc = docById(docId);
  if (!doc) return null;
  const start = doc.text.indexOf(quote);
  if (start < 0) return null;
  return { start, end: start + quote.length };
}
