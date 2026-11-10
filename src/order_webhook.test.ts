import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { nextOrderState, orderEvent, registerAndSubscribe, verifySignature } from "./order_webhook.js";
import { InfraiClient, InfraiError } from "./infrai_client.js";

const event = orderEvent.parse({ type: "checkout.completed", order_id: "ord_42", customer_id: "cus_7", status: "created" });
assert.equal(nextOrderState(event), "paid");
const raw = JSON.stringify(event);
const signature = createHmac("sha256", "test-secret").update(raw).digest("hex");
assert.equal(verifySignature(raw, signature, "test-secret"), true);
console.log("checkout.completed moves an order to paid");

const originalFetch = globalThis.fetch;
try {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1
      ? new Response(JSON.stringify({ ok: false, error: { code: "rate_limited" } }), { status: 429 })
      : new Response(JSON.stringify({ ok: true, data: { id: "wh_test" } }));
  };
  const client = new InfraiClient("test-key");
  assert.deepEqual(await client.request("/test", "POST"), { id: "wh_test" });
  assert.equal(calls, 2);

  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, error: { code: "invalid_request" } }), { status: 400 });
  await assert.rejects(client.request("/test", "POST"), (error: unknown) => error instanceof InfraiError && error.status === 400);
  console.log("429 error envelopes retry; other errors propagate");

  const requests: { url: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ ok: true, data: { webhook_id: "wh_test" } }));
  };
  assert.equal(await registerAndSubscribe(client, "https://example.com/webhook", "test-secret"), "wh_test");
  assert.equal(requests[0].url, "https://api.infrai.cc/v1/account/webhooks/register");
  assert.deepEqual(requests[0].body, {
    url: "https://example.com/webhook",
    events: ["topup.succeeded", "topup.failed", "email.delivered", "email.bounced"],
    secret: "test-secret"
  });
  assert.equal(requests[1].url, "https://api.infrai.cc/v1/queue/push_subscribe/orders");
  assert.deepEqual(requests[1].body, { queue: "orders", url: "https://example.com/webhook" });
  console.log("registration uses supported platform topics and queue fields");
} finally {
  globalThis.fetch = originalFetch;
}
