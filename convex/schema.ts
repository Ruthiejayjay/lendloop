import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const userRoleValidator = v.union(v.literal("user"), 
v.literal("admin"));

export const toolCategoryValidator = v.union(
  v.literal("power_tools"),
  v.literal("garden"),
  v.literal("kitchen"),
  v.literal("camping"),
  v.literal("automotive"),
  v.literal("other")
);

export const toolConditionValidator = v.union(
  v.literal("like_new"),
  v.literal("good"),
  v.literal("fair")
);
export const toolStatusValidator = v.union(
  v.literal("available"),
  v.literal("borrowed")
);
export const loanStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("returned")
);

export const automationEventTypeValidator = v.union(
  v.literal("request_created"),
  v.literal("request_approved"),
  v.literal("request_declined"),
  v.literal("loan_returned"),
  v.literal("overdue_reminder")
);
export const automationEventStatusValidator = v.union(
  v.literal("sent"),
  v.literal("failed")
);

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
    role: userRoleValidator,
    trustedLender: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_role", ["role"]),
  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: toolCategoryValidator,
    condition: toolConditionValidator,
    description: v.string(),
    status: toolStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_category", ["category"])
    .index("by_status", ["status"])
    .index("by_status_category", ["status", "category"]),
  loans: defineTable({
    toolId: v.id("tools"),
    toolNameSnapshot: v.string(),
    ownerId: v.id("users"),
    borrowerId: v.id("users"),
    startDate: v.string(), // ISO date: YYYY-MM-DD
    endDate: v.string(),   // ISO date: YYYY-MM-DD
    status: loanStatusValidator,
    note: v.optional(v.string()),
    lastReminderSentAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tool", ["toolId"])
    .index("by_owner", ["ownerId"])
    .index("by_borrower", ["borrowerId"])
    .index("by_status_end_date", ["status", "endDate"]),
  automationEvents: defineTable({
    loanId: v.id("loans"),
    idempotencyKey: v.string(),
    type: automationEventTypeValidator,
    status: automationEventStatusValidator,
    summary: v.string(),
    createdAt: v.number(),
  })
    .index("by_loan", ["loanId", "createdAt"])
    .index("by_idempotency_key", ["idempotencyKey"]),
});