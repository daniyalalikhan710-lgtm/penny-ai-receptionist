import type { EstimateView, Trade } from "@/lib/domain/types";

/**
 * Copperline's price book: the single source of truth for every number Penny
 * quotes. It is only ever imported by server code. The pricing document Claude
 * cites is generated from this same data (see docs.ts), so the two can't drift.
 *
 * Copperline is a fictional business; these are illustrative US price ranges.
 */

export interface Service {
  code: string;
  name: string;
  trade: Trade;
  low: number;
  high: number;
  /** One plain-English line a customer would understand. */
  blurb: string;
}

export const DIAGNOSTIC_FEE = 89;
export const AFTER_HOURS_SURCHARGE = 95;
export const MEMBER_DISCOUNT_PCT = 15;
export const MEMBERSHIP_MONTHLY = 19;

export const SERVICES: Service[] = [
  // Plumbing
  { code: "WH-REPAIR", name: "Water heater repair", trade: "plumbing", low: 180, high: 450, blurb: "Leaking valves or fittings, heating elements, thermostats, pilot and gas-valve faults." },
  { code: "WH-REPLACE", name: "Tank water heater replacement", trade: "plumbing", low: 1450, high: 2400, blurb: "New 40–50 gallon tank installed, old unit hauled away, code upgrades included." },
  { code: "WH-TANKLESS", name: "Tankless water heater installation", trade: "plumbing", low: 2900, high: 4600, blurb: "Gas or electric tankless unit, venting and line sizing included." },
  { code: "DRAIN-CLEAR", name: "Drain clearing", trade: "plumbing", low: 149, high: 325, blurb: "Kitchen, bathroom, tub or shower drain cleared by cable or hydro-jet." },
  { code: "SEWER-MAIN", name: "Main sewer line clearing", trade: "plumbing", low: 350, high: 750, blurb: "Main line cleared with a camera inspection of the pipe." },
  { code: "LEAK-REPAIR", name: "Pipe leak and joint repair", trade: "plumbing", low: 195, high: 520, blurb: "Leaking or corroded joints, fittings, shut-off valves and short pipe sections." },
  { code: "TOILET-REPAIR", name: "Toilet repair", trade: "plumbing", low: 129, high: 285, blurb: "Running, leaking or weak-flushing toilets: fill valve, flapper, flush valve, wax ring." },
  { code: "FAUCET", name: "Faucet and fixture repair", trade: "plumbing", low: 145, high: 390, blurb: "Dripping or stiff faucets repaired or replaced, including customer-supplied fixtures." },
  { code: "DISPOSAL", name: "Garbage disposal replacement", trade: "plumbing", low: 275, high: 495, blurb: "New disposal supplied and installed, old unit removed." },
  { code: "SUMP", name: "Sump pump replacement", trade: "plumbing", low: 480, high: 950, blurb: "New pump and check valve installed and tested." },
  // Heating & cooling
  { code: "AC-REPAIR", name: "Air conditioner repair", trade: "hvac", low: 185, high: 650, blurb: "Not cooling, frozen coil, capacitor, contactor, fan motor or refrigerant leak check." },
  { code: "AC-TUNEUP", name: "Air conditioner tune-up", trade: "hvac", low: 119, high: 169, blurb: "Seasonal clean, test and safety check for one system." },
  { code: "FURNACE-REPAIR", name: "Furnace repair", trade: "hvac", low: 175, high: 620, blurb: "No heat, short-cycling, igniter, flame sensor, blower or control board faults." },
  { code: "FURNACE-TUNEUP", name: "Furnace tune-up", trade: "hvac", low: 109, high: 159, blurb: "Seasonal clean, combustion test and safety check for one system." },
  { code: "THERMOSTAT", name: "Thermostat diagnosis and replacement", trade: "hvac", low: 140, high: 380, blurb: "Blank screens, error codes and wiring faults; standard or smart thermostat fitted." },
  { code: "HEATPUMP-REPAIR", name: "Heat pump repair", trade: "hvac", low: 210, high: 720, blurb: "Not heating or cooling, defrost faults, reversing valve and outdoor unit problems." },
];

export const SERVICE_CODES = SERVICES.map((s) => s.code) as [string, ...string[]];

export function serviceByCode(code: string): Service | undefined {
  return SERVICES.find((s) => s.code === code);
}

export interface EstimateOptions {
  afterHours: boolean;
  member: boolean;
}

function roundTo5(value: number): number {
  return Math.round(value / 5) * 5;
}

/** Every estimate in the product comes out of this function. */
export function buildEstimate(service: Service, options: EstimateOptions): EstimateView {
  const surcharge = options.afterHours ? AFTER_HOURS_SURCHARGE : 0;
  // List prices are quoted exactly as written; only discounted prices are rounded.
  const discounted = (price: number) =>
    options.member ? roundTo5(price * (1 - MEMBER_DISCOUNT_PCT / 100)) : price;
  const low = discounted(service.low) + surcharge;
  const high = discounted(service.high) + surcharge;
  const notes: string[] = [];
  if (options.member) {
    notes.push(`Care Club price: ${MEMBER_DISCOUNT_PCT}% off and no diagnostic fee.`);
  } else {
    notes.push(`The $${DIAGNOSTIC_FEE} diagnostic fee is credited toward the repair if you go ahead.`);
  }
  if (options.afterHours) notes.push(`Includes the $${AFTER_HOURS_SURCHARGE} after-hours surcharge.`);
  notes.push("The technician confirms a fixed price on site before any work starts.");
  return {
    serviceCode: service.code,
    serviceName: service.name,
    low,
    high,
    diagnosticFee: options.member ? 0 : DIAGNOSTIC_FEE,
    afterHoursSurcharge: AFTER_HOURS_SURCHARGE,
    memberApplied: options.member,
    afterHoursApplied: options.afterHours,
    note: notes.join(" "),
  };
}
