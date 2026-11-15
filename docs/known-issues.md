# Known issues

Things that are true about this build and worth knowing. None blocks the demo.

## Not yet verified

- **The live engine has not been run against the real Claude API.** No API key was available at build time. It type-checks and passes unit tests against a stubbed SDK client, and the request shape follows the SDK documentation, but the first real call may need a small fix. See `docs/live-verification.md`.
- **Cost per conversation is an estimate, not a measurement**, for the same reason.

## Sample photos

- **The sample photos show the equipment, not an active fault.** Unsplash had no free photo of, for example, a visibly leaking tank water heater or a thermostat showing an error code. Penny's replay diagnoses therefore describe only what is visible and say so when the photo shows nothing wrong (the AC and thermostat diagnoses are low and medium confidence on purpose).
- **The water heater photo is an outdoor heat-pump installation**, not a typical basement tank. It was the best free option. If you have a better photo, replace `public/samples/water-heater.jpg` and its `-thumb.jpg`, and update the description in `src/lib/server/engine/replay.ts` (`PHOTO_SCRIPTS`) and `CREDITS.md`.

## By design, but worth knowing

- **The hire link is hidden.** `NEXT_PUBLIC_HIRE_URL` is blank in `.env.local`, so the banner shows "Built by Daniyal Ali Khan" with no link. Add the URL and rebuild to show "Hire me".
- **The sandbox lives in one browser tab's storage.** Opening the demo in a second tab shows the same saved state, but the two tabs do not sync live.
- **An uploaded photo is kept in memory only.** After a page reload its thumbnail remains, but the model is told the photo is no longer available.
- **The sandbox resets at midnight.** The calendar is laid out relative to today, so a sandbox seeded yesterday is replaced on the next visit.
- **Rate limiting is per server instance unless Upstash is configured.** On Vercel without the Upstash variables, each serverless instance counts separately.
- **In replay mode, uploaded photos and unscripted questions get the "live AI is switched off" reply.** That is the brief's design; the suggested prompts, sample photos and many common variations are scripted.
- **A booking code alone lets Penny look up, move or cancel that visit**, like a confirmation link would. It does not reveal the customer's surname or street address unless the booking was made in the same conversation.
