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
