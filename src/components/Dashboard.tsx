"use client";

import { UserButton } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  CATEGORY_OPTIONS,
  formatCategory,
  formatCondition,
  type ToolCategory,
  type ToolCondition,
} from "@/lib/constants";
import { BorrowModal } from "./BorrowModal";
import { LoanCard } from "./LoanCard";
import { ToolFormModal, type ToolFormValues } from "./ToolFormModal";
import { ConfirmModal } from "./ConfirmModal";

type Tab = "all" | "my_listings" | "my_requests" | "incoming" | "admin";
function extractError(err: unknown): string {
  if (err instanceof ConvexError) {
    return typeof err.data === "string" ? err.data : "Request failed";
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

function AdminPanel({
  busyId,
  onToggleTrusted,
}: {
  busyId: string | null;
  onToggleTrusted: (userId: Id<"users">, next: boolean) => Promise<void>;
}) {
  const users = useQuery(api.users.listUsersForAdmin);
  const allLoans = useQuery(api.loans.listAllForAdmin);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
          Lenders &amp; Trusted Badges
        </h2>

        {users === undefined ? (
          <p className="text-sm text-zinc-500">Loading users...</p>
        ) : (
          <div className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            {users.map((u) => (
              <div
                key={u._id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-900">{u.name}</span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs capitalize text-zinc-600">
                      {u.role}
                    </span>
                    {u.trustedLender && (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        Trusted Lender
                      </span>
                    )}
                  </div>
                  {u.email && (
                    <p className="text-xs text-zinc-500">{u.email}</p>
                  )}
                </div>
                <button
                  disabled={busyId === u._id}
                  onClick={() => onToggleTrusted(u._id, !u.trustedLender)}
                  className="cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
                >
                  {u.trustedLender
                    ? "Remove Trusted badge"
                    : "Mark Trusted Lender"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
          All Loans ({allLoans?.length ?? 0})
        </h2>
        {allLoans === undefined ? (
          <p className="text-sm text-zinc-500">Loading loans...</p>
        ) : allLoans.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
            No loans recorded yet.
          </div>
        ) : (
          <div className="space-y-3">
            {allLoans.map((loan) => (
              <LoanCard
                key={loan._id}
                loan={loan}
                mode="admin"
                busyId={busyId}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function Dashboard() {
  const syncUser = useMutation(api.users.syncCurrentUser);
  const [synced, setSynced] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    syncUser({})
      .then(() => {
        if (!cancelled) setSynced(true);
      })
      .catch((err) => {
        if (!cancelled) setSyncError(extractError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [syncUser]);

  if (syncError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
        <div className="max-w-md rounded-xl border border-rose-200 bg-white p-6 text-sm text-rose-700">
          Failed to initialize your account: {syncError}
        </div>
      </div>
    );
  }

  if (!synced) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-500">
        Loading LendLoop...
      </div>
    );
  }
  return <DashboardContent />;
}

function DashboardContent() {
  const me = useQuery(api.users.me);
  const [tab, setTab] = useState<Tab>("all");
  const [categoryFilter, setCategoryFilter] = useState<ToolCategory | "all">(
    "all",
  );

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTool, setEditingTool] = useState<{
    _id: Id<"tools">;
    name: string;
    category: ToolCategory;
    condition: ToolCondition;
    description: string;
  } | null>(null);
  const [borrowingTool, setBorrowingTool] = useState<{
    _id: Id<"tools">;
    name: string;
  } | null>(null);
  const [removingTool, setRemovingTool] = useState<{
    _id: Id<"tools">;
    name: string;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{
    type: "error" | "success";
    text: string;
  } | null>(null);

  const allTools = useQuery(api.tools.listAll, {
    category: categoryFilter === "all" ? undefined : categoryFilter,
  });
  const myListings = useQuery(api.tools.listMine);
  const myRequests = useQuery(api.loans.listMyRequests);
  const incomingRequests = useQuery(api.loans.listIncomingRequests);

  const createTool = useMutation(api.tools.create);
  const updateTool = useMutation(api.tools.update);
  const removeTool = useMutation(api.tools.remove);
  const requestBorrow = useMutation(api.loans.requestBorrow);
  const respondToRequest = useMutation(api.loans.respondToRequest);
  const markReturned = useMutation(api.loans.markReturned);
  const setTrustedLender = useMutation(api.users.setTrustedLender);

  const isAdmin = me?.role === "admin";
  const pendingIncomingCount =
    incomingRequests?.filter((r) => r.status === "pending").length ?? 0;

  async function runAction(
    id: string,
    fn: () => Promise<unknown>,
    successMsg: string,
  ) {
    setBanner(null);
    setBusyId(id);
    try {
      await fn();
      setBanner({ type: "success", text: successMsg });
    } catch (err) {
      setBanner({ type: "error", text: extractError(err) });
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreateTool(values: ToolFormValues) {
    try {
      await createTool(values);
      setBanner({ type: "success", text: "Tool listed for your neighbors." });
    } catch (err) {
      throw new Error(extractError(err));
    }
  }
  async function handleUpdateTool(values: ToolFormValues) {
    if (!editingTool) return;
    try {
      await updateTool({ toolId: editingTool._id, ...values });
      setBanner({ type: "success", text: "Tool listing updated." });
    } catch (err) {
      throw new Error(extractError(err));
    }
  }
  function handleRemoveTool(toolId: Id<"tools">, toolName: string) {
    setRemovingTool({ _id: toolId, name: toolName });
  }

  async function handleConfirmRemoveTool() {
    if (!removingTool) return;
    try {
      await removeTool({ toolId: removingTool._id });
      setBanner({ type: "success", text: `Removed "${removingTool.name}".` });
    } catch (err) {
      throw new Error(extractError(err));
    }
  }

  async function handleBorrowSubmit(values: {
    startDate: string;
    endDate: string;
    note?: string;
  }) {
    if (!borrowingTool) return;
    try {
      await requestBorrow({ toolId: borrowingTool._id, ...values });
      setBanner({
        type: "success",
        text: `Borrow request sent for "${borrowingTool.name}".`,
      });
    } catch (err) {
      throw new Error(extractError(err));
    }
  }
  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "all", label: "All tools" },
    { id: "my_listings", label: "My listings", count: myListings?.length },
    { id: "my_requests", label: "My requests", count: myRequests?.length },
    {
      id: "incoming",
      label: "Incoming requests",
      count: pendingIncomingCount || undefined,
    },
    ...(isAdmin ? [{ id: "admin" as const, label: "Admin" }] : []),
  ];

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold tracking-tight">
              LendLoop
            </span>
            {me?.role === "admin" && (
              <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-xs font-medium text-white">
                Admin
              </span>
            )}
            {me?.trustedLender && (
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                Trusted Lender
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="cursor-pointer rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
            >
              + List a tool
            </button>
            <UserButton />
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-6">
          {tabs.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setTab(item.id);
                  setBanner(null);
                }}
                className={`cursor-pointer whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "border-zinc-900 text-zinc-900"
                    : "border-transparent text-zinc-500 hover:text-zinc-800"
                }`}
              >
                {item.label}
                {item.count !== undefined && item.count > 0 && (
                  <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-700">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        {banner && (
          <div
            className={`mb-6 flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
              banner.type === "error"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            <span>{banner.text}</span>
            <button
              onClick={() => setBanner(null)}
              className="cursor-pointer text-xs underline"
            >
              Dismiss
            </button>
          </div>
        )}
        {/* ALL TOOLS TAB */}
        {tab === "all" && (
          <div>
            <div className="mb-6 flex flex-wrap gap-2">
              <button
                onClick={() => setCategoryFilter("all")}
                className={`cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition ${
                  categoryFilter === "all"
                    ? "bg-zinc-900 text-white"
                    : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100"
                }`}
              >
                All categories
              </button>
              {CATEGORY_OPTIONS.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setCategoryFilter(cat.value)}
                  className={`cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition ${
                    categoryFilter === cat.value
                      ? "bg-zinc-900 text-white"
                      : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            {allTools === undefined ? (
              <p className="text-sm text-zinc-500">Loading tools...</p>
            ) : allTools.length === 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
                No tools found in this category yet.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {allTools.map((tool) => (
                  <div
                    key={tool._id}
                    className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-5"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-zinc-900">
                          {tool.name}
                        </h3>
                        <span
                          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                            tool.status === "available"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                          }`}
                        >
                          {tool.status === "available"
                            ? "Available"
                            : "Borrowed"}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-zinc-600">
                        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5">
                          {formatCategory(tool.category)}
                        </span>
                        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5">
                          {formatCondition(tool.condition)}
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-zinc-600">
                        {tool.description}
                      </p>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                        <span>
                          {tool.isOwner ? "Your listing" : tool.ownerName}
                        </span>
                        {tool.ownerTrustedLender && (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
                            Trusted Lender
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {!tool.isOwner && tool.status === "available" && (
                          <button
                            onClick={() =>
                              setBorrowingTool({
                                _id: tool._id,
                                name: tool.name,
                              })
                            }
                            className="cursor-pointer rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                          >
                            Request borrow
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            disabled={busyId === tool._id}
                            onClick={() =>
                              handleRemoveTool(tool._id, tool.name)
                            }
                            className="cursor-pointer rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* MY LISTINGS TAB */}
        {tab === "my_listings" && (
          <div>
            {myListings === undefined ? (
              <p className="text-sm text-zinc-500">Loading your listings...</p>
            ) : myListings.length === 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
                You haven&apos;t listed any tools yet. Click{" "}
                <span className="font-medium text-zinc-900">+ List a tool</span>{" "}
                to share one with your neighbors.
              </div>
            ) : (
              <div className="space-y-3">
                {myListings.map((tool) => (
                  <div
                    key={tool._id}
                    className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-5"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-zinc-900">
                          {tool.name}
                        </h3>
                        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600">
                          {formatCategory(tool.category)}
                        </span>
                        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600">
                          {formatCondition(tool.condition)}
                        </span>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                            tool.status === "available"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                          }`}
                        >
                          {tool.status === "available"
                            ? "Available"
                            : "Borrowed"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-zinc-600">
                        {tool.description}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          setEditingTool({
                            _id: tool._id,
                            name: tool.name,
                            category: tool.category,
                            condition: tool.condition,
                            description: tool.description,
                          })
                        }
                        className="cursor-pointer rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        Edit
                      </button>
                      <button
                        disabled={busyId === tool._id}
                        onClick={() => handleRemoveTool(tool._id, tool.name)}
                        className="cursor-pointer rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* MY REQUESTS TAB */}
        {tab === "my_requests" && (
          <div>
            {myRequests === undefined ? (
              <p className="text-sm text-zinc-500">Loading your requests...</p>
            ) : myRequests.length === 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
                You haven&apos;t requested any tools yet.
              </div>
            ) : (
              <div className="space-y-3">
                {myRequests.map((loan) => (
                  <LoanCard
                    key={loan._id}
                    loan={loan}
                    mode="borrower"
                    busyId={busyId}
                  />
                ))}
              </div>
            )}
          </div>
        )}
        {/* INCOMING REQUESTS TAB */}
        {tab === "incoming" && (
          <div>
            {incomingRequests === undefined ? (
              <p className="text-sm text-zinc-500">
                Loading incoming requests...
              </p>
            ) : incomingRequests.length === 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
                No borrow requests for your tools yet.
              </div>
            ) : (
              <div className="space-y-3">
                {incomingRequests.map((loan) => (
                  <LoanCard
                    key={loan._id}
                    loan={loan}
                    mode="lender"
                    busyId={busyId}
                    onApprove={(id) =>
                      runAction(
                        id,
                        () =>
                          respondToRequest({
                            loanId: id as Id<"loans">,
                            decision: "approved",
                          }),
                        "Borrow request approved.",
                      )
                    }
                    onDecline={(id) =>
                      runAction(
                        id,
                        () =>
                          respondToRequest({
                            loanId: id as Id<"loans">,
                            decision: "declined",
                          }),
                        "Borrow request declined.",
                      )
                    }
                    onMarkReturned={(id) =>
                      runAction(
                        id,
                        () => markReturned({ loanId: id as Id<"loans"> }),
                        "Loan marked as returned.",
                      )
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}
        {/* ADMIN TAB */}
        {tab === "admin" && isAdmin && (
          <AdminPanel
            busyId={busyId}
            onToggleTrusted={(userId, next) =>
              runAction(
                userId,
                () => setTrustedLender({ userId, trustedLender: next }),
                next
                  ? "Marked lender as Trusted Lender."
                  : "Removed Trusted Lender badge.",
              )
            }
          />
        )}
      </main>
      {showCreateModal && (
        <ToolFormModal
          title="List a tool"
          submitLabel="List tool"
          onSubmit={handleCreateTool}
          onClose={() => setShowCreateModal(false)}
        />
      )}
      {editingTool && (
        <ToolFormModal
          title="Edit tool listing"
          submitLabel="Save changes"
          initialValues={{
            name: editingTool.name,
            category: editingTool.category,
            condition: editingTool.condition,
            description: editingTool.description,
          }}
          onSubmit={handleUpdateTool}
          onClose={() => setEditingTool(null)}
        />
      )}
      {borrowingTool && (
        <BorrowModal
          toolName={borrowingTool.name}
          onSubmit={handleBorrowSubmit}
          onClose={() => setBorrowingTool(null)}
        />
      )}
      {removingTool && (
        <ConfirmModal
          title="Remove tool listing?"
          description={`Are you sure you want to remove "${removingTool.name}" from LendLoop? Any open pending requests for it will be declined.`}
          confirmLabel="Remove tool"
          onConfirm={handleConfirmRemoveTool}
          onClose={() => setRemovingTool(null)}
        />
      )}
    </div>
  );
}
