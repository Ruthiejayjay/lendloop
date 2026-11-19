import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { signPayload } from "./lib/hmac";
import {
  automationEventStatusValidator,
  automationEventTypeValidator,
} from "./schema";

const MAX_ATTEMPTS = 3;

export const recordEventInternal = internalMutation({
  args: {
    loanId: v.id("loans"),
    idempotencyKey: v.string(),
    type: automationEventTypeValidator,
    status: automationEventStatusValidator,
    summary: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ alreadyProcessed: boolean; eventId: string }> => {
    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_idempotency_key", (q) =>
        q.eq("idempotencyKey", args.idempotencyKey)
      )
      .unique();

    if (existing) {
      return { alreadyProcessed: true, eventId: existing._id };
    }

    const loan = await ctx.db.get(args.loanId);
    if (!loan) {
      throw new Error("Loan not found");
    }

    const now = Date.now();
    const eventId = await ctx.db.insert("automationEvents", {
      loanId: args.loanId,
      idempotencyKey: args.idempotencyKey,
      type: args.type,
      status: args.status,
      summary: args.summary,
      createdAt: now,
    });

    if (args.type === "overdue_reminder" && args.status === "sent") {
      await ctx.db.patch(args.loanId, {
        lastReminderSentAt: now,
        updatedAt: now,
      });
    }

    return { alreadyProcessed: false, eventId };
  },
});

// Returns only the minimal fields n8n needs to send overdue reminders
export const getOverdueLoansInternal = internalQuery({
  args: {
    today: v.string(), // YYYY-MM-DD (UTC)
  },
  handler: async (ctx, args) => {
    const overdueLoans = await ctx.db
      .query("loans")
      .withIndex("by_status_end_date", (q) =>
        q.eq("status", "approved").lt("endDate", args.today)
      )
      .collect();

    const results = [];
    for (const loan of overdueLoans) {
      const idempotencyKey = `overdue_reminder:${loan._id}:${args.today}`;

      // Skip loans that already received today's reminder
      const alreadySent = await ctx.db
        .query("automationEvents")
        .withIndex("by_idempotency_key", (q) =>
          q.eq("idempotencyKey", idempotencyKey)
        )
        .unique();

      if (alreadySent && alreadySent.status === "sent") {
        continue;
      }

      const [borrower, owner] = await Promise.all([
        ctx.db.get(loan.borrowerId),
        ctx.db.get(loan.ownerId),
      ]);

      results.push({
        loanId: loan._id,
        idempotencyKey,
        toolName: loan.toolNameSnapshot,
        endDate: loan.endDate,
        borrowerName: borrower?.name ?? "Neighbor",
        borrowerEmail: borrower?.email ?? null,
        lenderName: owner?.name ?? "Neighbor",
      });
    }

    return results;
  },
});

export const notifyLoanEvent = internalAction({
  args: {
    loanId: v.id("loans"),
    eventType: v.union(
      v.literal("request_created"),
      v.literal("request_approved"),
      v.literal("request_declined"),
      v.literal("loan_returned")
    ),
    toolName: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    recipientName: v.string(),
    recipientEmail: v.optional(v.string()),
    actorName: v.string(),
    occurredAt: v.number(),
  },
  handler: async (ctx, args): Promise<{ delivered: boolean }> => {
    const idempotencyKey = `${args.eventType}:${args.loanId}:${args.occurredAt}`;
    const webhookUrl = process.env.N8N_REQUEST_WEBHOOK_URL;
    const secret = process.env.N8N_HMAC_SECRET;

    if (!webhookUrl || !secret) {
      await ctx.runMutation(internal.automation.recordEventInternal, {
        loanId: args.loanId,
        idempotencyKey,
        type: args.eventType,
        status: "failed",
        summary: "Notification skipped: n8n webhook URL or HMAC secret not set",
      });
      return { delivered: false };
    }

    // Data minimization: send only fields required for notification delivery
    const payload = JSON.stringify({
      eventType: args.eventType,
      idempotencyKey,
      loanId: args.loanId,
      toolName: args.toolName,
      startDate: args.startDate,
      endDate: args.endDate,
      recipientName: args.recipientName,
      recipientEmail: args.recipientEmail ?? null,
      actorName: args.actorName,
      occurredAt: new Date(args.occurredAt).toISOString(),
    });

    let lastError = "Unknown error";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const signature = await signPayload(secret, timestamp, payload);

        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-LendLoop-Timestamp": timestamp,
            "X-LendLoop-Signature": `sha256=${signature}`,
            "X-Idempotency-Key": idempotencyKey,
          },
          body: payload,
        });

        if (res.ok) {
          await ctx.runMutation(internal.automation.recordEventInternal, {
            loanId: args.loanId,
            idempotencyKey,
            type: args.eventType,
            status: "sent",
            summary: `Notification sent to ${args.recipientName} (${args.eventType.replace("_", " ")})`,
          });
          return { delivered: true };
        }

        lastError = `HTTP ${res.status}`;
        // Do not retry 4xx client/auth errors
        if (res.status >= 400 && res.status < 500) {
          break;
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Network error";
      }

      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }

    // Record visible failure so it never fails silently
    await ctx.runMutation(internal.automation.recordEventInternal, {
      loanId: args.loanId,
      idempotencyKey,
      type: args.eventType,
      status: "failed",
      summary: `Notification failed after retries (${lastError})`,
    });

    return { delivered: false };
  },
});