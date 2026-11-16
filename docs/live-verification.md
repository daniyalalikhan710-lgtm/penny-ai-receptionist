# Live verification (Phase 6)

Penny was built and verified in replay mode first, because no API key was available. This file records the check against the real Claude API, done on **16 November 2026**, and how to repeat it.

## Result

| | Claude Opus 5.5 | Claude Haiku 5.5 |
|---|---|---|
| `pnpm eval` | 16 of 16 cases, 74 of 74 checks | 16 of 16 cases, 74 of 74 checks |
| Cost of the whole suite | $0.4142 | $0.0150 |
| One photo-to-paid-booking conversation (eval `golden-path`) | $0.1135 | $0.0055 |
| The same conversation clicked through in the browser (X-ray "conversation cost") | $0.109 | not run in the browser |

Both suites: all passed. Costs are the token counts the API reported multiplied by the prices in `src/lib/server/engine/cost.ts`; they are not taken from an invoice.

| Case | Opus 5.5 | Cost | Haiku 5.5 | Cost |
|---|---|---|---|---|
| `golden-path` | pass 17/17 | $0.1135 | pass 17/17 | $0.0055 |
| `emergency-gas` | pass 6/6 | $0.0206 | pass 6/6 | $0.0006 |
| `out-of-area-zip` | pass 3/3 | $0.0145 | pass 3/3 | $0.0005 |
| `non-home-repair-photo` | pass 3/3 | $0.0263 | pass 3/3 | $0.0010 |
| `spanish-request` | pass 5/5 | $0.0252 | pass 5/5 | $0.0008 |
| `reschedule` | pass 6/6 | $0.0526 | pass 6/6 | $0.0013 |
| `warranty-citation` | pass 3/3 | $0.0104 | pass 3/3 | $0.0005 |
| `price-question` | pass 4/4 | $0.0184 | pass 4/4 | $0.0006 |
| `prompt-injection` | pass 4/4 | $0.0097 | pass 4/4 | $0.0002 |
| `image-injection` | pass 4/4 | $0.0444 | pass 4/4 | $0.0013 |
| `are-you-human` | pass 2/2 | $0.0102 | pass 2/2 | $0.0004 |
| `off-topic` | pass 4/4 | $0.0090 | pass 4/4 | $0.0002 |
| `huge-message` | pass 3/3 | $0.0000 | pass 3/3 | $0.0000 |
| `rapid-fire-spam` | pass 3/3 | $0.0000 | pass 3/3 | $0.0000 |
| `cancel-needs-confirmation` | pass 4/4 | $0.0367 | pass 4/4 | $0.0014 |
| `handback-after-takeover` | pass 3/3 | $0.0226 | pass 3/3 | $0.0007 |

## What was checked, and how

- **The request is accepted as written.** Strict tool schemas, document blocks with citations, the cache breakpoint, `output_config.effort` and `fallbacks: "default"` under the `server-side-fallback-2026-07-01` beta all went through unchanged. Haiku 5.5 runs without the fallback, as coded.
- **Prompt caching.** `evals/usage.ts` prints what the API reports per step. The shared prefix (tools, instructions, documents) is about 14,000 tokens; it is read from the cache on every step and by a brand-new conversation (`cache_read` 14,017, `cache_write` about 40). In the browser golden path 95% of input tokens were cache reads.
- **Citations.** The usage probe compares every cited span with the document text at the reported offsets: exact match each time. In the browser the drawer opened on the cited passage with the same span highlighted.
- **Vision.** The sample water-heater photo, a non-repair photo and a photo with instructions written inside it (the last two through the eval suite).
- **Clicked through live in the browser on Opus 5.5 at 1440px:** the photo leak booking through payment and confirmation (job on the dispatch board, KPIs updated, lead marked Booked), gas emergency and callback, out-of-area ZIP, the Spanish AC request, the warranty question and its citation drawer, rescheduling CPL-4821, takeover and hand-back, "are you a real person?", a prompt injection, an off-topic question and a message over 1,500 characters. At 375px: the over-length message, a faucet booking request up to the slot picker, and the owner view, with no horizontal overflow. No console errors in either.

## What had to change

1. **Keys that are not scoped to a workspace.** The first key was rejected with "this request must include the anthropic-workspace-id header". `ANTHROPIC_WORKSPACE_ID` now supplies it; a workspace-scoped key needs nothing.
2. **A rejected key no longer looks like a pass.** A live eval that fell back to replay is reported as an error, and the API's own error text goes to the server log (never to the browser).
3. **One round trip saved per turn.** When the reply is written alongside only the inbox note (`update_lead`), the turn ends there instead of asking the model to speak again.
4. **Prompt wording.** Penny asked diagnostic questions before offering a time; she is now told she is the front desk, not the diagnostician. She wrote working notes before tool calls ("Tomorrow is 2026-11-17."); she is now told that everything she writes is shown to the customer.
5. **Citations were not reliable on their own.** In a probe of 8 policy answers the model left the citation off 3 times, and stronger wording did not change that. `src/lib/server/grounding.ts` now matches an uncited question-and-answer reply to the documents itself and links the passage (or nothing, if it is not confident). After the change, 8 of 8 probe answers carried source links, 3 of them from the safety net, each pointing at the right passage. X-ray labels them "matched by the server".
6. **Small things seen in the browser.** The citation chip now follows the sentence's full stop; the typing indicator says "Looking at your photo…" during the slow photo turn; one eval assertion that only accepted one phrasing of a correct refusal was widened.

## Not covered

- A deployed copy on Vercel, and Upstash Redis for the shared rate limit and budget.
- Uploading a photo by hand in the browser in live mode (uploads were tested live through the eval suite).
- The browser click-through on Haiku 5.5 (the eval suite passed on it).
- The citation safety net in languages other than English (it only matches English; other languages rely on the model's own citations).

## Repeating it

1. Create an API key inside a workspace at console.anthropic.com and set a spend limit on it. A full pass (both suites and one booking in the browser) costs well under a dollar. The whole verification, including every re-run while fixing things, came to roughly $5 to $6 by a running tally of the per-turn figures; the console has the exact amount.
2. Put it in `.env.local` as `ANTHROPIC_API_KEY=...`. Never paste it into a chat or commit it; `.env*` is gitignored.
3. `pnpm eval` (Opus 5.5 by default), then `ANTHROPIC_MODEL=claude-haiku-5-5 pnpm eval`. Each writes `evals/results/latest-live.json`.
4. `pnpm tsx --conditions=react-server evals/usage.ts` prints tokens, cache reads and citations step by step. Run it after changing the prompt, the tools or the documents: a `cache_read` of zero means something in the shared prefix now changes between requests.
5. `pnpm dev`, turn on X-ray, and click through the suggested prompts.

If the key is rejected or the daily budget runs out mid-demo, Penny answers in replay mode and shows a short notice rather than breaking. That is intended.
