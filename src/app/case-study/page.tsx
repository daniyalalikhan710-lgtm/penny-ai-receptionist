import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen, CalendarCheck, Camera, Languages, ScanSearch, ShieldAlert, UserRoundCheck } from "lucide-react";
import { DOCS } from "@/lib/server/docs";
import { SYSTEM_PROMPT } from "@/lib/server/engine/prompt";
import { apiToolSpecs } from "@/lib/server/tools";

export const metadata: Metadata = {
  title: "Case study · Penny, an AI receptionist for home-services businesses",
  description: "How Penny answers customers, diagnoses problems from a photo, quotes from the real price book and books the job, and what it would take to build one for your business.",
};

/** A rough size for the cached prompt prefix: about 4 characters per token. */
function estimatePrefixTokens(): number {
  const chars = SYSTEM_PROMPT.length + JSON.stringify(apiToolSpecs()).length + DOCS.reduce((n, d) => n + d.text.length + d.title.length, 0);
  return Math.round(chars / 4 / 100) * 100;
}

const FEATURES = [
  { icon: Camera, title: "Diagnoses from a photo", text: "A customer snaps the problem. Penny describes what she sees, how urgent it is, what to do right now, and the price range for the fix." },
  { icon: CalendarCheck, title: "Books the job end to end", text: "Real availability, a details form, a deposit checkout and a confirmation text. The job lands on the dispatch board without anyone picking up a phone." },
  { icon: BookOpen, title: "Never makes up a price or policy", text: "Prices come from the price book and policies from the company's own documents. Every policy answer links to the exact passage it came from." },
  { icon: ShieldAlert, title: "Puts safety first", text: "Gas smell, carbon monoxide, sparking or flooding: Penny leads with getting people safe, alerts the team in red, and offers an immediate callback." },
  { icon: UserRoundCheck, title: "Hands over to a person", text: "The owner can step into any conversation with one click. Penny pauses, then picks up again knowing exactly what was said." },
  { icon: Languages, title: "Answers in the customer's language", text: "A customer who writes in Spanish gets Spanish back. The team's inbox summary is always in English." },
];

const STACK = [
  ["AI", "Claude (Anthropic), official TypeScript SDK, streaming tool use, vision, document citations, prompt caching"],
  ["App", "Next.js 16 (App Router), React 19, TypeScript in strict mode"],
  ["UI", "Tailwind CSS 4, shadcn/ui, lucide icons, Motion for animation"],
  ["State", "Zustand in the browser, one isolated sandbox per visitor, no database"],
  ["Safety", "zod validation on every payload and tool input, rate limits, message and image caps"],
  ["Quality", "Vitest unit tests, Playwright end-to-end tests, a behavioural eval suite"],
];

function Shot({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
      <Image src={src} alt={alt} width={1440} height={900} className="h-auto w-full" sizes="(min-width: 1024px) 960px, 100vw" />
      <figcaption className="border-t border-ink-100 px-4 py-2.5 text-[13px] leading-snug text-ink-600">{caption}</figcaption>
    </figure>
  );
}

