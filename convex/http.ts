import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import { verifySignedRequest } from "./lib/hmac";

const http = httpRouter();

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// GET /api/n8n/overdue-loans
http.route({
  path: "/api/n8n/overdue-loans",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.N8N_HMAC_SECRET;
    if (!secret) {
      return jsonResponse({ error: "Server HMAC secret not configured" }, 500);
    }

    const verification = await verifySignedRequest({
      secret,
      timestamp: request.headers.get("X-LendLoop-Timestamp"),
      signature: request.headers.get("X-LendLoop-Signature"),
      body: "GET:/api/n8n/overdue-loans",
    });

    if (!verification.ok) {
      return jsonResponse({ error: verification.reason }, 401);
    }

    const today = new Date().toISOString().slice(0, 10);
    const loans = await ctx.runQuery(
      internal.automation.getOverdueLoansInternal,
      { today }
    );

    return jsonResponse({ date: today, count: loans.length, loans });
  }),
});

// POST /api/n8n/reminder-status
http.route({
  path: "/api/n8n/reminder-status",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.N8N_HMAC_SECRET;
    if (!secret) {
      return jsonResponse({ error: "Server HMAC secret not configured" }, 500);
    }

    const rawBody = await request.text();
    const verification = await verifySignedRequest({
      secret,
      timestamp: request.headers.get("X-LendLoop-Timestamp"),
      signature: request.headers.get("X-LendLoop-Signature"),
      body: rawBody,
    });

    if (!verification.ok) {
      return jsonResponse({ error: verification.reason }, 401);
    }

    let parsed: {
      loanId?: string;
      idempotencyKey?: string;
      status?: string;
      summary?: string;
    };

    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: "Invalid JSON payload" }, 400);
    }

    if (
      !parsed.loanId ||
      !parsed.idempotencyKey ||
      (parsed.status !== "sent" && parsed.status !== "failed")
    ) {
      return jsonResponse(
        {
          error:
            "Required fields: loanId, idempotencyKey, and status ('sent' | 'failed')",
        },
        400
      );
    }

    try {
      const result = await ctx.runMutation(
        internal.automation.recordEventInternal,
        {
          loanId: parsed.loanId as Id<"loans">,
          idempotencyKey: parsed.idempotencyKey,
          type: "overdue_reminder",
          status: parsed.status,
          summary:
            parsed.summary?.trim().slice(0, 200) ||
            (parsed.status === "sent"
              ? "Overdue reminder sent to borrower"
              : "Overdue reminder delivery failed"),
        }
      );

      return jsonResponse({ ok: true, ...result }, 200);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to record reminder status";
      return jsonResponse({ error: message }, 400);
    }
  }),
});

export default http;