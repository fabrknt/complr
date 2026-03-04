import { randomBytes, createHmac } from "node:crypto";
import type { WebhookRegistration, WebhookEvent, WebhookPayload } from "../types.js";

/**
 * In-memory webhook manager.
 * Handles registration, HMAC-signed delivery with exponential backoff retry.
 */
export class WebhookManager {
  private webhooks = new Map<string, WebhookRegistration>();
  private maxRetries = 3;

  /** Register a new webhook */
  register(
    apiKeyId: string,
    url: string,
    events: WebhookEvent[],
    secret: string
  ): WebhookRegistration {
    const id = `wh_${randomBytes(8).toString("hex")}`;
    const registration: WebhookRegistration = {
      id,
      apiKeyId,
      url,
      events,
      secret,
      createdAt: new Date().toISOString(),
      active: true,
      failureCount: 0,
    };

    this.webhooks.set(id, registration);
    return registration;
  }

  /** List webhooks for an API key */
  listByApiKey(apiKeyId: string): WebhookRegistration[] {
    return Array.from(this.webhooks.values()).filter(
      (w) => w.apiKeyId === apiKeyId && w.active
    );
  }

  /** Remove a webhook */
  remove(id: string, apiKeyId: string): boolean {
    const wh = this.webhooks.get(id);
    if (!wh || wh.apiKeyId !== apiKeyId) return false;
    wh.active = false;
    return true;
  }

  /** Deliver a webhook event to all matching registrations */
  async deliver(event: WebhookEvent, data: unknown): Promise<void> {
    const payload: WebhookPayload = {
      id: `evt_${randomBytes(8).toString("hex")}`,
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    const matching = Array.from(this.webhooks.values()).filter(
      (w) => w.active && w.events.includes(event)
    );

    await Promise.allSettled(
      matching.map((wh) => this.deliverToEndpoint(wh, payload))
    );
  }

  private async deliverToEndpoint(
    wh: WebhookRegistration,
    payload: WebhookPayload
  ): Promise<void> {
    const body = JSON.stringify(payload);
    const signature = createHmac("sha256", wh.secret)
      .update(body)
      .digest("hex");

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(wh.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Complr-Signature": signature,
            "X-Complr-Event": payload.event,
            "X-Complr-Delivery": payload.id,
          },
          body,
          signal: AbortSignal.timeout(10_000),
        });

        if (response.ok) {
          wh.lastDeliveredAt = new Date().toISOString();
          wh.failureCount = 0;
          return;
        }

        // Non-retryable status
        if (response.status >= 400 && response.status < 500) {
          wh.failureCount++;
          return;
        }
      } catch {
        // Network error — retry with backoff
      }

      if (attempt < this.maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    wh.failureCount++;
    // Disable after 10 consecutive failures
    if (wh.failureCount >= 10) {
      wh.active = false;
    }
  }
}
