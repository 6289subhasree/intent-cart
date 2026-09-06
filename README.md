# IntentCart

IntentCart is my attempt at making online shopping feel less like opening twenty tabs.

Instead of searching product by product, you can describe what you need in plain English:

> Build a skincare gift for my sister under ₹2,000. She has sensitive skin and I need it by Friday.

The agent checks the catalogue, puts together a cart, explains why each item fits and stops before checkout so the buyer can review the exact amount.

## Try it

- [Open IntentCart](https://intent-cart.subhasree6289.chatgpt.site/)
- [Shopping demo](https://intent-cart.subhasree6289.chatgpt.site/demo)
- [Merchant dashboard](https://intent-cart.subhasree6289.chatgpt.site/merchant)
- [Audit trail](https://intent-cart.subhasree6289.chatgpt.site/audit)

The checkout is a simulation. No real money is charged.

## What I built

- A natural-language shopping flow
- A small structured product catalogue
- Product recommendations with an explanation for every choice
- Hard checks for budget, stock, quantity and delivery date
- A cart that cannot be paid for without explicit approval
- A repair flow for products that go out of stock before checkout
- A merchant dashboard and a readable log of the agent's decisions
- A deterministic fallback, so the demo still works without an AI key

The important part is that the model only recommends products. Regular server-side rules decide whether the cart is actually allowed to continue.

## The failure case

There is a **Simulate inventory conflict** button in the demo. It marks one item as unavailable just before checkout.

IntentCart then pauses the order, swaps in an in-stock alternative, checks the budget again and asks for fresh approval. I added this because a happy-path demo did not say much about whether the agent could be trusted around money.

## Run it locally

You will need Node.js 22.13 or newer.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

An OpenAI key is optional:

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
```

Without the key, the same interface runs with a fixed recommendation so the full flow can still be tested.

## Useful commands

```bash
npm test
npm run evaluate
npm run build
```

The test suite covers the checkout limits and the main rendered screens.

## Evaluation

I also ran a deterministic simulation with 500 made-up shopping sessions. Compared with a simple catalogue-browsing baseline, the IntentCart version showed:

- 243 conversions instead of 195
- an average order value of ₹1,946 instead of ₹1,646
- all 25 injected failures handled
- no blocked policy action being executed

These are synthetic numbers from the included fixture, not real customer results. The script and output are in `scripts/evaluate.mjs` and `evaluation/summary.json`.

## Stack

React, TypeScript, Vinext, Zod, Tailwind CSS, Shadcn components and Recharts. The server routes are compatible with Cloudflare Workers.

## Current limitations

- The products and evaluation data are fictional.
- Checkout is test-only.
- There is no user authentication or live inventory connection yet.
- The hosted version uses the deterministic recommendation unless an AI key is configured.
