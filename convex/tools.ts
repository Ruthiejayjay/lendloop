import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  assertOwner,
  assertOwnerOrAdmin,
  requireCurrentUser,
} from "./lib/auth";
import { toolCategoryValidator, toolConditionValidator } from "./schema";

function validateToolFields(name: string, description: string) {
  const cleanName = name.trim();
  const cleanDescription = description.trim();
  if (cleanName.length < 2 || cleanName.length > 100) {
    throw new ConvexError("Tool name must be between 2 and 100 characters");
  }
  if (cleanDescription.length < 4 || cleanDescription.length > 500) {
    throw new ConvexError("Description must be between 4 and 500 characters");
  }
  return { cleanName, cleanDescription };
}

// Public read-only view: strictly name and category only (no owner details)
export const listPublicAvailable = query({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_status", (q) => q.eq("status", "available"))
      .order("desc")
      .collect();

    return tools.map((tool) => ({
      _id: tool._id,
      name: tool.name,
      category: tool.category,
    }));
  },
});

// Authenticated catalog view with optional category filter
export const listAll = query({
  args: {
    category: v.optional(toolCategoryValidator),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);

    const tools = args.category
      ? await ctx.db
          .query("tools")
          .withIndex("by_category", (q) => q.eq("category", args.category!))
          .order("desc")
          .collect()
      : await ctx.db.query("tools").order("desc").collect();

    return await Promise.all(
      tools.map(async (tool) => {
        const owner = await ctx.db.get(tool.ownerId);
        return {
          _id: tool._id,
          name: tool.name,
          category: tool.category,
          condition: tool.condition,
          description: tool.description,
          status: tool.status,
          createdAt: tool.createdAt,
          ownerId: tool.ownerId,
          // Data minimization: expose only display name & trusted badge, not email/clerkId
          ownerName: owner?.name ?? "Neighbor",
          ownerTrustedLender: owner?.trustedLender ?? false,
          isOwner: tool.ownerId === currentUser._id,
        };
      })
    );
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const currentUser = await requireCurrentUser(ctx);
    return await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", currentUser._id))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    category: toolCategoryValidator,
    condition: toolConditionValidator,
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    const { cleanName, cleanDescription } = validateToolFields(
      args.name,
      args.description
    );
    const now = Date.now();

    return await ctx.db.insert("tools", {
      ownerId: currentUser._id,
      name: cleanName,
      category: args.category,
      condition: args.condition,
      description: cleanDescription,
      status: "available",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    toolId: v.id("tools"),
    name: v.string(),
    category: toolCategoryValidator,
    condition: toolConditionValidator,
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    const tool = await ctx.db.get(args.toolId);
    if (!tool) {
      throw new ConvexError("Tool not found");
    }

    // Strict RBAC: only the listing owner can edit their listing
    assertOwner(currentUser, tool.ownerId);

    const { cleanName, cleanDescription } = validateToolFields(
      args.name,
      args.description
    );

    await ctx.db.patch(args.toolId, {
      name: cleanName,
      category: args.category,
      condition: args.condition,
      description: cleanDescription,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: {
    toolId: v.id("tools"),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    const tool = await ctx.db.get(args.toolId);
    if (!tool) {
      throw new ConvexError("Tool not found");
    }

    // Strict RBAC: owner OR admin can delete a listing
    assertOwnerOrAdmin(currentUser, tool.ownerId);

    // Prevent deleting a tool while it is currently checked out
    const activeLoan = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", args.toolId))
      .filter((q) => q.eq(q.field("status"), "approved"))
      .first();

    if (activeLoan) {
      throw new ConvexError(
        "Cannot remove a tool with an active approved loan. Mark it returned first."
      );
    }

    // Decline any open pending requests cleanly before removing the tool
    const pendingLoans = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", args.toolId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    const now = Date.now();
    for (const loan of pendingLoans) {
      await ctx.db.patch(loan._id, { status: "declined", updatedAt: now });
    }

    await ctx.db.delete(args.toolId);
  },
});