function Diagram() {
  const box = "fill-white stroke-ink-200";
  const label = "fill-ink-900 text-[13px] font-semibold";
  const small = "fill-ink-600 text-[11px]";
  return (
    <svg viewBox="0 0 880 380" role="img" aria-labelledby="arch-title arch-desc" className="h-auto w-full">
      <title id="arch-title">Architecture of the Penny demo</title>
      <desc id="arch-desc">
        The browser holds the chat widget, the owner dashboard and the sandbox state. It sends each turn to one server route, which runs either the live Claude engine or the scripted replay engine. Both call the same server tools, which read the price book, the calendar logic and the company documents, and return cards and state patches that update both panes.
      </desc>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" className="fill-copper-600" />
        </marker>
      </defs>

      <rect x="10" y="20" width="250" height="340" rx="16" className="fill-cream stroke-ink-200" />
      <text x="30" y="48" className="fill-copper-700 text-[11px] font-bold tracking-widest">BROWSER</text>
      <rect x="30" y="62" width="210" height="64" rx="10" className={box} />
      <text x="46" y="88" className={label}>Chat widget</text>
      <text x="46" y="108" className={small}>streamed text, cards, citations</text>
      <rect x="30" y="140" width="210" height="64" rx="10" className={box} />
      <text x="46" y="166" className={label}>Owner dashboard</text>
      <text x="46" y="186" className={small}>dispatch board, inbox, alerts</text>
      <rect x="30" y="218" width="210" height="64" rx="10" className={box} />
      <text x="46" y="244" className={label}>Sandbox state</text>
      <text x="46" y="264" className={small}>jobs, leads, messages (per visitor)</text>
      <text x="30" y="312" className={small}>State patches from tool results</text>
      <text x="30" y="328" className={small}>update both panes at once.</text>

      <rect x="330" y="20" width="250" height="340" rx="16" className="fill-ink-900" />
      <text x="350" y="48" className="fill-copper-300 text-[11px] font-bold tracking-widest">SERVER · /api/chat</text>
      <rect x="350" y="62" width="210" height="54" rx="10" className="fill-ink-800 stroke-ink-600" />
      <text x="366" y="85" className="fill-cream text-[13px] font-semibold">Caps and rate limits</text>
      <text x="366" y="103" className="fill-ink-300 text-[11px]">zod validation of every payload</text>
      <rect x="350" y="130" width="100" height="70" rx="10" className="fill-copper-600" />
      <text x="364" y="158" className="fill-white text-[13px] font-semibold">Live engine</text>
      <text x="364" y="176" className="fill-copper-100 text-[11px]">Claude tool loop</text>
      <rect x="460" y="130" width="100" height="70" rx="10" className="fill-ink-700 stroke-ink-500" />
      <text x="474" y="158" className="fill-cream text-[13px] font-semibold">Replay</text>
      <text x="474" y="176" className="fill-ink-300 text-[11px]">scripted, no key</text>
      <rect x="350" y="222" width="210" height="62" rx="10" className="fill-cream" />
      <text x="366" y="248" className={label}>Tools (same for both engines)</text>
      <text x="366" y="268" className={small}>estimate, slots, booking, emergency…</text>
      <text x="350" y="312" className="fill-ink-300 text-[11px]">Returns: text, cards, citations,</text>
      <text x="350" y="328" className="fill-ink-300 text-[11px]">usage and state patches.</text>

      <rect x="650" y="20" width="220" height="340" rx="16" className="fill-cream stroke-ink-200" />
      <text x="670" y="48" className="fill-copper-700 text-[11px] font-bold tracking-widest">SOURCES OF TRUTH</text>
      <rect x="670" y="62" width="180" height="56" rx="10" className={box} />
      <text x="686" y="86" className={label}>Price book</text>
      <text x="686" y="104" className={small}>every price quoted</text>
      <rect x="670" y="132" width="180" height="56" rx="10" className={box} />
      <text x="686" y="156" className={label}>Calendar logic</text>
      <text x="686" y="174" className={small}>every slot offered</text>
      <rect x="670" y="202" width="180" height="56" rx="10" className={box} />
      <text x="686" y="226" className={label}>Company documents</text>
      <text x="686" y="244" className={small}>every policy, with citations</text>
      <rect x="670" y="286" width="180" height="56" rx="10" className="fill-ink-900" />
      <text x="686" y="310" className="fill-cream text-[13px] font-semibold">Claude API</text>
      <text x="686" y="328" className="fill-ink-300 text-[11px]">vision, tools, cached prompt</text>

      <path d="M260 150h64" className="stroke-copper-600" strokeWidth="2" markerEnd="url(#arrow)" fill="none" />
      <text x="268" y="142" className={small}>turn</text>
      <path d="M330 230h-64" className="stroke-copper-600" strokeWidth="2" markerEnd="url(#arrow)" fill="none" />
      <text x="268" y="222" className={small}>events</text>
      <path d="M560 253h84" className="stroke-copper-600" strokeWidth="2" markerEnd="url(#arrow)" markerStart="url(#arrow)" fill="none" />
      <path d="M400 200v16" className="stroke-copper-300" strokeWidth="2" markerEnd="url(#arrow)" fill="none" />
      <path d="M510 200v16" className="stroke-copper-300" strokeWidth="2" markerEnd="url(#arrow)" fill="none" />
      <path d="M580 165h40a20 20 0 0 1 20 20v120a10 10 0 0 0 10 10h14" className="stroke-copper-600" strokeWidth="2" markerEnd="url(#arrow)" fill="none" strokeDasharray="5 4" />
    </svg>
  );
}

