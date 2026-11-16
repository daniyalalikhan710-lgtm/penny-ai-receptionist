import "server-only";
import type { CitationView } from "@/lib/domain/types";
import { DOCS } from "./docs";

/**
 * A safety net for grounded answers.
 *
 * The model normally cites the company documents itself (the API's citations
 * feature), but live testing showed it sometimes answers a policy question
 * correctly and leaves the citation off. When a reply arrives with no
 * citations at all, this module looks for the document sentence each reply
 * sentence rests on and attaches it, so the customer still gets the source
 * link. It is deliberately conservative: no match, no link.
 *
 * It is plain word matching, not another model call: free, instant and
 * deterministic. It only understands English; in other languages the reply
 * relies on the model's own citations.
 */

export interface Attribution {
  /** Offset in the reply text just after the sentence this supports. */
  at: number;
  citation: CitationView;
}

interface Sentence {
  text: string;
  start: number;
  end: number;
}

interface DocSentence extends Sentence {
  docId: string;
  docTitle: string;
  stems: Set<string>;
  numbers: Set<string>;
  weight: number;
}

const STOPWORDS = new Set(
  (
    "a an and are as at be been but by can come comes could do does for from had has have how i if in into is it its just may more most my no not of on one only or our out " +
    "over so than that the their them then there these they this to too up us was we were what when which who will with would you your yours also any all each every here " +
    "about after before again get gets got go goes going need needs let me im ill ive id were youd youll youre thats theres whats dont doesnt isnt cant wont"
  ).split(" "),
);

const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12",
};

