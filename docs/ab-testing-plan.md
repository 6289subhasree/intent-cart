# IntentCart experiment plan

Run functional acceptance checks before exposing an experiment. This document defines the next stage; it does not enable traffic splitting or collect analytics.

## Acceptance gate

- Two merchant accounts cannot access each other's catalogue, orders or audit details.
- An imported product can be recommended, approved and ordered at the saved price.
- Two carts competing for one unit produce only one successful reservation.
- Provider timeouts keep orders and stock locked; verified terminal outcomes resolve once.
- Recovery codes are single-use and reset invalidates old sessions.
- Check the landing, sign-in, shopping, catalogue and Orders screens on desktop and mobile.

## First experiment

Question: do category-specific example requests help merchants build their first valid cart?

- Control: the existing request box.
- Variant: the same request box with three clickable examples generated from the current store's categories. Example selection only fills the text box; building a cart still requires a click.
- Randomization unit: merchant account, assigned once and stored server-side. Keep assignment stable across sessions and devices. Exclude internal/test accounts before assignment.
- Exposure: record once when the assigned UI is actually shown. Do not count a route request as exposure.
- Primary metric: share of exposed merchants who create their first valid cart within 24 hours.
- Secondary metrics: no-match rate, time to first valid cart and checkout completion. Test-order completion is not paid conversion or revenue.
- Guardrails: provider error rate, latency, policy violations and cross-store leakage. Both variants use identical budgets, approval, stock and recovery rules.

Record experiment ID, merchant assignment, exposure time and outcome event IDs; deduplicate events on the server. Avoid raw request text, secrets or payment details in experiment events. Export aggregate results per variant. Implement event retention and owner access controls before collection.

First gather baseline traffic and conversion. Then choose the minimum useful uplift, sample size and fixed stopping rule before launching. A handful of local sessions can validate assignment and logging; it cannot establish a conversion winner. Use uncertainty intervals and report inconclusive results honestly. Do not repeatedly stop when a result first looks positive.

Needed implementation before launch: assignment persistence, exposure and conversion events, event deduplication, retention policy, an experiment flag, results view and assignment/attribution tests. No experiment is active in this release.
