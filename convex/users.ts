import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  getCurrentUser,
  requireAdmin,
  requireIdentity,
} from "./lib/auth";
import { userRoleValidator } from "./schema";

function isConfiguredAdminEmail(email?: string): boolean {
  if (!email) return false;
  const raw = process.env.ADMIN_EMAILS ?? "";
  const allowed = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

export const syncCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const email = identity.email?.trim() || undefined;
    const name =
      identity.name?.trim() ||
      [identity.givenName, identity.familyName].filter(Boolean).join(" ") ||
      identity.nickname?.trim() ||
      email?.split("@")[0] ||
      "Neighbor";

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    const shouldBeAdmin = isConfiguredAdminEmail(email);

    if (existing) {
      const updates: Partial<{
        name: string;
        email: string | undefined;
        role: "user" | "admin";
      }> = {};

      if (existing.name !== name) updates.name = name;
      if (existing.email !== email) updates.email = email;
      if (shouldBeAdmin && existing.role !== "admin") {
        updates.role = "admin";
      }

      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(existing._id, updates);
      }
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkId: identity.subject,
      name,
      email,
      role: shouldBeAdmin ? "admin" : "user",
      trustedLender: false,
      createdAt: Date.now(),
    });
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      trustedLender: user.trustedLender,
    };
  },
});

export const listUsersForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").order("desc").collect();
    // Data minimization: omit internal auth identifiers like clerkId
    return users.map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      trustedLender: u.trustedLender,
      createdAt: u.createdAt,
    }));
  },
});

export const setTrustedLender = mutation({
  args: {
    userId: v.id("users"),
    trustedLender: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get(args.userId);
    if (!target) {
      throw new ConvexError("User not found");
    }
    await ctx.db.patch(args.userId, { trustedLender: args.trustedLender });
    return { userId: args.userId, trustedLender: args.trustedLender };
  },
});

// Server/CLI-only role assignment (cannot be called from the browser):
// npx convex run users:setUserRoleInternal '{"email":"you@example.com","role":"admin"}'
export const setUserRoleInternal = internalMutation({
  args: {
    email: v.string(),
    role: userRoleValidator,
  },
  handler: async (ctx, args) => {
    const users = await ctx.db.query("users").collect();
    const target = users.find(
      (u) => u.email?.toLowerCase() === args.email.trim().toLowerCase()
    );
    if (!target) {
      throw new ConvexError(`No synced user found with email ${args.email}`);
    }
    await ctx.db.patch(target._id, { role: args.role });
    return { userId: target._id, email: target.email, role: args.role };
  },
});