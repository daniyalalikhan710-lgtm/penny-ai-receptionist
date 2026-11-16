# Decisions

One line each, with the reason. Made while building unattended (brief §0).

- **Open 7 days, 8 AM–6 PM, two-hour arrival windows.** A demo that is "closed" when a visitor arrives on a Sunday would look broken; the after-hours surcharge still exists for evenings.
- **Sandbox state lives in the browser and is sent with each request.** No database (brief §2). The server validates it with zod and re-checks every price and slot against its own price book and availability logic, so a tampered client cannot get a different price or a taken slot.
- **Price book is server-only; seed data repeats historical estimate ranges.** A unit test asserts the seed still matches the price book, so the price book stays the single source of truth.
- **The pricing document is generated from the price book.** Prices Claude cites and prices the tools return cannot drift apart.
- **Documents are plain text, not markdown-rendered.** Citation character offsets then index straight into what the citation drawer shows, so the highlight is exact.
- **Stream format is newline-delimited JSON over fetch, not SSE.** POST bodies carry the transcript; NDJSON is simpler to parse and test than EventSource (which is GET-only).
- **Manual streaming tool loop instead of the SDK tool runner.** The loop needs to emit custom events (cards, state patches, per-step usage) between model steps, which the runner does not expose as cleanly.
- **`strict: true` tools without `eager_input_streaming`.** Tool inputs are a few dozen tokens, so buffering costs nothing, and strict server-side validation is kept. Every input is still validated with zod before a tool runs.
- **Documents sit in the first user message with one explicit cache breakpoint, plus automatic caching for the tail.** Tools + system prompt + documents are identical for every visitor, so the cache is shared across conversations.
- **Thinking blocks are not replayed across turns.** The server is stateless and rebuilds history from the transcript; dropping all earlier thinking blocks is allowed and keeps requests append-only. Within a turn's tool loop they are passed back unchanged.
- **Effort is fixed per deployment (default `low`).** Raising it only for the photo turn would invalidate the cached message prefix (the documents) on every switch and cost more than it saves.
- **Refusal fallbacks use `fallbacks: "default"` on models that support them** (not Haiku 5.5, which has no server-side fallback). A refusal that still comes back becomes a polite message.
- **Uploaded photos are kept in memory only; a small thumbnail is persisted.** localStorage is too small for full images. After a reload the model is told the photo is no longer available.
- **Booking codes are sequential (CPL-4822, …).** Reads like a real system and keeps tests deterministic.
- **Only the 4242 test card is accepted and nothing about the card is stored.** Prevents anyone typing a real card into a demo.
- **Replay covers more than the suggested prompts** (prices, policies, hours, financing, membership, cancel, "talk to a human"). Visitors type their own variations; a wider script set makes the no-key demo feel alive while still answering only from tools and documents.
- **A global daily cap on live turns falls back to replay.** Protects the owner's API bill if the demo link gets shared widely.
- **Sample photos show the equipment, not active faults.** Unsplash had no free photo of e.g. a visibly leaking tank. Penny's scripted diagnoses describe only what is actually visible and state lower confidence where the photo shows nothing wrong.
- **Demo ZIP codes 97401–97412 are paired with fictional towns.** Labelled as demo data in the UI.
- **Hire link hidden.** `NEXT_PUBLIC_HIRE_URL` is blank in `.env.local`, so the banner shows "Built by …" without a link (brief §4).
- **A booking code alone can look up, move or cancel a visit, but does not reveal a surname or street address.** Codes are sequential, so a code-only lookup shows the first name and "Address on file" unless the booking was made in the same conversation. Found in code review.
- **The whole client-supplied transcript is capped, not just the newest message** (`PENNY_MAX_TRANSCRIPT_CHARS`, default 60,000 characters). The history comes from the browser and all of it reaches the model, so an uncapped history would be a way to run up the API bill. Found in code review.
- **Body cap 4.3 MB, image cap 900 KB.** Three photos at the cap plus the transcript stay under Vercel's 4.5 MB function payload limit; the browser steps JPEG quality down until a photo fits.
- **Reset demo aborts the turn in flight** and anything it still delivers is ignored, so a stale reply cannot write into the fresh sandbox.
- **A reload mid-turn re-runs the unanswered message.** Tools are idempotent (a held slot is reused, confirmations are de-duplicated by id), so re-running is safe.
- **View switcher and day picker are toggle buttons, not ARIA tabs.** They have no tab panels and no arrow-key model, so `aria-pressed` describes them honestly.
- **The `security-review` skill could not run before the first push** (it diffs against `origin/HEAD`, which does not exist until the repo has a remote). An independent reviewer audited the same checklist instead; its findings are recorded with the fixes in the commit history.
- **No guided tour.** The first suggested prompt is marked "Start here" and each pane is labelled; a modal tour would sit between the visitor and the one thing they should click. Listed under Roadmap.

## Made during live verification (2026-11-16)

- **A reply written alongside only the inbox note ends the turn.** `update_lead` is a background note the customer never waits on. Sending its result back to the model cost a second round trip and tempted it to repeat itself, so the loop stops there; the note's result is replayed in the next turn's history.
- **`ANTHROPIC_WORKSPACE_ID` is supported.** A key that is not scoped to one workspace is rejected by the API unless the request names the workspace; the variable adds that header. Workspace-scoped keys do not need it.
- **A live eval that silently fell back to replay counts as an error.** Otherwise a rejected key would report 16 of 16 without calling the model once.
- **The prompt tells Penny she is the front desk, not the diagnostician.** Left alone, the model asked follow-up questions about symptoms before offering a time. Naming the equipment and wanting it fixed is enough to show an estimate and open slots.
- **The prompt says everything written before a tool call is shown to the customer.** The model otherwise wrote working notes there ("Tomorrow is 2026-11-17.").
- **A server-side safety net for citations (`src/lib/server/grounding.ts`).** The model sometimes gives a correct policy answer and leaves the citation off: 3 of 8 policy answers in one probe, and stronger prompt wording did not change that. When a question-and-answer reply arrives with no citations, the server matches each sentence to the document sentence it rests on and links it. It is word matching with rare words weighted up, it refuses a match when the reply contains a figure the document sentence does not, and it links nothing below a threshold set from real replies. It is skipped in booking turns (the cards carry the facts there), it only understands English, and X-ray labels its links "matched by the server". Chosen over a second model call because it is free, instant and deterministic.
- **A citation chip follows the sentence's closing punctuation.** The API often places a citation just before the full stop; the chat moves the punctuation in front of the chip.
- **The typing indicator says "Looking at your photo…" on a photo turn.** That turn takes several seconds before the first word arrives.

