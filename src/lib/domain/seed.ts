import { addDays } from "./time";
import { DEMO_CUSTOMER } from "./technicians";
import { SLOT_DURATION } from "./slots";
import type { Alert, Clock, Job, JobSource, Lead, OutboundMessage, Urgency } from "./types";

/**
 * Seed data for a visitor's sandbox: a believable business mid-day, laid out
 * relative to *their* today. Nothing here is a source of truth for quoting:
 * the estimate ranges are historical records, and a unit test checks that they
 * still match the server-side price book.
 */

export const LIVE_LEAD_ID = "lead-live";
export const SEEDED_BOOKING_CODE = "CPL-4821";

/** Dashboard numbers that are not derivable from the seeded records. */
export const BASELINE = {
  /** Conversations Penny handled today before this visitor arrived. */
  conversations: 23,
  /** Recent first-response times in ms, for the median KPI. */
  responseMs: [1400, 1900, 1700, 2300, 1600, 1800, 2100, 1500, 1750],
};

interface SeedJob {
  code: string;
  dayOffset: number;
  startMin: number;
  techId: string;
  serviceCode: string;
  serviceName: string;
  estLow: number;
  estHigh: number;
  customerName: string;
  address: string;
  urgency: Urgency;
  source: JobSource;
  summary: string;
  /** Set when Penny booked it today: minutes after midnight. */
  bookedTodayAtMin?: number;
  leadId?: string;
}

