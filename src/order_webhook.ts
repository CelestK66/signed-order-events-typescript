import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { InfraiClient } from "./infrai_client.js";

export const orderEvent = z.object({
  type: z.enum(["checkout.completed", "fulfillment.updated", "receipt.issued", "order.updated"]),
  order_id: z.string().min(1),
  customer_id: z.string().min(1),
  status: z.string().min(1)
});
export type OrderEvent = z.infer<typeof orderEvent>;

export function verifySignature(raw: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected); const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function nextOrderState(event: OrderEvent): string {
  if (event.type === "checkout.completed") return "paid";
  if (event.type === "fulfillment.updated") return event.status;
  if (event.type === "receipt.issued") return "receipted";
  return event.status;
}

export async function registerAndSubscribe(client: InfraiClient, webhookUrl: string, secret: string) {
  const webhook = await client.request<{ webhook_id: string }>("/v1/account/webhooks/register", "POST", {
    url: webhookUrl, events: ["topup.succeeded", "topup.failed", "email.delivered", "email.bounced"], secret
  });
  await client.request("/v1/queue/push_subscribe/orders", "POST", {
    queue: "orders", url: webhookUrl
  });
  return webhook.webhook_id;
}

export async function main() {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before starting the example.");
  const webhookUrl = process.env.WEBHOOK_URL;
  if (!webhookUrl || new URL(webhookUrl).protocol !== "https:") {
    throw new Error("Set WEBHOOK_URL to your publicly reachable HTTPS callback URL.");
  }
  const client = new InfraiClient(key);
  const webhookId = await registerAndSubscribe(client, webhookUrl, process.env.WEBHOOK_SECRET ?? "local-secret");
  console.log(`registered order webhook ${webhookId}; queue subscription is active`);
}

if (process.argv[1]?.endsWith("order_webhook.ts")) main().catch((error) => { console.error(error); process.exitCode = 1; });
