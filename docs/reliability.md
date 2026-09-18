# Reliability model

IntentCart treats checkout as a state transition with external uncertainty, not as a single payment request.

## State and versioning

A shopping session owns an authoritative cart version. Cart writes compare the version before replacing state, so stale browser state cannot silently overwrite a newer cart.

The checkout request contains:

`sessionId + cartVersion + approval`

The amount is deliberately absent. The server reloads the session and calculates the total from the current catalogue.

## Checkout claim

Before an external provider call, the server claims the checkout atomically. This gives concurrent requests one owner and prevents two requests from creating two orders for one session.

The claim is tied to the cart version and persisted state.

## Idempotency

The provider request uses an idempotency key derived from the saved checkout state. Repeating a completed checkout can return the persisted result rather than creating a second order.

## Inventory conflicts

Inventory is checked again when the cart is changed and during checkout. A conflict can block the saved cart or trigger a constrained repair path.

A repair must still pass the same catalogue and policy checks; a replacement is not allowed merely because it is available.

## Uncertain provider outcomes

A timeout or malformed provider response is not treated as a safe retry.

When the external outcome cannot be established, the session is locked for review and the reservation is retained. Reconciliation establishes a terminal outcome before stock is released or a recovered order is recorded.

This avoids the dangerous sequence:

`provider succeeded → local request timed out → blind retry → duplicate order`

## What the tests prove

The repository has controlled tests for:

- concurrent checkout requests
- stale cart writes
- inventory races
- provider timeout
- provider amount mismatch
- persistence failure after provider success
- duplicate recovery requests
- late checkout completion
- transaction races

See `tests/checkout-concurrency.test.mjs` and `tests/order-recovery.test.mjs`.

## Failure-handling invariant

> Unknown outcome means review, not retry.

That rule is the core reliability boundary of the prototype.
