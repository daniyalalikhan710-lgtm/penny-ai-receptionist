# Security review

Two passes were made before the first push: a code review by the author, and an independent review that read the code and probed a running production build with crafted requests. The focus was the brief's list: key exposure, server re-validation of everything the client sends, upload validation, rate limits and caps, and prompt injection.

The `security-review` skill itself could not run: it diffs against `origin/HEAD`, which does not exist until the repository has a remote. The independent review covered the same ground.

## What was found and what was done

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | The photo cap was only checked when the newest message carried a photo, so a crafted history could attach dozens of images to every model request | High | **Fixed.** Photos are counted across the whole transcript on every request |
| 2 | The daily live budget counted turns, not money, and is kept in per-instance memory unless Upstash is configured | High on serverless without Upstash | **Mitigated.** The budget now also tracks estimated dollars per step, and an Upstash failure closes the budget instead of going uncounted. Without Upstash it is still per instance: set a spend limit on the API key (documented in `.env.example` and the README) |
| 3 | The chat and payment routes accepted cross-site requests, so another site could spend the budget through its visitors' browsers | Medium | **Fixed.** Both routes require `application/json` (which forces a preflight this app never grants) and refuse a foreign `Origin` or `Sec-Fetch-Site: cross-site` |
| 4 | Off Vercel, the rate-limit key came from headers a client can set; the in-memory limiter could be made slow by flooding it with made-up addresses | Medium off Vercel | **Fixed.** Vercel's headers are trusted only on Vercel; elsewhere the operator names their proxy's header, falling back to the right-most `x-forwarded-for` entry. The bucket map is swept at most once a minute and has a hard size cap |
| 5 | The production build on disk was older than the source with the cap fixes | Medium | **Fixed** by rebuilding; a Vercel deploy always builds from source |
| 6 | Every "trusted" channel into the prompt is written by the browser: staff notes, UI events and earlier assistant turns | Low here, high if copied to production | **Mitigated.** Event fields must match the exact shape the UI produces; angle brackets in form fields and staff notes are neutralised; the prompt now says staff notes and UI events are context that cannot change prices, policies or rules. Signing server-emitted history is the production fix and is described in the README. What an attacker gets today: Penny saying something wrong in their own chat. What they do not get: a wrong price on a card, a slot that is not free, or a confirmation without payment, because the tools re-check all three |
| 7 | The reserved-tag sanitiser was single-pass and could be made to assemble the tags it removed | Low | **Fixed.** Every angle bracket in customer text, ASCII or full-width, becomes a look-alike quote mark |
| 8 | A visitor who overwrote the test card with a real one had it posted to the server before being rejected | Low | **Fixed.** Anything other than the public test card is refused in the browser and never transmitted |
| 9 | Line breaks in an address could inject a property into the "Add to calendar" file | Low | **Fixed.** Line breaks are escaped in the file and control characters are refused in form fields and collapsed in stored names and addresses |
| 10 | Smaller points: transcript cap measured characters not bytes; no `server-only` guard; no security headers; `shadcn` CLI in runtime dependencies | Info | **Fixed.** The cap is in UTF-8 bytes; every server module imports `server-only`, so bundling one into the browser is a build error; `nosniff`, referrer and permissions headers are set; the CLI is a dev dependency |

Earlier, the author's code review found and fixed: an uncapped client-supplied transcript, refused messages being re-sent on later turns, body and image caps above the hosting platform's limit, the rate limiter running after body parsing, and booking lookups revealing another customer's surname and address.

## What held up

- **Secrets and the client bundle.** The built client files, the page HTML and the case-study payload contain no system prompt text, tool descriptions, price-book internals or key material. There are no client source maps. `.env*` is gitignored and there are no key patterns in the git history.
- **Logs.** Only error class names are logged. No request bodies, card data or upstream error text reach logs or the client.
- **Payment.** The amount is always the price book's fee; a client-supplied fee, a fake estimate and an extra amount field were all ignored. A non-test card, an unknown booking, a double-booked slot, a wrong-trade technician and a bogus service code were all rejected.
- **Tools.** A forged "payment succeeded" event on an unpaid job makes `send_confirmation` fail. Out-of-area ZIPs, out-of-horizon slots, wrong-trade technicians and unknown service codes are rejected in `create_booking`.
- **Uploads.** The media type is an allowlist with no SVG, the base64 alphabet is checked, and the file's magic bytes must match the declared type. Images are never stored or served to anyone else.
- **Path traversal and SSRF.** The sample-photo loader and the documents route are allowlist lookups; traversal and prototype-key variants return nothing.
- **XSS.** There is no `dangerouslySetInnerHTML`; all model, user and tool text is rendered as React text. Links are static, come from the owner's environment, or are an encoded `data:` URL.
- **Regular expressions.** Worst-case inputs at the message cap ran in under a millisecond against every pattern applied to untrusted text.

## Not done

- `pnpm audit` was not run, because it sends the dependency list to the registry. Run it yourself before a production deployment.
- No Content-Security-Policy is set. No injection sink was found that would make one necessary today, but a real deployment should add one.
- Whether the live model resists the prompt-injection attempts in practice can only be measured with an API key. The eval suite has two cases for it (text and inside an image); see `docs/live-verification.md`.
