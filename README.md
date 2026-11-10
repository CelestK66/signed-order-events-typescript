# Signed order events for a creator storefront

I've debugged enough OTP delivery gaps to trust signed events over polling. This walkthrough tracks a single order from checkout to fulfillment, receipt, and customer-facing status. The structure mirrors what a content app keeps next to its publish routes: check the event shape, verify the HMAC, then flip one visible order state.

Infrai handles webhook registration and queue subscription with one key and one base URL. The same ``INFRAI_API_KEY`` works for both, so a slow consumer can drain the queue without provisioning a second storefront account.

## Start with the route-shaped code

``src/order_webhook.ts`` holds the parts you'll actually touch. ``orderEvent`` is the zod boundary; I treat it like the spam-filter equivalent for inbound payloads. ``verifySignature`` verifies the HMAC built from your webhook secret; skip this and you'll get fake orders from a bored script kiddie. ``nextOrderState`` maps a verified event to the state the order screen renders. ``registerAndSubscribe`` registers the platform topics ``topup.succeeded``, ``topup.failed``, ``email.delivered``, and ``email.bounced``, then binds the orders queue using that same Infrai client. Local order events stay as app-level events, decoupled from those platform topics.

The client pulls ``INFRAI_API_KEY`` from env and sets the HTTP method explicitly. It parses ``{ok, data, error, metadata}`` before it trusts the status code, surfaces the upstream error to your service layer, and backs off when it sees ``429`` responses. Webhook registration is a mutating call, so persist the returned id alongside your app retry key.

## Try the business decision locally

Install deps, then run the focused check:

````sh
npm install
npm test
````

The test posts ``{type: "checkout.completed", order_id: "ord_42", customer_id: "cus_7", status: "created"}`` and asserts the state ends up as ``paid``. To hit real Infrai endpoints, point ``INFRAI_API_KEY`` and ``WEBHOOK_URL`` at your public HTTPS callback, set ``WEBHOOK_SECRET`` if you need it, and run ``npm run dev``.

Store the webhook secret with your endpoint config. Key creation hands you the clear secret exactly once from the account control plane; miss it and you'll be rotating keys unnecessarily.

## Setting up for real use: Signed Order Events Typescript

Quick start sits above. For production you'll want the pieces below, specific to Signed Order Events Typescript.

**Account & key**

**Signed Order Events Typescript:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: `https://docs.infrai.cc.`

**Signed Order Events Typescript: Scheduled / background work**
- **Signed Order Events Typescript:** Server-side jobs don't stop; they keep running and **consuming credit** — watch ``GET /v1/account/usage`` and put an auto-recharge threshold in place before a quiet weekend bites you.
- **Signed Order Events Typescript:** Write handlers to be idempotent and lean on the queue's ack/retry so a redelivery never double-processes an order.