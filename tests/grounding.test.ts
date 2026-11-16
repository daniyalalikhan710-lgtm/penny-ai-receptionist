import { describe, expect, it } from "vitest";
import { DOCS } from "@/lib/server/docs";
import { attributeReply } from "@/lib/server/grounding";

/** Replies the live model actually gave without citing, and the document each rests on. */
const GROUNDED: Array<[reply: string, docId: string, mustQuote: RegExp]> = [
  ["All our repairs come with a 2-year warranty on parts and labor.", "warranty", /2-year warranty/],
  ["The warranty doesn't cover damage from freezing, flooding, misuse, or work done by anyone other than Copperline after our visit.", "warranty", /does not cover/],
  ["If you supplied the parts yourself, only the labor is covered, not the parts.", "warranty", /Customer-supplied parts/],
  ["If you cancel at least 24 hours before your window starts, you get the full diagnostic fee back.", "booking-policy", /24 hours/],
  ["You can also move the booking for free up to 2 hours before your arrival window starts.", "booking-policy", /2 hours/],
];

/** Things Penny says that state no policy and must never get a source link. */
const UNGROUNDED = [
  "Is there something you need fixed?",
  "What can we help you with?",
  "Marcus can come today between 4 and 6 PM, or you can pick a time tomorrow morning.",
  "Tap a time above to hold it.",
  "I'll have to skip both.",
  "Thanks, Sam.",
  "Penny here, and yes, we can look at that dripping faucet.",
  "Got it, I've passed your number to the team and someone will call you back shortly.",
  "Politics and poems are outside what I can help with.",
  "Todas las reparaciones tienen una garantía de 2 años en piezas y mano de obra.",
  // Shares "technician", "fixed price" and "on site" with a sentence on the
  // financing page, which is about something else. Silence beats a wrong link.
  "The technician will give you a fixed price on site, and you approve it before any work starts.",
  // A figure the documents do not contain must block the link.
  "All our repairs come with a 5-year warranty on parts and labor.",
  "If you cancel at least 48 hours before your window starts, you get the full diagnostic fee back.",
];

describe("grounding safety net", () => {
  it.each(GROUNDED)("links %s", (reply, docId, mustQuote) => {
    const [first, ...rest] = attributeReply(reply);
    expect(rest).toHaveLength(0);
    expect(first?.citation.docId).toBe(docId);
    expect(first?.citation.quote).toMatch(mustQuote);
    expect(first?.citation.matched).toBe(true);
    expect(first?.at).toBe(reply.length);
  });

  it.each(UNGROUNDED)("leaves %s alone", (reply) => {
    expect(attributeReply(reply).map((a) => a.citation.quote)).toEqual([]);
  });

  it("quotes the document exactly, at the offsets it reports", () => {
    for (const [reply] of GROUNDED) {
      for (const { citation } of attributeReply(reply)) {
        const doc = DOCS.find((d) => d.id === citation.docId);
        expect(doc?.text.slice(citation.start, citation.end)).toBe(citation.quote);
      }
    }
  });

  it("places each link after its own sentence in a longer reply", () => {
    const reply = "Happy to explain. All our repairs come with a 2-year warranty on parts and labor.\n\nIf you cancel at least 24 hours before your window starts, you get the full diagnostic fee back. Anything else?";
    const found = attributeReply(reply);
    expect(found.map((a) => a.citation.docId)).toEqual(["warranty", "booking-policy"]);
    expect(reply.slice(0, found[0].at).endsWith("parts and labor.")).toBe(true);
    expect(reply.slice(0, found[1].at).endsWith("fee back.")).toBe(true);
  });

  it("links both halves of a sentence that restates two document sentences", () => {
    const reply = "All our repairs come with a 2-year warranty on parts and labor, and if a repair we made fails within that period, we come back and fix it at no charge.";
    const found = attributeReply(reply);
    expect(found.map((a) => a.citation.quote)).toEqual([
      "All repairs carry a 2-year warranty on parts and labor.",
      "If a repair we made fails within that period, we come back and fix it at no charge.",
    ]);
    expect(found.every((a) => a.at === reply.length)).toBe(true);
  });

  it("never attaches more than four links to one reply", () => {
    const reply = Array(8).fill("All our repairs come with a 2-year warranty on parts and labor.").join(" ");
    expect(attributeReply(reply)).toHaveLength(4);
  });
});
