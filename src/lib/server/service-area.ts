/**
 * Demo service area. "Riverbend" and its towns are fictional and the ZIP codes
 * are demo data; the UI labels them as such.
 */
export interface ServiceTown {
  zip: string;
  town: string;
}

export const SERVICE_AREA: ServiceTown[] = [
  { zip: "97401", town: "Riverbend (Downtown)" },
  { zip: "97402", town: "Riverbend (Eastside)" },
  { zip: "97403", town: "Riverbend (Westbank)" },
  { zip: "97404", town: "Alder Heights" },
  { zip: "97405", town: "Copper Hill" },
  { zip: "97406", town: "Millbrook" },
  { zip: "97407", town: "Fairhaven" },
  { zip: "97408", town: "Stonebridge" },
  { zip: "97409", town: "Cedar Flats" },
  { zip: "97410", town: "Larkspur" },
  { zip: "97411", town: "Quarry Park" },
  { zip: "97412", town: "Willow Landing" },
];

export function townForZip(zip: string): ServiceTown | undefined {
  return SERVICE_AREA.find((t) => t.zip === zip);
}

/** Pulls the first 5-digit ZIP out of free text such as an address. */
export function extractZip(text: string): string | null {
  const match = text.match(/\b(\d{5})\b/);
  return match ? match[1] : null;
}
