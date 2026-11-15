import type { Technician, Trade } from "./types";

/** Fictional staff. Avatars are generated initials: no real people's photos. */
export const TECHNICIANS: Technician[] = [
  {
    id: "marcus",
    name: "Marcus Reyes",
    initials: "MR",
    title: "Master plumber",
    trades: ["plumbing"],
    color: "#9A5B22",
  },
  {
    id: "priya",
    name: "Priya Nair",
    initials: "PN",
    title: "HVAC specialist",
    trades: ["hvac"],
    color: "#2F6F8F",
  },
  {
    id: "dee",
    name: "Dee Okafor",
    initials: "DO",
    title: "Plumbing & HVAC",
    trades: ["plumbing", "hvac"],
    color: "#5B7A4A",
  },
];

export const OWNER = { name: "Sam", fullName: "Sam Whitaker", title: "Owner / dispatcher" };

export const DEMO_CUSTOMER = {
  name: "Jordan Lee",
  phone: "(555) 010-0142",
  email: "jordan.lee@example.com",
  address: "42 Alder St, Riverbend",
  zip: "97401",
};

export const COMPANY = {
  name: "Copperline Plumbing & Heating",
  short: "Copperline",
  phone: "(555) 010-0100",
  area: "Riverbend",
};

export function techById(id: string): Technician | undefined {
  return TECHNICIANS.find((t) => t.id === id);
}

export function techsForTrade(trade: Trade): Technician[] {
  return TECHNICIANS.filter((t) => t.trades.includes(trade));
}
