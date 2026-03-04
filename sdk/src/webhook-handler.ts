import { createHmac } from "node:crypto";
import type { WebhookPayload } from "./types.js";

/**
 * Verify the HMAC signature of an incoming webhook payload.
 *
 * @param body - The raw request body string
 * @param signature - The value of the X-Complr-Signature header
 * @param secret - Your webhook secret
 * @returns true if the signature is valid
 */
export function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  // Timing-safe comparison
  if (expected.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Parse and verify a webhook payload from a raw request.
 *
 * @param body - Raw request body string
 * @param signature - X-Complr-Signature header value
 * @param secret - Your webhook secret
 * @returns Parsed WebhookPayload
 * @throws Error if signature is invalid
 */
export function parseWebhookPayload(
  body: string,
  signature: string,
  secret: string
): WebhookPayload {
  if (!verifyWebhookSignature(body, signature, secret)) {
    throw new Error("Invalid webhook signature");
  }
  return JSON.parse(body) as WebhookPayload;
}

/**
 * Express middleware for handling Complr webhooks.
 *
 * @example
 * ```ts
 * import express from "express";
 * import { webhookMiddleware } from "@complr/sdk";
 *
 * const app = express();
 * app.post("/webhooks/complr", webhookMiddleware("your-secret", (event) => {
 *   console.log("Received:", event.event, event.data);
 * }));
 * ```
 */
export function webhookMiddleware(
  secret: string,
  handler: (payload: WebhookPayload) => void | Promise<void>
) {
  return async (
    req: { body: unknown; headers: Record<string, string | string[] | undefined> },
    res: { status: (code: number) => { json: (data: unknown) => void } }
  ): Promise<void> => {
    try {
      const body =
        typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      const signature =
        (req.headers["x-complr-signature"] as string) ?? "";

      const payload = parseWebhookPayload(body, signature, secret);
      await handler(payload);
      res.status(200).json({ received: true });
    } catch (err) {
      res.status(401).json({ error: (err as Error).message });
    }
  };
}
