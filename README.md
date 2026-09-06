# IntentCart

IntentCart is a prototype shopping agent that turns a plain-language request into a cart the buyer can understand, edit and approve.

I built it around a simple question: instead of making someone search for products one by one, can a shopping interface start with the outcome they want?

For example:

> Build a skincare gift for my sister under ₹2,000. She has sensitive skin, and I need it delivered by Friday.

IntentCart reads a structured catalogue, recommends a bundle, explains why each item was selected and checks the cart against the buyer's limits. It cannot complete checkout until the buyer approves the exact amount.

## Live demo

| Page | What it shows |
| --- | --- |
| [Landing page](https://intent-cart.subhasree6289.chatgpt.site/) | Product overview and the main idea |
| [Shopping demo](https://intent-cart.subhasree6289.chatgpt.site/demo) | Intent input, recommendations, cart controls and checkout |
| [Merchant dashboard](https://intent-cart.subhasree6289.chatgpt.site/merchant) | Example conversion, order-value and policy metrics |
| [Audit trail](https://intent-cart.subhasree6289.chatgpt.site/audit) | A readable trace of one complete shopping session |

Checkout runs entirely in test mode. It creates a simulated order and never charges real money.

## What the prototype does

- Accepts a natural-language shopping request.
- Selects only products that exist in the supplied catalogue.
- Recomputes the total on the server instead of trusting a model-generated total.
- Rejects recommendations above the ₹2,000 demo budget.
- Explains why products were selected and why an alternative was rejected.
- Lets the buyer change quantities before approval.
- Blocks checkout when stock changes or the cart exceeds the budget.
- Requires explicit approval of the current cart and amount.
- Creates an idempotency key from the cart version and approved amount.
- Falls back to a deterministic recommendation when an AI key is missing or the model response is unusable.

## Architecture

The model is used for recommendation, not authorization. Every decision that can allow or block checkout is handled by normal application code.

```mermaid
flowchart TD
    U["Buyer describes a need"] --> D["Shopping demo /demo"]
    D --> A["POST /api/agent"]

    subgraph Recommendation["Recommendation service"]
        A --> V["Validate intent with Zod"]
        V -->|Invalid| R400["Return 400"]
        V -->|Valid| C["Load structured catalogue"]
        C --> K{"OpenAI key available?"}
        K -->|No| F["Deterministic fallback"]
        K -->|Yes| L["Request catalogue-bound recommendation"]
        L --> P["Parse candidate JSON"]
        P --> G{"Known product IDs and total ≤ ₹2,000?"}
        G -->|No| F
        G -->|Yes| N["Return normalized recommendation"]
        F --> N
    end

    N --> UI["Render cart, reasons and policy state"]
    UI --> E["Buyer edits quantities"]
    E --> B{"Budget, stock and delivery valid?"}
    B -->|No| X["Block checkout or repair cart"]
    X --> UI
    B -->|Yes| H["Show exact cart for approval"]
    H -->|Cancel| UI
    H -->|Approve| O["POST /api/checkout"]

    subgraph Checkout["Bounded checkout service"]
        O --> Z["Validate amount, approval and cart version"]
        Z --> Q{"Amount ≤ ₹2,000 and approval is true?"}
        Q -->|No| S400["Return blocked response"]
        Q -->|Yes| I["Create idempotency key"]
        I --> T["Create simulated test order"]
    end

    T --> S["Show success state"]
    UI -.-> AT["Audit view /audit"]
    UI -.-> MD["Merchant view /merchant"]
```

### Why the flow is split this way

The recommendation route is allowed to suggest products, but its output is treated as untrusted. The server checks every product ID against the catalogue and calculates the total again before returning the result.

The checkout route has a separate validation boundary. It accepts only:

- a positive integer amount in paise;
- an amount no greater than ₹2,000;
- an explicit `approval: true`; and
- a non-empty cart version.

This means a model response by itself can never create an order.

## Request lifecycle

1. The buyer writes a request in the shopping interface.
2. `POST /api/agent` validates that the intent is between 8 and 500 characters.
3. The route sends the request and catalogue to the configured model, if a key is available.
4. The returned product IDs are checked against the local catalogue.
5. Prices are looked up from the catalogue and the total is recalculated server-side.
6. Invalid output, an unavailable provider or a budget violation triggers the deterministic fallback.
7. The buyer reviews the cart, changes quantities if needed and sees the remaining budget.
8. Checkout stays disabled if the budget or inventory checks fail.
9. After explicit approval, `POST /api/checkout` validates the amount and cart version again.
10. The server returns a simulated order with an idempotency key and audit flags.

## Failure handling

The demo includes a **Simulate inventory conflict** action. It makes the selected serum unavailable immediately before checkout.

When that happens:

1. checkout is paused;
2. the interface explains which constraint failed;
3. the unavailable item is replaced with an in-stock alternative;
4. the budget and delivery promise are checked again; and
5. the buyer has to review the repaired cart before continuing.

This repair is currently implemented as a client-side demonstration. A production version would receive stock changes from a live inventory service and persist every state transition.

## API reference

### `POST /api/agent`

Request:

```json
{
  "intent": "Build a skincare gift under ₹2,000 for sensitive skin."
}
```

Important response fields:

```json
{
  "cart": ["sku_cleanser_01", "sku_serum_04", "sku_spf_07"],
  "total": 189700,
  "currency": "INR",
  "fitScore": 0.96,
  "reasons": {
    "sku_cleanser_01": "Fragrance-free and suited to sensitive skin"
  },
  "policy": {
    "withinBudget": true,
    "stockValid": true,
    "deliveryValid": true,
    "approvalRequired": true
  },
  "mode": "ai"
}
```

`mode` is `deterministic_fallback` when the AI provider is not configured or its response fails validation.

### `POST /api/checkout`

Request:

```json
{
  "amount": 189700,
  "approval": true,
  "cartVersion": "IC-2048"
}
```

The amount is expressed in paise. A valid request returns a simulated order:

```json
{
  "id": "order_demo_abc123",
  "amount": 189700,
  "currency": "INR",
  "status": "created",
  "mode": "safe_test_checkout",
  "idempotencyKey": "intentcart-IC-2048-189700"
}
```

## Frontend surfaces

### Landing page

Introduces the intent-first shopping model and links to the working demo, merchant view and audit trail.

### Shopping demo

Contains the main interactive flow: intent input, recommendation mode, product reasoning, quantity controls, budget progress, inventory failure handling and an approval dialog.

The current product cards are seeded for a repeatable demo. Calling the agent route updates the recommendation mode shown by the interface; wiring arbitrary API results into the visual cart is a planned extension.

### Merchant dashboard

Shows how an intent-led flow could be evaluated from a merchant's side: conversion, average order value, order mix and policy compliance. The displayed values come from the included synthetic evaluation, not production analytics.

### Audit trail

Shows the sequence of recommendation, policy, approval, failure and order events for the demo session. It is currently a fixed trace designed to make the decision boundary easy to inspect.

## Project structure

```text
app/
├── api/
│   ├── agent/route.ts       # recommendation, catalogue checks and fallback
│   └── checkout/route.ts    # approval and amount validation
├── audit/page.tsx           # readable decision trace
├── demo/page.tsx            # interactive buyer experience
├── merchant/page.tsx        # merchant metrics
├── page.tsx                 # landing page
└── globals.css
components/ui/               # reusable interface primitives
evaluation/summary.json      # synthetic evaluation result
scripts/evaluate.mjs         # verifies the evaluation fixture
tests/                       # guardrail, rendering and UI tests
worker/index.ts              # Cloudflare Worker entry point
```

## Running locally

Requirements:

- Node.js 22.13 or newer
- npm

```bash
git clone https://github.com/6289subhasree/intent-cart.git
cd intent-cart
npm ci
cp .env.example .env.local
npm run dev
```

The app works without any API key. To enable the model-backed recommendation path, add:

```env
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5-mini
```

Do not commit `.env.local`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run build` | Create the Worker-compatible production build |
| `npm test` | Build the app and run all automated tests |
| `npm run evaluate` | Validate and print the evaluation fixture |

## Tests

The current suite checks:

- checkout requests above the approved budget are rejected;
- checkout cannot proceed without explicit approval;
- the main landing page renders from the production Worker;
- shared UI components preserve required semantics; and
- generated CSS contains the utilities used by the interface.

## Evaluation

The repository includes a deterministic fixture representing 500 synthetic shopping sessions.

| Metric | Catalogue baseline | IntentCart |
| --- | ---: | ---: |
| Converted sessions | 195 / 500 | 243 / 500 |
| Conversion rate | 39.0% | 48.6% |
| Average order value | ₹1,646 | ₹1,946 |
| Injected failures handled | — | 25 / 25 |
| Blocked policy actions executed | — | 0 |

The calculated lift is 24.62% for converted sessions and 18.23% for average order value.

These numbers are not real customer results. They are controlled fixture values used to demonstrate how the product could be measured and to verify that failure and policy metrics are reported consistently.

## Technology

- React 19 and TypeScript
- Vinext and Vite
- Zod for request validation
- Tailwind CSS and Shadcn UI primitives
- Recharts for merchant visualizations
- OpenAI Responses API for optional recommendations
- Cloudflare Workers-compatible server output

## Known limitations

- The catalogue contains four fictional skincare products.
- The visual cart is seeded rather than populated from arbitrary model output.
- Checkout creates a simulated order only.
- Inventory repair, merchant metrics and the audit trace are demo data.
- There is no authentication, persistent cart storage or live inventory connection.
- The evaluation is synthetic and cannot be treated as evidence of real conversion lift.