/** Sentences of one line of text, with offsets relative to `base`. */
function sentencesOf(line: string, base: number): Sentence[] {
  const out: Sentence[] = [];
  // Up to a full stop, question mark or exclamation mark that ends a word
  // ("4.5" and "8:00" do not end a sentence), or to the end of the line.
  const pattern = /\S.*?(?:[.!?]+["')\]]*(?=\s|$)|$)/g;
  for (let match = pattern.exec(line); match; match = pattern.exec(line)) {
    if (match[0].length === 0) break;
    out.push({ text: match[0], start: base + match.index, end: base + match.index + match[0].length });
  }
  return out;
}

function splitSentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  let offset = 0;
  for (const line of text.split("\n")) {
    out.push(...sentencesOf(line, offset));
    offset += line.length + 1;
  }
  return out;
}

function analyse(text: string): { stems: Set<string>; numbers: Set<string> } {
  const stems = new Set<string>();
  const numbers = new Set<string>();
  const normal = text.toLowerCase().replace(/[‘’']/g, "");
  for (const raw of normal.match(/\d[\d,]*(?:\.\d+)?|\p{L}+/gu) ?? []) {
    if (/^\d/.test(raw)) {
      numbers.add(raw.replace(/,/g, "").replace(/\.0+$/, ""));
      continue;
    }
    const digit = NUMBER_WORDS[raw];
    if (digit) {
      // "one" is too often a pronoun to count as a figure.
      if (raw !== "one") numbers.add(digit);
      continue;
    }
    if (STOPWORDS.has(raw) || raw.length < 3) continue;
    // A crude stem: "cancel", "cancelling" and "cancellation" all meet at
    // "cance", and "gives" meets "give".
    const singular = raw.length > 3 && raw.endsWith("s") && !raw.endsWith("ss") ? raw.slice(0, -1) : raw;
    stems.add(singular.length > 5 ? singular.slice(0, 5) : singular);
  }
  return { stems, numbers };
}

let index: { sentences: DocSentence[]; idf: Map<string, number>; maxIdf: number } | null = null;

function docIndex() {
  if (index) return index;
  const sentences: DocSentence[] = [];
  for (const doc of DOCS) {
    let offset = 0;
    for (const line of doc.text.split("\n")) {
      const lineStart = offset;
      offset += line.length + 1;
      if (!line.trim() || line.startsWith("#")) continue;
      const bullet = /^\s*-\s+/.exec(line)?.[0].length ?? 0;
      for (const sentence of sentencesOf(line.slice(bullet), lineStart + bullet)) {
        const { stems, numbers } = analyse(sentence.text);
        if (stems.size < 3) continue;
        sentences.push({ ...sentence, docId: doc.id, docTitle: doc.title, stems, numbers, weight: 0 });
      }
    }
  }
  const frequency = new Map<string, number>();
  for (const sentence of sentences) for (const stem of sentence.stems) frequency.set(stem, (frequency.get(stem) ?? 0) + 1);
  const idf = new Map<string, number>();
  // Squared, so a sentence's rare words ("application", "refunded") count for
  // far more than words every document uses ("technician", "repair").
  for (const [stem, count] of frequency) idf.set(stem, Math.log(1 + sentences.length / count) ** 2);
  const maxIdf = Math.log(1 + sentences.length) ** 2;
  for (const sentence of sentences) sentence.weight = [...sentence.stems].reduce((sum, stem) => sum + (idf.get(stem) ?? maxIdf), 0);
  index = { sentences, idf, maxIdf };
  return index;
}

/** How much of the evidence must line up before a link is attached. */
const MIN_SHARED_WORDS = 3;
// Set from real replies: correct matches scored 0.6 to 1.0, and the closest
// wrong one (a sentence about fixed prices landing on the financing page) 0.57.
const MIN_SCORE = 0.6;
const MAX_LINKS = 4;

function bestMatch(reply: string): DocSentence | null {
  const scored = scoreSentence(reply);
  return scored?.accepted ? scored.sentence : null;
}

/** Exposed for tests and tuning: the best candidate and how well it scored. */
export function scoreSentence(reply: string): { sentence: DocSentence; score: number; accepted: boolean } | null {
  const { sentences, idf, maxIdf } = docIndex();
  const { stems, numbers } = analyse(reply);
  if (stems.size < MIN_SHARED_WORDS) return null;
  const replyWeight = [...stems].reduce((sum, stem) => sum + (idf.get(stem) ?? maxIdf), 0);
  let best: DocSentence | null = null;
  let bestScore = 0;
  for (const candidate of sentences) {
    // A figure the document sentence does not contain means the reply says
    // something this sentence cannot vouch for.
    if ([...numbers].some((n) => !candidate.numbers.has(n))) continue;
    let shared = 0;
    let sharedWeight = 0;
    for (const stem of stems) {
      if (!candidate.stems.has(stem)) continue;
      shared += 1;
      sharedWeight += idf.get(stem) ?? maxIdf;
    }
    if (shared < MIN_SHARED_WORDS) continue;
    // Both directions must hold: the reply is mostly about this sentence, and
    // it carries most of what the sentence says. Taking the weaker of the two
    // keeps a sentence that merely shares common words from qualifying.
    const score = Math.min(sharedWeight / replyWeight, sharedWeight / candidate.weight);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best ? { sentence: best, score: bestScore, accepted: bestScore >= MIN_SCORE } : null;
}

/**
 * Finds the document passages an uncited reply rests on. Returns nothing for
 * small talk, questions, and anything it cannot match with confidence.
 */
/** Splits "A, and B" style sentences, which often restate two document sentences at once. */
function clausesOf(sentence: string): string[] {
  const clauses = sentence.split(/,\s+(?:and|but|so)\s+|[;:]\s+|\s+\u2014\s+/);
  return clauses.length > 1 ? clauses : [];
}

/**
 * Finds the document passages an uncited reply rests on. Returns nothing for
 * small talk, questions, and anything it cannot match with confidence.
 */
export function attributeReply(text: string): Attribution[] {
  const out: Attribution[] = [];
  for (const sentence of splitSentences(text)) {
    if (/\?["')\]]*$/.test(sentence.text)) continue;
    const whole = bestMatch(sentence.text);
    const matches = whole ? [whole] : clausesOf(sentence.text).map(bestMatch).filter((m): m is DocSentence => m !== null);
    for (const match of matches) {
      if (out.length >= MAX_LINKS) return out;
      if (out.some((a) => a.at === sentence.end && a.citation.docId === match.docId && a.citation.start === match.start)) continue;
      out.push({
        at: sentence.end,
        citation: { docId: match.docId, docTitle: match.docTitle, quote: match.text, start: match.start, end: match.end, matched: true },
      });
    }
  }
  return out;
}
