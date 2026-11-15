# Upwork portfolio entry

Ready to paste. Replace the demo link once the app is deployed.

## Title

AI Receptionist That Books Jobs 24/7 for a Plumbing & HVAC Company (Claude + Next.js)

## Description

**Every missed call is a job that goes to a competitor.** I built Penny, an AI receptionist that answers a home-services company's customers the moment they write in, day or night. A customer sends a photo of a leaking water heater; Penny tells them what it likely is, how urgent it is and what to do right now, quotes a price range from the company's real price book, offers the earliest open times, takes the deposit and confirms by text. The job appears on the owner's dispatch board without anyone picking up a phone. If someone mentions a gas smell she leads with safety and alerts the team in red; if a customer wants a person, the owner takes over the chat with one click.

What makes it safe to put in front of customers: Penny never makes up a price, a time or a policy. Prices come from the price book, availability from the calendar, and policy answers link to the exact passage in the company's own documents. She answers in the customer's language, says she is an AI when asked, and can't be talked into discounts. Under the hood it is Claude with tool use, vision, citations and prompt caching on Next.js and TypeScript, with rate limits and spending caps, automated tests, and an "X-ray" view that shows every tool call and what each conversation costs. The demo business is fictional; the same build plugs into your price list, calendar, Stripe and Twilio.

**Live demo:** (link coming)

## My role

Sole designer and developer: product design, UX and UI, front end, back end, AI prompt and tool design, testing and evaluation.

## Skills and tags

AI Chatbot · AI Agent Development · Claude · Anthropic API · LLM Tool Use / Function Calling · Retrieval with Citations · Computer Vision · Prompt Engineering · Next.js · React · TypeScript · Tailwind CSS · Appointment Scheduling · Customer Support Automation · Home Services · Dashboard · Playwright · Full-Stack Development

## Screenshots and captions

1. `docs/screenshots/04-booked.png`
   **Booked while the owner was on another job.** The customer's chat on the left ends in a paid, confirmed visit; on the right the job is already on the technician's 2 PM slot and today's numbers have gone up.

2. `docs/screenshots/02-diagnosis.png`
   **A photo becomes a diagnosis and a quote.** Penny describes what she sees, how urgent it is and what to do right now, with a price range taken straight from the company's price book.

3. `docs/screenshots/06-emergency.png`
   **Safety first, then the team.** A gas smell gets clear instructions to leave and call 911, a red alert on the owner's dashboard, and an immediate callback.

4. `docs/screenshots/07-citations.png`
   **No made-up policies.** Every policy answer links to the exact sentence in the company's own documents, so customers and owners can trust what she says.

Optional extras: `docs/screenshots/05-xray.png` (every tool call, token and cent per conversation, for technical buyers), `docs/screenshots/09-takeover.png` (the owner stepping into a chat), `docs/screenshots/13-mobile-diagnosis.png` (mobile), and the walkthrough video `docs/demo.webm`.
