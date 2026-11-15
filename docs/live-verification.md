# Live verification (Phase 6)

Everything in this repo was built and verified in **replay mode**, because no Anthropic API key was available at build time. The live engine is fully written and unit-tested against a stubbed SDK client, but it has not been run against the real API. This file is the hand-off for that step.

## Before you start

1. Create a dedicated API key at console.anthropic.com and set a spend limit on it (a few dollars is plenty).
2. Put it in `.env.local` as `ANTHROPIC_API_KEY=...`. Leave `ANTHROPIC_MODEL=claude-opus-5-5`, or set `claude-haiku-5-5` to spend less.
3. Never paste the key into a chat or commit it. `.env*` is gitignored.

## Prompt to paste into a new Claude Code session

Start the session in this project folder and paste everything in the block below.

```text
Read README.md, docs/live-verification.md and docs/decisions.md, then do the live verification of Penny (Phase 6 of the original brief). An ANTHROPIC_API_KEY is now set in .env.local. Never print, log or commit it.

Budget: keep total API spend under about $2. Run the evals first, since they are the cheapest way to find problems. Tell me the running total after each step.

1. Run `pnpm eval`. It runs 16 real conversations and asserts on which tools were called with which arguments. Fix any failure in the system prompt (src/lib/server/engine/prompt.ts), a tool description (src/lib/server/tools.ts) or the code, then re-run ALL cases so nothing regresses. Do not weaken an assertion to make a case pass unless the assertion itself is wrong; if you change one, say why. Stop and report if a failure survives three attempts.

2. Check the things replay mode could not exercise:
   - The request is accepted by the API as written: strict tool schemas, document blocks with citations, the cache breakpoint, `output_config.effort`, and `fallbacks: "default"` under the `server-side-fallback-2026-07-01` beta. If the API rejects any of it, fix it in src/lib/server/engine/live.ts and note what changed.
   - Prompt caching works: in dev the server logs one line per model step. From the second request on, `cache_read` should be several thousand tokens and `cache_write` small. If cache_read stays 0, find what is changing in the prefix.
   - Citations arrive and land after the claim they support, and the highlighted passage in the drawer matches.
   - Vision: every sample photo gets a sensible diagnosis that describes only what is visible; an uploaded non-repair photo is declined politely.
   - Then switch ANTHROPIC_MODEL to claude-haiku-5-5 and re-run `pnpm eval` once to confirm it also passes there (it has no server-side refusal fallback; the code already omits it).

3. Run `pnpm dev` and click through every golden path live in the browser at 1440px and 375px: the photo leak booking through payment and confirmation, the gas emergency and callback, the out-of-area ZIP, the Spanish AC request, the warranty question and its citation drawer, rescheduling CPL-4821, human takeover and hand-back, and "are you a real person?". Also try: a prompt injection, an off-topic question, and a message over 1,500 characters. Turn on X-ray and confirm tokens, cache reads, latency and cost show per step. Watch the console for errors.

4. Record the numbers: the eval pass rate and total cost that `pnpm eval` prints, and the cost of one full golden-path conversation from the X-ray panel's "conversation cost". Put them in README.md: replace the "Cost per conversation" paragraph and the `pnpm eval` (live) row in the Quality table with the measured figures, update the estimate on the case-study page (src/app/case-study/page.tsx), and remove the "has not yet been run against the real API" status note.

5. Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm eval:replay`, then scan the diff and the git history for anything that looks like a key, commit, and push.

Finish with a report that separates what you verified (and how), what you could not verify, known issues, the eval pass rate, and the measured cost per conversation.
```

## What to expect

- `pnpm eval` should cost cents on Opus 5.5 and a fraction of a cent on Haiku 5.5. It prints the total.
- The two cases that replay skips (`non-home-repair-photo`, `image-injection`) only run live.
- If the key is rejected or credits run out mid-demo, Penny answers in replay mode and shows a short notice rather than breaking. That is intended.

## Things most likely to need a small fix

These are the places where the code follows the SDK documentation but has not met the real API:

- **Beta parameters.** `fallbacks: "default"` with the `server-side-fallback-2026-07-01` beta on `client.beta.messages.stream`. If the API returns a 400 naming this, check the current fallback docs.
- **Strict schemas.** Tool schemas are generated from zod with `z.toJSONSchema`. If the API rejects a schema keyword, adjust `tidySchema` in `src/lib/server/tools.ts`.
- **Tool choice in practice.** Whether the model reliably calls `update_lead` alongside other tools, and `flag_emergency` before anything else, is a prompt question the evals answer.
- **Reply style.** Length and tone at `low` effort. If replies run long, tighten the "How you sound" section of the prompt rather than raising effort.
