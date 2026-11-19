import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type AuthCtx = QueryCtx | MutationCtx;
export async function requireIdentity(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("UNAUTHENTICATED");
  }
  return identity;
}

export async function getCurrentUser(
  ctx: AuthCtx
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

export async function requireCurrentUser(ctx: AuthCtx): Promise<Doc<"users">> {
  const identity = await requireIdentity(ctx);
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (!user) {
    throw new ConvexError("USER_NOT_SYNCED");
  }
  return user;
}

export async function requireAdmin(ctx: AuthCtx): Promise<Doc<"users">> {
  const user = await requireCurrentUser(ctx);
  if (user.role !== "admin") {
    throw new ConvexError("FORBIDDEN: Admin role required");
  }
  return user;
}
export function assertOwner(user: Doc<"users">, ownerId: Id<"users">) {
  if (user._id !== ownerId) {
    throw new ConvexError("FORBIDDEN: Only the owner can perform this action");
  }
}
export function assertOwnerOrAdmin(user: Doc<"users">, ownerId: Id<"users">) {
  if (user._id !== ownerId && user.role !== "admin") {
    throw new ConvexError(
      "FORBIDDEN: Only the owner or an admin can perform this action"
    );
  }
}