const SEED_JOBS: SeedJob[] = [
  // Today
  { code: "CPL-4790", dayOffset: 0, startMin: 480, techId: "marcus", serviceCode: "TOILET-REPAIR", serviceName: "Toilet repair", estLow: 129, estHigh: 285, customerName: "Hollis Grant", address: "9 Ferry Ln, Riverbend", urgency: "routine", source: "phone", summary: "Upstairs toilet runs constantly; likely flapper or fill valve." },
  { code: "CPL-4806", dayOffset: 0, startMin: 600, techId: "marcus", serviceCode: "DRAIN-CLEAR", serviceName: "Drain clearing", estLow: 149, estHigh: 325, customerName: "Renee Castillo", address: "311 Mill Rd, Millbrook", urgency: "soon", source: "penny", summary: "Kitchen sink backing up into the dishwasher; cable clearing booked.", bookedTodayAtMin: 399, leadId: "lead-renee" },
  { code: "CPL-4795", dayOffset: 0, startMin: 720, techId: "marcus", serviceCode: "FAUCET", serviceName: "Faucet and fixture repair", estLow: 145, estHigh: 390, customerName: "Owen Pratt", address: "27 Larch Ct, Alder Heights", urgency: "routine", source: "web", summary: "Dripping kitchen faucet, customer supplying a new fixture." },
  { code: "CPL-4801", dayOffset: 0, startMin: 480, techId: "priya", serviceCode: "AC-TUNEUP", serviceName: "Air conditioner tune-up", estLow: 119, estHigh: 169, customerName: "Mei Tanaka", address: "5 Quarry View, Quarry Park", urgency: "routine", source: "web", summary: "Annual Care Club tune-up on a 4-year-old system." },
  { code: "CPL-4798", dayOffset: 0, startMin: 720, techId: "priya", serviceCode: "THERMOSTAT", serviceName: "Thermostat diagnosis and replacement", estLow: 140, estHigh: 380, customerName: "Carl Jensen", address: "88 Stonebridge Ave, Stonebridge", urgency: "routine", source: "phone", summary: "Thermostat screen blank after a power cut." },
  { code: "CPL-4817", dayOffset: 0, startMin: 840, techId: "priya", serviceCode: "FURNACE-REPAIR", serviceName: "Furnace repair", estLow: 175, estHigh: 620, customerName: "Aisha Bello", address: "140 Cedar Flats Rd, Cedar Flats", urgency: "urgent", source: "penny", summary: "Furnace short-cycling every few minutes; no steady heat since last night.", bookedTodayAtMin: 432, leadId: "lead-aisha" },
  { code: "CPL-4793", dayOffset: 0, startMin: 600, techId: "dee", serviceCode: "LEAK-REPAIR", serviceName: "Pipe leak and joint repair", estLow: 195, estHigh: 520, customerName: "Nadia Petrov", address: "62 Willow Landing Dr, Willow Landing", urgency: "soon", source: "phone", summary: "Slow drip at a copper joint under the bathroom vanity." },
  { code: "CPL-4815", dayOffset: 0, startMin: 720, techId: "dee", serviceCode: "DISPOSAL", serviceName: "Garbage disposal replacement", estLow: 275, estHigh: 495, customerName: "Bram Kowalski", address: "17 Copper Hill Way, Copper Hill", urgency: "routine", source: "phone", summary: "Disposal hums but will not turn; customer wants it replaced." },
  { code: "CPL-4799", dayOffset: 0, startMin: 840, techId: "dee", serviceCode: "WH-REPAIR", serviceName: "Water heater repair", estLow: 180, estHigh: 450, customerName: "Greta Lindqvist", address: "203 Fairhaven St, Fairhaven", urgency: "soon", source: "web", summary: "Lukewarm water only; suspected failed heating element." },
  // Tomorrow
  { code: "CPL-4803", dayOffset: 1, startMin: 480, techId: "marcus", serviceCode: "SEWER-MAIN", serviceName: "Main sewer line clearing", estLow: 350, estHigh: 750, customerName: "Paul Okonkwo", address: "410 Eastside Blvd, Riverbend", urgency: "soon", source: "phone", summary: "Basement floor drain backing up; camera inspection requested." },
  { code: "CPL-4819", dayOffset: 1, startMin: 600, techId: "marcus", serviceCode: "TOILET-REPAIR", serviceName: "Toilet repair", estLow: 129, estHigh: 285, customerName: "Tessa Ruiz", address: "12 Larkspur Ln, Larkspur", urgency: "routine", source: "penny", summary: "Toilet rocks at the base and leaks slightly when flushed.", bookedTodayAtMin: 455 },
  { code: "CPL-4820", dayOffset: 1, startMin: 480, techId: "priya", serviceCode: "AC-REPAIR", serviceName: "Air conditioner repair", estLow: 185, estHigh: 650, customerName: "Lucía Fernández", address: "75 Westbank Rd, Riverbend", urgency: "soon", source: "penny", summary: "AC blowing warm air; customer wrote in Spanish, prefers a morning visit.", bookedTodayAtMin: 471, leadId: "lead-lucia" },
  { code: "CPL-4808", dayOffset: 1, startMin: 840, techId: "priya", serviceCode: "FURNACE-TUNEUP", serviceName: "Furnace tune-up", estLow: 109, estHigh: 159, customerName: "Ivan Sorensen", address: "33 Alder Heights Dr, Alder Heights", urgency: "routine", source: "web", summary: "Pre-winter tune-up." },
  { code: "CPL-4811", dayOffset: 1, startMin: 720, techId: "dee", serviceCode: "SUMP", serviceName: "Sump pump replacement", estLow: 480, estHigh: 950, customerName: "Joan Whitlock", address: "8 Mill Pond Ct, Millbrook", urgency: "soon", source: "phone", summary: "Sump pump is 12 years old and failed its test; replace before the rains." },
  // Day after tomorrow: the booking the visitor can reschedule
  { code: SEEDED_BOOKING_CODE, dayOffset: 2, startMin: 600, techId: "priya", serviceCode: "FURNACE-TUNEUP", serviceName: "Furnace tune-up", estLow: 109, estHigh: 159, customerName: DEMO_CUSTOMER.name, address: DEMO_CUSTOMER.address, urgency: "routine", source: "web", summary: "Annual furnace tune-up before winter." },
  { code: "CPL-4812", dayOffset: 2, startMin: 840, techId: "marcus", serviceCode: "WH-REPLACE", serviceName: "Tank water heater replacement", estLow: 1450, estHigh: 2400, customerName: "Dana Achebe", address: "56 Stonebridge Ave, Stonebridge", urgency: "soon", source: "phone", summary: "14-year-old tank rusting at the base; replacing with a 50-gallon unit." },
  { code: "CPL-4809", dayOffset: 2, startMin: 480, techId: "dee", serviceCode: "HEATPUMP-REPAIR", serviceName: "Heat pump repair", estLow: 210, estHigh: 720, customerName: "Rafael Moreno", address: "19 Quarry Park Rd, Quarry Park", urgency: "soon", source: "web", summary: "Heat pump stuck in defrost; outdoor unit icing over." },
  // Later in the week
  { code: "CPL-4813", dayOffset: 3, startMin: 600, techId: "marcus", serviceCode: "LEAK-REPAIR", serviceName: "Pipe leak and joint repair", estLow: 195, estHigh: 520, customerName: "Sunita Rao", address: "4 Ferry Ln, Riverbend", urgency: "routine", source: "web", summary: "Corroded shut-off valve under the kitchen sink." },
  { code: "CPL-4814", dayOffset: 3, startMin: 840, techId: "dee", serviceCode: "AC-TUNEUP", serviceName: "Air conditioner tune-up", estLow: 119, estHigh: 169, customerName: "Glen Abara", address: "91 Fairhaven St, Fairhaven", urgency: "routine", source: "phone", summary: "End-of-season tune-up." },
  { code: "CPL-4816", dayOffset: 4, startMin: 720, techId: "priya", serviceCode: "FURNACE-REPAIR", serviceName: "Furnace repair", estLow: 175, estHigh: 620, customerName: "Mona Fitch", address: "230 Cedar Flats Rd, Cedar Flats", urgency: "routine", source: "web", summary: "Blower is loud on start-up; possible bearing wear." },
  { code: "CPL-4818", dayOffset: 5, startMin: 480, techId: "marcus", serviceCode: "FAUCET", serviceName: "Faucet and fixture repair", estLow: 145, estHigh: 390, customerName: "Leo Marchetti", address: "7 Willow Landing Dr, Willow Landing", urgency: "routine", source: "phone", summary: "Replace two bathroom faucets." },
];

