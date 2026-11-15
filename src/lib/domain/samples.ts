/** Bundled sample photos a visitor can send with one tap. See CREDITS.md. */
export interface SamplePhoto {
  id: string;
  file: string;
  thumb: string;
  label: string;
  /** What the "customer" says when sending it. */
  prompt: string;
  alt: string;
}

export const SAMPLE_PHOTOS: SamplePhoto[] = [
  {
    id: "water-heater",
    file: "/samples/water-heater.jpg",
    thumb: "/samples/water-heater-thumb.jpg",
    label: "Leaking water heater",
    prompt: "My water heater is leaking",
    alt: "A tank water heater on an exterior wall with dark streaks below its top fittings",
  },
  {
    id: "clogged-sink",
    file: "/samples/clogged-sink.jpg",
    thumb: "/samples/clogged-sink-thumb.jpg",
    label: "Sink won't drain",
    prompt: "My kitchen sink won't drain",
    alt: "A kitchen sink basin full of standing soapy water and dishes",
  },
  {
    id: "ac-unit",
    file: "/samples/ac-unit.jpg",
    thumb: "/samples/ac-unit-thumb.jpg",
    label: "AC not cooling",
    prompt: "My AC runs but the air isn't cold",
    alt: "An outdoor mini-split air conditioner unit beside a house",
  },
  {
    id: "thermostat",
    file: "/samples/thermostat.jpg",
    thumb: "/samples/thermostat-thumb.jpg",
    label: "Heat on, house cold",
    prompt: "Thermostat says it's heating but the vents blow cold",
    alt: "A wall thermostat in heat mode showing 69 degrees",
  },
  {
    id: "pipe-joint",
    file: "/samples/pipe-joint.jpg",
    thumb: "/samples/pipe-joint-thumb.jpg",
    label: "Corroded pipe fitting",
    prompt: "This pipe fitting looks bad. Is it about to leak?",
    alt: "A heavily corroded pipe fitting with rust and green patina",
  },
  {
    id: "toilet",
    file: "/samples/toilet.jpg",
    thumb: "/samples/toilet-thumb.jpg",
    label: "Running toilet",
    prompt: "My toilet keeps running after I flush",
    alt: "A white residential toilet with its tank and supply line",
  },
];

export function sampleById(id: string): SamplePhoto | undefined {
  return SAMPLE_PHOTOS.find((s) => s.id === id);
}
