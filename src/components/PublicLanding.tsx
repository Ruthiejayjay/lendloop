"use client";

import { SignInButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { formatCategory } from "@/lib/constants";

export function PublicLanding() {
  const availableTools = useQuery(api.tools.listPublicAvailable);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold tracking-tight">LendLoop</span>
          <SignInButton mode="modal">
            <button className="cursor-pointer rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800">
              Sign in to lend or borrow
            </button>
          </SignInButton>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-14">
        <section className="mb-12">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            Borrow what you need. Lend what you don&apos;t.
          </h1>
          <p className="mt-3 max-w-xl text-base text-zinc-600">
            A neighborhood tool-lending board for sharing power tools, garden
            gear, kitchen appliances, and camping equipment with people nearby.
          </p>
          <div className="mt-6">
            <SignInButton mode="modal">
              <button className="cursor-pointer rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800">
                Sign in to lend or borrow
              </button>
            </SignInButton>
          </div>
        </section>
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Available tools right now
            </h2>
            {availableTools && (
              <span className="text-xs text-zinc-500">
                {availableTools.length}{" "}
                {availableTools.length === 1 ? "tool" : "tools"}
              </span>
            )}
          </div>
          {availableTools === undefined ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
              Loading available tools...
            </div>
          ) : availableTools.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
              No tools are listed yet. Sign in to list the first one for your
              neighborhood.
            </div>
          ) : (
            <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">
              {availableTools.map((tool) => (
                <li
                  key={tool._id}
                  className="flex items-center justify-between px-5 py-3.5"
                >
                  <span className="font-medium text-zinc-900">{tool.name}</span>
                  <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
                    {formatCategory(tool.category)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-zinc-500">
            For neighbor privacy, owner details and borrowing requests are only
            visible after signing in.
          </p>
        </section>
      </main>
    </div>
  );
}
