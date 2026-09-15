# IntentCart first-cart experiment

Implementation is available and disabled by default. Experiment ID: `category-examples-v1`. This is an owner-workspace onboarding experiment, not a public-shopper conversion test.

## Local setup

1. Pull the latest code and run `npm run dev` to apply the migration.
2. In `.env.local`, set `INTENTCART_AB_ADMIN_USERS` to your existing account's username to allow aggregate results access.
3. Set `INTENTCART_AB_ENABLED=true` only when ready for a local smoke test, then restart the server.
4. Create fresh merchant accounts with no prior carts. Open Shop with AI. Assignment is random and persistent: A sees the request box, B also sees up to three category examples. Multiple fresh accounts may be needed to observe both groups.
5. Refresh or open another tab: the account must keep its assignment.
6. Build a valid cart and complete a test checkout. The Experiments page shows assignments/exposures immediately; conversion counts/rates enter the comparison only after the merchant's full 24-hour window has finished.
7. Set the flag back to false after testing. Add all test usernames to `INTENTCART_AB_EXCLUDED_USERS` before starting a separate real study.

All three configuration variables are server-only. Excluded usernames are comma separated. Set exclusions before enrollment: changing the exclusion list stops future enrollment/tracking but does not erase previously recorded data. Keep local smoke-test data separate from any hosted study.

## Assignment, exposure and attribution

Only merchants with no shopping sessions are enrolled. A single database row per merchant fixes random assignment across devices and tabs; the unique key resolves concurrent requests. GET assignment does not count exposure. The browser records exposure after the assigned request area intersects the viewport in a visible tab. An authenticated, origin-checked POST stores the first exposure timestamp once. Tracking failures do not block shopping; missed exposures are not fabricated later.

A successful first cart is attributed on the server in the same transaction that saves it, provided exposure preceded it and it falls within 24 hours. Later carts cannot replace the first-cart outcome. Order creation for that same cart is attributed once, within the same 24-hour window, in the order transaction. Failed/no-match requests are not conversions. Both groups use identical price, inventory, approval and recovery rules.

## Results and limits

Only usernames explicitly listed in `INTENTCART_AB_ADMIN_USERS` can read cross-store aggregates at Merchant → Experiments. No merchant identifiers, shopping text or API credentials appear in the results response. The page shows assignments, exposures, completed observation windows, first-cart conversion and first-cart order creation. Order creation is not payment or revenue.

No winner, significance or sample-size claim is generated. Choose baseline, minimum useful uplift, sample size and stopping rule before collecting study data. A few local accounts test wiring only. No-match rates, latency comparisons, exports and uncertainty intervals are not implemented in this first version.

## Retention and operation

The experiment table stores merchant ID, variant, assignment/exposure/outcome timestamps and the first converted session ID. It stores no raw shopping text or payment credentials. Rows currently persist until explicit database maintenance; there is no automatic retention job. For a real study, choose a retention period (suggested maximum 90 days), stop enrollment/tracking at the study end, export only approved aggregate results and delete experiment rows under an operator-reviewed maintenance procedure. Do not re-enable this experiment after clearing its rows: a new study needs a new version/table strategy to prevent re-enrollment and mixed results.

Turning `INTENTCART_AB_ENABLED=false` stops enrollment, exposure and outcome tracking; stored results remain readable by configured administrators. Pausing during observation can lose outcomes, so treat interrupted runs as invalid rather than silently interpreting them.

## Validation

Automated tests cover disabled-by-default behavior, concurrent stable assignment, exposure deduplication, rejected client-supplied variants, origin checks, server-side first-cart/order attribution, retry deduplication, completed observation windows, restricted aggregate access, exclusions and refusal to enroll existing cart builders.

Before a real launch, also inspect both variants on desktop/mobile, verify actual browser exposure behavior, and complete the remaining operational/statistical requirements above.
