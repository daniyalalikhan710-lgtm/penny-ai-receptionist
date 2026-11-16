# Known issues

Things that are true about this build and worth knowing. None blocks the demo.

## Not yet verified

The live engine was verified against the real Claude API on 2026-11-16 (see `docs/live-verification.md`). What that did not cover:

- **A deployed copy.** Everything was run locally (`pnpm dev`, `pnpm build`). The Vercel deployment, its environment variables and the 4.5 MB request limit have not been exercised on Vercel itself.
- **Upstash Redis.** The shared rate limit and daily budget are unit-tested against a stubbed store, not a real Upstash database.
- **Uploading your own photo by hand in live mode.** Uploaded images were tested live through the eval harness (two cases, same server path) and the upload control through the browser tests in replay mode, but nobody picked a file from a real phone camera roll against the live model.
- **Live behaviour varies from run to run.** The evals assert on tool calls and key facts, and passed in full on both models, but wording differs every time and a single passing run is not a guarantee. Re-run `pnpm eval` after any change to the prompt, the tools or the documents.

## Seen in live mode

- **The photo turn is the slow one.** On Claude Opus 5.5 the first words of a photo diagnosis took about 9 seconds to appear in the browser check; the chat shows "Looking at your photo…" meanwhile. The later steps of a booking (details form, holding the slot) took about 4 to 8 seconds each from tap to finished reply.
- **The screenshots and the video in this repo were captured in replay mode**, so their wording is the scripted wording. Live replies say the same things in different words.

## Sample photos

- **The sample photos show the equipment, not an active fault.** Unsplash had no free photo of, for example, a visibly leaking tank water heater or a thermostat showing an error code. Penny's replay diagnoses therefore describe only what is visible and say so when the photo shows nothing wrong (the AC and thermostat diagnoses are low and medium confidence on purpose).
- **The water heater photo is an outdoor heat-pump installation**, not a typical basement tank. It was the best free option. If you have a better photo, replace `public/samples/water-heater.jpg` and its `-thumb.jpg`, and update the description in `src/lib/server/engine/replay.ts` (`PHOTO_SCRIPTS`) and `CREDITS.md`.

## Raised by the fresh-eyes review and left as they are

- **There is no way to contact the builder from the demo.** "Built by Daniyal Ali Khan" is plain text and the case study ends without a hire button, because `NEXT_PUBLIC_HIRE_URL` is blank. Setting it adds "Hire me" to the banner and "Hire me to build yours" to the case study.
- **Two tabs do not sync.** Each tab keeps its own copy in memory and the last one to save wins. Use one tab; two-tab sync is on the roadmap.
- **In replay mode, anything outside the scripts gets a short "live AI is switched off" reply**, including an uploaded photo. The scripts cover the suggested prompts, all six sample photos and many common variations (prices, policies, hours, "I need a plumber", "talk to a person", cancel, reschedule), but a determined visitor will find the edge. This goes away with an API key.
- **X-ray shows zero tokens and $0.00 in replay mode.** That is accurate: no model is called. The caching and cost numbers appear in live mode.
- **Service names inside cards stay in English** when the conversation is in Spanish (they come from the price book); card labels and Penny's replies are in Spanish.

## By design, but worth knowing

- **The hire link is hidden.** `NEXT_PUBLIC_HIRE_URL` is blank in `.env.local`, so the banner shows "Built by Daniyal Ali Khan" with no link. Add the URL and rebuild to show "Hire me".
- **The sandbox lives in one browser tab's storage.** Opening the demo in a second tab shows the same saved state, but the two tabs do not sync live.
- **An uploaded photo is kept in memory only.** After a page reload its thumbnail remains, but the model is told the photo is no longer available.
- **The sandbox resets at midnight.** The calendar is laid out relative to today, so a sandbox seeded yesterday is replaced on the next visit.
- **Rate limiting is per server instance unless Upstash is configured.** On Vercel without the Upstash variables, each serverless instance counts separately.
- **In replay mode, uploaded photos and unscripted questions get the "live AI is switched off" reply.** That is the brief's design; the suggested prompts, sample photos and many common variations are scripted.
- **A booking code alone lets Penny look up, move or cancel that visit**, like a confirmation link would. It does not reveal the customer's surname or street address unless the booking was made in the same conversation.
