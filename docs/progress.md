# Progress

Current phase: **all phases complete.** Phase 6 (live verification) was done on 2026-11-16.

- [x] Phase 0: scaffold, domain model, seed data, price book, documents, sample photos
- [x] Phase 1: chat core, tools, both engines, widget, cards
- [x] Phase 2: diagnosis → booking → checkout → confirmation, lookup and reschedule
- [x] Phase 3: owner dashboard, emergency triage, human takeover
- [x] Phase 4: X-ray, multilingual, chips, view switcher, mobile pass, case-study page
- [x] Phase 5: code review, security review, accessibility audit, fresh-eyes review, README, screenshots, video, push
- [x] Phase 6: live verification against the real Claude API (2026-11-16). Results and what changed are in `docs/live-verification.md`.

Next step for whoever picks this up: deploy to Vercel with `ANTHROPIC_API_KEY` set and a hard spend limit on the key (see "Deploy to Vercel" in the README), and set `NEXT_PUBLIC_HIRE_URL` so the "Hire me" link appears.