/**
 * Seeded events happened "earlier today". For a visitor who arrives before
 * that time of day, the event is moved to shortly before now instead of being
 * left in the future.
 */
function earlierToday(minute: number, clock: Clock, order: number): number {
  if (minute <= clock.nowMinutes) return minute;
  return Math.max(0, clock.nowMinutes - 4 - order * 7);
}

function phoneFor(index: number): string {
  return `(555) 010-01${String(10 + index).padStart(2, "0")}`;
}

function emailFor(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, ".")
    .replace(/^\.|\.$/g, "");
  return `${slug}@example.com`;
}

export function seedJobs(clock: Clock): Job[] {
  return SEED_JOBS.map((seed, index) => {
    const isDemoCustomer = seed.customerName === DEMO_CUSTOMER.name;
    const bookedToday = seed.bookedTodayAtMin !== undefined;
    return {
      id: seed.code,
      code: seed.code,
      techId: seed.techId,
      date: addDays(clock.today, seed.dayOffset),
      startMin: seed.startMin,
      durationMin: SLOT_DURATION,
      serviceCode: seed.serviceCode,
      serviceName: seed.serviceName,
      customerName: seed.customerName,
      address: seed.address,
      phone: isDemoCustomer ? DEMO_CUSTOMER.phone : phoneFor(index),
      email: isDemoCustomer ? DEMO_CUSTOMER.email : emailFor(seed.customerName),
      urgency: seed.urgency,
      status: "confirmed",
      source: seed.source,
      summary: seed.summary,
      photo: null,
      estLow: seed.estLow,
      estHigh: seed.estHigh,
      feeDue: 89,
      feePaid: true,
      // Jobs Penny booked "today" count toward today's KPIs; the rest were
      // booked on earlier days.
      createdDay: bookedToday ? clock.today : addDays(clock.today, -2),
      createdAtMin: seed.bookedTodayAtMin !== undefined ? earlierToday(seed.bookedTodayAtMin, clock, index % 5) : 600,
      conversationId: seed.leadId ?? null,
    };
  });
}

