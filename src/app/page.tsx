"use client";

import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { Dashboard } from "@/components/Dashboard";
import { PublicLanding } from "@/components/PublicLanding";

export default function Home() {
  return (
    <>
      <AuthLoading>
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-500">
          Loading LendLoop...
        </div>
      </AuthLoading>
      <Unauthenticated>
        <PublicLanding />
      </Unauthenticated>
      <Authenticated>
        <Dashboard />
      </Authenticated>
    </>
  );
}