export default function CaseStudy() {
  const author = process.env.NEXT_PUBLIC_AUTHOR_NAME?.trim() ?? "";
  const hireUrl = process.env.NEXT_PUBLIC_HIRE_URL?.trim() ?? "";
  const prefix = estimatePrefixTokens();

  return (
    <div className="min-h-dvh bg-cream text-ink-900">
      <header className="on-dark bg-ink-900 text-cream">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <Link href="/" className="flex items-center gap-2 text-[13.5px] font-semibold text-copper-200 hover:text-copper-100">
            <ArrowLeft className="size-4" aria-hidden /> Back to the live demo
          </Link>
          <p className="text-[12px] text-ink-300">Copperline is a fictional business</p>
        </div>
        <div className="mx-auto max-w-5xl px-5 pt-8 pb-14">
          <p className="text-[12px] font-semibold tracking-[0.18em] text-copper-300 uppercase">Case study</p>
          <h1 className="mt-3 max-w-3xl font-display text-[38px] leading-[1.05] font-semibold tracking-tight text-balance sm:text-[52px]">
            An AI receptionist that books the job while you&rsquo;re under a sink.
          </h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-ink-200">
            Penny answers a home-services company&rsquo;s customers the moment they write in: she looks at their photo, quotes from the real price book, books a technician, takes the deposit, and puts the job on the dispatch board. This page explains what she does and how she is built.
          </p>
          <Link href="/" className="mt-7 inline-flex h-11 items-center gap-2 rounded-xl bg-copper-500 px-5 text-[14.5px] font-semibold text-ink-950 hover:bg-copper-400">
            Try the live demo <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-16 px-5 py-14">
        <section aria-labelledby="problem" className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 id="problem" className="font-display text-[28px] font-semibold tracking-tight">The problem</h2>
            <p className="mt-3 text-[16px] leading-relaxed text-ink-700">
              A plumbing or heating company loses work every time a call goes to voicemail. The owner is on a job, the office is closed, and the customer with a leaking water heater has already messaged the next company on the list.
            </p>
            <p className="mt-3 text-[16px] leading-relaxed text-ink-700">
              A generic chatbot does not fix that. It can chat, but it cannot see the calendar, does not know the prices, and will happily invent a policy. The owner ends up calling everyone back anyway.
            </p>
          </div>
          <div>
            <h2 className="font-display text-[28px] font-semibold tracking-tight">The approach</h2>
            <p className="mt-3 text-[16px] leading-relaxed text-ink-700">
              Penny is given the same things a good receptionist has: the price book, the calendar, the company&rsquo;s policies, and clear rules about when to get a person. She is not allowed to guess. Every price comes from the price book, every time from the calendar, every policy from a document she can point to.
            </p>
            <p className="mt-3 text-[16px] leading-relaxed text-ink-700">
              The result is a conversation that ends in a booked, paid job, with the owner watching it arrive rather than chasing it.
            </p>
          </div>
        </section>

        <section aria-labelledby="tour">
          <h2 id="tour" className="font-display text-[28px] font-semibold tracking-tight">What she does</h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="rounded-2xl border border-ink-100 bg-white p-5">
                <span className="flex size-10 items-center justify-center rounded-xl bg-copper-100 text-copper-700">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-3 font-display text-[18px] font-semibold">{title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-ink-600">{text}</p>
              </li>
            ))}
          </ul>
          <div className="mt-8 space-y-6">
            <Shot src="/screens/booked.jpg" alt="Split screen: the customer's chat shows a booking confirmation while the owner's dispatch board shows the new job" caption="One conversation, start to finish: the customer is booked and paid on the left, and the job is already on Marcus's 2 PM slot on the right." />
            <div className="grid gap-6 lg:grid-cols-2">
              <Shot src="/screens/diagnosis.jpg" alt="Penny's photo diagnosis card with safe immediate steps and an estimate from the price book" caption="A photo becomes a diagnosis, safe next steps and a price range taken from the price book." />
              <Shot src="/screens/emergency.jpg" alt="An emergency card telling the customer to leave the building, and a red alert on the owner's dashboard" caption="A gas smell gets safety instructions first and a red alert for the team." />
              <Shot src="/screens/citation.jpg" alt="A source document drawer with the cited warranty passage highlighted" caption="Policy answers link to the exact passage they came from." />
              <Shot src="/screens/xray.jpg" alt="The X-ray panel listing each tool call with its input and output" caption="X-ray mode shows every tool call, citation and token for technical buyers." />
            </div>
          </div>
        </section>

        <section aria-labelledby="architecture">
          <h2 id="architecture" className="font-display text-[28px] font-semibold tracking-tight">How it is built</h2>
          <p className="mt-3 max-w-3xl text-[16px] leading-relaxed text-ink-700">
            The model never talks to the database, the calendar or the payment form directly. It asks for things through a small set of tools, and each tool checks its input, reads the real data and returns a result. The model writes the conversation; the tools decide the facts.
          </p>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-ink-100 bg-white p-4">
            <div className="min-w-[640px]">
              <Diagram />
            </div>
          </div>
          <dl className="mt-8 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {STACK.map(([term, detail]) => (
              <div key={term} className="border-t border-ink-200 pt-3">
                <dt className="text-[12px] font-semibold tracking-[0.14em] text-copper-700 uppercase">{term}</dt>
                <dd className="mt-1 text-[14.5px] leading-relaxed text-ink-700">{detail}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="cost" className="rounded-3xl bg-ink-900 p-8 text-cream">
          <h2 id="cost" className="flex items-center gap-2.5 font-display text-[28px] font-semibold tracking-tight">
            <ScanSearch className="size-7 text-copper-300" aria-hidden /> What a conversation costs
          </h2>
          <p className="mt-3 max-w-3xl text-[16px] leading-relaxed text-ink-200">
            The instructions, tools and company documents add up to roughly {prefix.toLocaleString("en-US")} tokens. They are identical for every customer, so they are cached: after the first request they are billed at a small fraction of the normal rate, on every turn of every conversation.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-ink-800 p-5">
              <p className="text-[12px] font-semibold tracking-[0.14em] text-copper-300 uppercase">Estimate · Claude Opus 5.5</p>
              <p className="mt-2 font-display text-[32px] leading-none font-semibold">about 10 to 15 cents</p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-300">for a full photo-to-paid-booking conversation of around ten model steps.</p>
            </div>
            <div className="rounded-2xl bg-ink-800 p-5">
              <p className="text-[12px] font-semibold tracking-[0.14em] text-copper-300 uppercase">Estimate · Claude Haiku 5.5</p>
              <p className="mt-2 font-display text-[32px] leading-none font-semibold">under 1 cent</p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-300">for the same conversation on the smaller model.</p>
            </div>
          </div>
          <p className="mt-5 max-w-3xl text-[13.5px] leading-relaxed text-ink-300">
            These are estimates worked out from the prompt size and published API prices, not measurements. The demo&rsquo;s X-ray panel reports the real token counts and cost of every turn once it is running on a live API key, and the measured figures replace these in the project README.
          </p>
        </section>

        <section aria-labelledby="yours" className="rounded-3xl border border-copper-200 bg-copper-50 p-8">
          <h2 id="yours" className="font-display text-[28px] font-semibold tracking-tight">What I&rsquo;d build for your business</h2>
          <p className="mt-3 max-w-3xl text-[16px] leading-relaxed text-ink-700">
            Copperline is made up, but the pattern is not. The same build fits any business that books appointments or jobs: trades, clinics, salons, auto shops, property managers. What changes is what gets plugged in.
          </p>
          <ul className="mt-5 grid gap-3 text-[15px] leading-relaxed text-ink-800 sm:grid-cols-2">
            <li className="rounded-xl bg-white p-4"><strong className="font-semibold">Your price list and policies</strong>, so answers match what your staff would say.</li>
            <li className="rounded-xl bg-white p-4"><strong className="font-semibold">Your calendar or booking system</strong> (Google Calendar, Jobber, ServiceTitan, Calendly and similar).</li>
            <li className="rounded-xl bg-white p-4"><strong className="font-semibold">Real payments and messages</strong> through Stripe and Twilio, in place of the simulated ones here.</li>
            <li className="rounded-xl bg-white p-4"><strong className="font-semibold">Your rules for handing off</strong>: when to get a person, who gets the alert, and how fast.</li>
          </ul>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            {hireUrl ? (
              <a href={hireUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl bg-ink-900 px-5 text-[14.5px] font-semibold text-cream hover:bg-ink-700">
                Hire me to build yours <ArrowRight className="size-4" aria-hidden />
              </a>
            ) : null}
            <Link href="/" className="inline-flex h-11 items-center gap-2 rounded-xl border border-ink-300 bg-white px-5 text-[14.5px] font-semibold text-ink-900 hover:bg-ink-50">
              Open the live demo
            </Link>
            {author ? <p className="text-[14px] text-ink-600">Designed and built by <span className="font-semibold text-ink-900">{author}</span>.</p> : null}
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-100 px-5 py-8 text-center text-[12.5px] text-ink-500">
        Copperline Plumbing &amp; Heating is a fictional business. No real payments, text messages or emails are sent by this demo.
      </footer>
    </div>
  );
}