export function freshLiveLead(clock: Clock): Lead {
  return {
    id: LIVE_LEAD_ID,
    customerName: "Website visitor",
    channel: "Website chat",
    startedDay: clock.today,
    startedAtMin: clock.nowMinutes,
    summary: "",
    intent: "other",
    urgency: "routine",
    status: "penny",
    language: "en",
    emergency: false,
    jobCode: null,
    callbackPhone: null,
    transcript: [],
    live: true,
  };
}

export function seedLeads(clock: Clock): Lead[] {
  const base = { startedDay: clock.today, callbackPhone: null, live: false as const };
  const leads: Lead[] = [
    {
      ...base,
      id: "lead-hank",
      customerName: "Hank Dorsey",
      channel: "SMS",
      startedAtMin: 548,
      summary: "Disputes a charge on last month's water heater invoice and wants to speak with the owner. Penny shared the warranty terms and escalated.",
      intent: "other",
      urgency: "soon",
      status: "needs_human",
      language: "en",
      emergency: false,
      jobCode: null,
      transcript: [
        { from: "customer", text: "I was charged $95 extra on my water heater install last month and nobody told me why. I want to talk to the owner." },
        { from: "penny", text: "I'm sorry about the confusion, Hank. I can't see invoice line items, so I've flagged this for Sam, the owner, to call you today. For reference, the only flat add-on in our price book is the $95 after-hours surcharge for visits outside 8 AM to 6 PM." },
        { from: "customer", text: "It was a 7pm visit. Still want the call." },
        { from: "penny", text: "Understood. Sam has your number and this conversation. You'll hear from him today." },
      ],
    },
    {
      ...base,
      id: "lead-lucia",
      customerName: "Lucía Fernández",
      channel: "Website chat",
      startedAtMin: 471,
      summary: "AC blowing warm air. Customer wrote in Spanish; Penny replied in Spanish and booked an AC repair visit for tomorrow 8–10 AM with Priya.",
      intent: "booking",
      urgency: "soon",
      status: "booked",
      language: "es",
      emergency: false,
      jobCode: "CPL-4820",
      transcript: [
        { from: "customer", text: "Hola, mi aire acondicionado solo echa aire caliente. ¿Pueden venir mañana por la mañana?" },
        { from: "penny", text: "¡Hola, Lucía! Sí, damos servicio en su zona. Mañana tengo disponible de 8 a 10 AM con Priya, nuestra especialista en climatización. La visita de diagnóstico cuesta $89 y se descuenta de la reparación." },
        { from: "customer", text: "Perfecto, de 8 a 10." },
        { from: "penny", text: "Listo. Su reserva es CPL-4820. Le envié la confirmación por SMS." },
      ],
    },
    {
      ...base,
      id: "lead-aisha",
      customerName: "Aisha Bello",
      channel: "Website chat",
      startedAtMin: 432,
      summary: "Furnace short-cycling since last night, house not holding temperature. Booked a furnace repair visit today 2–4 PM with Priya.",
      intent: "booking",
      urgency: "urgent",
      status: "booked",
      language: "en",
      emergency: false,
      jobCode: "CPL-4817",
      transcript: [
        { from: "customer", text: "My furnace keeps turning on and off every couple of minutes and the house won't warm up." },
        { from: "penny", text: "That's called short-cycling, and it's worth fixing soon. Common causes are a dirty flame sensor or a clogged filter. Repairs typically run $175 to $620. I can get Priya out today between 2 and 4 PM." },
        { from: "customer", text: "Yes please, today." },
        { from: "penny", text: "Booked: CPL-4817, today 2–4 PM. In the meantime, check that the filter isn't blocked." },
      ],
    },
    {
      ...base,
      id: "lead-marta",
      customerName: "Marta Kim",
      channel: "Website chat",
      startedAtMin: 515,
      summary: "Property manager asking for a maintenance quote covering a 6-unit building. Outside Penny's price book, so she collected details and handed off.",
      intent: "pricing",
      urgency: "routine",
      status: "needs_human",
      language: "en",
      emergency: false,
      jobCode: null,
      transcript: [
        { from: "customer", text: "I manage a 6-unit building on Mill Rd. Can I get a quote for yearly furnace and water heater maintenance on all units?" },
        { from: "penny", text: "Thanks, Marta. Multi-unit contracts are priced by our office rather than from the standard price book, so I won't guess. I've passed your building details to Sam, who will send a written quote." },
      ],
    },
    {
      ...base,
      id: "lead-renee",
      customerName: "Renee Castillo",
      channel: "Website chat",
      startedAtMin: 396,
      summary: "Kitchen sink backing up into the dishwasher. Booked drain clearing today 10 AM–12 PM with Marcus.",
      intent: "booking",
      urgency: "soon",
      status: "booked",
      language: "en",
      emergency: false,
      jobCode: "CPL-4806",
      transcript: [
        { from: "customer", text: "Kitchen sink is backing up and water is coming into the dishwasher." },
        { from: "penny", text: "That points to a clog past the sink trap. Drain clearing runs $149 to $325. Marcus has 10 AM to 12 PM open today." },
        { from: "customer", text: "Book it." },
        { from: "penny", text: "Done: CPL-4806, today 10 AM–12 PM. Please avoid running the dishwasher until Marcus has cleared the line." },
      ],
    },
    {
      ...base,
      id: "lead-tom",
      customerName: "Tom Whitfield",
      channel: "SMS",
      startedAtMin: 367,
      summary: "Asked what a furnace tune-up costs and whether the Care Club is worth it. Penny quoted the price book and explained the membership. No booking yet.",
      intent: "pricing",
      urgency: "routine",
      status: "resolved",
      language: "en",
      emergency: false,
      jobCode: null,
      transcript: [
        { from: "customer", text: "How much is a furnace tune up?" },
        { from: "penny", text: "A furnace tune-up is $109 to $159. If you'd use a tune-up for both heating and cooling each year, the Care Club at $19 a month includes both, so it pays for itself." },
        { from: "customer", text: "ok thanks, will think about it" },
      ],
    },
  ];
  return leads.map((lead, order) => ({ ...lead, startedAtMin: earlierToday(lead.startedAtMin, clock, order) }));
}

