import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { assertOwner, requireAdmin, requireCurrentUser } from "./lib/auth";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateDateRange(startDate: string, endDate: string) {
  if (!ISO_DATE_RE.test(startDate) || !ISO_DATE_RE.test(endDate)) {
    throw new ConvexError("Dates must be in YYYY-MM-DD format");
  }
  if (endDate < startDate) {
    throw new ConvexError("End date must be on or after start date");
  }
}

async function enrichLoans(ctx: QueryCtx, loans: Doc<"loans">[]) {
  return await Promise.all(
    loans.map(async (loan) => {
      const [tool, owner, borrower, recentEvents] = await Promise.all([
        ctx.db.get(loan.toolId),
        ctx.db.get(loan.ownerId),
        ctx.db.get(loan.borrowerId),
        ctx.db
          .query("automationEvents")
          .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
          .order("desc")
          .take(3),
      ]);

      return {
        _id: loan._id,
        toolId: loan.toolId,
        toolName: tool?.name ?? loan.toolNameSnapshot,
        toolCategory: tool?.category ?? "other",
        toolRemoved: !tool,
        ownerId: loan.ownerId,
        ownerName: owner?.name ?? "Neighbor",
        ownerTrustedLender: owner?.trustedLender ?? false,
        borrowerId: loan.borrowerId,
        borrowerName: borrower?.name ?? "Neighbor",
        startDate: loan.startDate,
        endDate: loan.endDate,
        status: loan.status,
        note: loan.note,
        lastReminderSentAt: loan.lastReminderSentAt,
        createdAt: loan.createdAt,
        updatedAt: loan.updatedAt,
        recentAutomation: recentEvents.map((e) => ({
          _id: e._id,
          type: e.type,
          status: e.status,
          summary: e.summary,
          createdAt: e.createdAt,
        })),
      };
    })
  );
}

export const listMyRequests = query({
  args: {},
  handler: async (ctx) => {
    const currentUser = await requireCurrentUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", currentUser._id))
      .order("desc")
      .collect();
    return await enrichLoans(ctx, loans);
  },
});

export const listIncomingRequests = query({
  args: {},
  handler: async (ctx) => {
    const currentUser = await requireCurrentUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_owner", (q) => q.eq("ownerId", currentUser._id))
      .order("desc")
      .collect();
    return await enrichLoans(ctx, loans);
  },
});

// Strict RBAC: Admin-only view of all loans
export const listAllForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const loans = await ctx.db.query("loans").order("desc").collect();
    return await enrichLoans(ctx, loans);
  },
});

export const requestBorrow = mutation({
  args: {
    toolId: v.id("tools"),
    startDate: v.string(),
    endDate: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const borrower = await requireCurrentUser(ctx);
    validateDateRange(args.startDate, args.endDate);

    const tool = await ctx.db.get(args.toolId);
    if (!tool) {
      throw new ConvexError("Tool not found");
    }
    if (tool.ownerId === borrower._id) {
      throw new ConvexError("You cannot request to borrow your own tool");
    }
    if (tool.status !== "available") {
      throw new ConvexError("This tool is currently borrowed");
    }

    const duplicatePending = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", args.toolId))
      .filter((q) =>
        q.and(
          q.eq(q.field("borrowerId"), borrower._id),
          q.eq(q.field("status"), "pending")
        )
      )
      .first();

    if (duplicatePending) {
      throw new ConvexError(
        "You already have a pending request for this tool"
      );
    }

    const cleanNote = args.note?.trim().slice(0, 300) || undefined;
    const now = Date.now();

    const loanId = await ctx.db.insert("loans", {
      toolId: tool._id,
      toolNameSnapshot: tool.name,
      ownerId: tool.ownerId,
      borrowerId: borrower._id,
      startDate: args.startDate,
      endDate: args.endDate,
      status: "pending",
      note: cleanNote,
      createdAt: now,
      updatedAt: now,
    });

    const owner = await ctx.db.get(tool.ownerId);
    await ctx.scheduler.runAfter(0, internal.automation.notifyLoanEvent, {
      loanId,
      eventType: "request_created",
      toolName: tool.name,
      startDate: args.startDate,
      endDate: args.endDate,
      recipientName: owner?.name ?? "Neighbor",
      recipientEmail: owner?.email,
      actorName: borrower.name,
      occurredAt: now,
    });

    return loanId;
  },
});

