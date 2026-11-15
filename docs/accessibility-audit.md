# Accessibility audit: customer view and owner dashboard

**Standard:** WCAG 2.1 AA · **Method:** axe-core scan of 13 screens and states (`pnpm a11y`), a keyboard-only walk-through, and a manual review against the checklist below. Not tested with a screen reader by a human; see "Not verified".

## Summary

Issues found: 9 · Fixed: 9 · Open: 0 in automated checks.

## Findings (all fixed)

| # | Issue | Criterion | Severity | Fix |
|---|---|---|---|---|
| 1 | White initials on Marcus's copper avatar: 3.79:1 | 1.4.3 Contrast | Major | Avatar colour darkened to `#9A5B22` (5.3:1) |
| 2 | Finished jobs on the dispatch board were dimmed with opacity, dropping their text to about 3:1 | 1.4.3 Contrast | Major | Dimmed with a flat background instead; text keeps full contrast |
| 3 | Job cards had an `aria-label` that did not contain their visible text | 2.5.3 Label in Name | Major | Label removed; extra context added as visually hidden text |
| 4 | Citation chips had an `aria-label` that did not contain their visible text | 2.5.3 Label in Name | Major | Label now starts with the visible text |
| 5 | The demo banner sat outside any landmark | 1.3.1 Info and Relationships | Minor | Banner is now an `aside` landmark |
| 6 | Scrollable lists with no focusable content (messages log, document drawer) could not be scrolled by keyboard | 2.1.1 Keyboard | Major | Regions are focusable and labelled |
| 7 | X-ray panel skipped a heading level | 1.3.1 Info and Relationships | Minor | Headings step by one |
| 8 | View switcher and day picker used `role="tab"` without tab panels or arrow keys | 4.1.2 Name, Role, Value | Minor | Now a group of toggle buttons with `aria-pressed` |
| 9 | Closing the citation drawer or job dialog dropped focus to the page | 2.4.3 Focus Order | Minor | Focus returns to the chip or job card that opened it |

## Checked and passing

- **Keyboard:** every control is reachable in a logical order and shows a visible copper focus ring. The golden path was completed with keyboard only (chip with Enter, slot with Space, details form with Enter). Escape closes the drawer and dialog.
- **Forms:** every input has a visible label; errors are announced with `role="alert"` and say what is wrong. Name, phone, email, address and ZIP carry `autocomplete` values. The demo card fields deliberately turn autocomplete off so a browser never offers a real saved card.
- **Live updates:** streamed replies are announced once, when finished, through a single polite live region rather than token by token. The emergency card is `role="alert"`.
- **Images:** sample photos and thumbnails have descriptive alt text; decorative icons are hidden from assistive technology.
- **Colour:** urgency is always paired with a text label, never colour alone. Body text on cream, ink and white backgrounds is 4.5:1 or better.
- **Motion:** all animation is decorative and is switched off under `prefers-reduced-motion`; the flying job card is skipped entirely.
- **Reflow:** at 200% zoom on a 1440px window the layout switches to the tabbed mobile layout with no horizontal page scroll.
- **Target size:** interactive targets are at least 24 by 24 CSS pixels; primary actions are 40 pixels or taller.

## Not verified

- No testing with VoiceOver, NVDA or JAWS by a human. The semantics are in place, but a real screen-reader pass would likely find wording improvements.
- The dispatch board uses ARIA table roles on a CSS grid; it has not been checked in every browser and screen-reader pairing.