export function seedOutbox(clock: Clock): OutboundMessage[] {
  let order = 0;
  const sms = (id: string, to: string, atMin: number, body: string, jobCode: string): OutboundMessage => ({
    id,
    channel: "sms",
    to,
    subject: null,
    body,
    day: clock.today,
    atMin: earlierToday(atMin, clock, order++),
    jobCode,
  });
  return [
    sms("out-4820", "Lucía Fernández", 474, "Copperline: su visita CPL-4820 está confirmada para mañana, 8:00–10:00 AM, con Priya Nair. Responda a este mensaje para cambiarla.", "CPL-4820"),
    sms("out-4819", "Tessa Ruiz", 458, "Copperline: your visit CPL-4819 is confirmed for tomorrow, 10:00 AM–12:00 PM, with Marcus Reyes. Reply to reschedule.", "CPL-4819"),
    sms("out-4817", "Aisha Bello", 435, "Copperline: your visit CPL-4817 is confirmed for today, 2:00–4:00 PM, with Priya Nair. We'll text when she's on the way.", "CPL-4817"),
    sms("out-4806", "Renee Castillo", 401, "Copperline: your visit CPL-4806 is confirmed for today, 10:00 AM–12:00 PM, with Marcus Reyes. Reply to reschedule.", "CPL-4806"),
  ];
}

export function seedAlerts(): Alert[] {
  return [];
}