export const respondToRequest = mutation({
  args: {
    loanId: v.id("loans"),
    decision: v.union(v.literal("approved"), v.literal("declined")),
  },
  handler: async (ctx, args) => {
    const owner = await requireCurrentUser(ctx);
    const loan = await ctx.db.get(args.loanId);
    if (!loan) {
      throw new ConvexError("Borrow request not found");
    }

    // Strict RBAC: only the tool owner can approve/decline requests on their own tool
    assertOwner(owner, loan.ownerId);

    if (loan.status !== "pending") {
      throw new ConvexError("Only pending requests can be updated");
    }

    const now = Date.now();

    if (args.decision === "approved") {
      const tool = await ctx.db.get(loan.toolId);
      if (!tool) {
        throw new ConvexError("Tool no longer exists");
      }
      if (tool.status !== "available") {
        throw new ConvexError("Tool is already borrowed");
      }

      await ctx.db.patch(tool._id, { status: "borrowed", updatedAt: now });
      await ctx.db.patch(loan._id, { status: "approved", updatedAt: now });

      // Auto-decline competing pending requests for the same tool
      const competing = await ctx.db
        .query("loans")
        .withIndex("by_tool", (q) => q.eq("toolId", loan.toolId))
        .filter((q) => q.eq(q.field("status"), "pending"))
        .collect();

      for (const other of competing) {
        if (other._id !== loan._id) {
          await ctx.db.patch(other._id, { status: "declined", updatedAt: now });
        }
      }
    } else {
      await ctx.db.patch(loan._id, { status: "declined", updatedAt: now });
    }

    const borrower = await ctx.db.get(loan.borrowerId);
    await ctx.scheduler.runAfter(0, internal.automation.notifyLoanEvent, {
      loanId: loan._id,
      eventType:
        args.decision === "approved" ? "request_approved" : "request_declined",
      toolName: loan.toolNameSnapshot,
      startDate: loan.startDate,
      endDate: loan.endDate,
      recipientName: borrower?.name ?? "Neighbor",
      recipientEmail: borrower?.email,
      actorName: owner.name,
      occurredAt: now,
    });
  },
});

export const markReturned = mutation({
  args: {
    loanId: v.id("loans"),
  },
  handler: async (ctx, args) => {
    const owner = await requireCurrentUser(ctx);
    const loan = await ctx.db.get(args.loanId);
    if (!loan) {
      throw new ConvexError("Loan not found");
    }

    // Strict RBAC: only the tool owner confirms return of their tool
    assertOwner(owner, loan.ownerId);

    if (loan.status !== "approved") {
      throw new ConvexError("Only approved active loans can be marked returned");
    }

    const now = Date.now();
    await ctx.db.patch(loan._id, { status: "returned", updatedAt: now });

    const tool = await ctx.db.get(loan.toolId);
    if (tool) {
      await ctx.db.patch(tool._id, { status: "available", updatedAt: now });
    }

    const borrower = await ctx.db.get(loan.borrowerId);
    await ctx.scheduler.runAfter(0, internal.automation.notifyLoanEvent, {
      loanId: loan._id,
      eventType: "loan_returned",
      toolName: loan.toolNameSnapshot,
      startDate: loan.startDate,
      endDate: loan.endDate,
      recipientName: borrower?.name ?? "Neighbor",
      recipientEmail: borrower?.email,
      actorName: owner.name,
      occurredAt: now,
    });
  },
});