"use client";

import {
  formatCategory,
  formatRelativeTime,
  isOverdue,
  loanStatusClasses,
} from "@/lib/constants";

export interface LoanItem {
  _id: string;
  toolName: string;
  toolCategory: string;
  toolRemoved: boolean;
  ownerName: string;
  ownerTrustedLender: boolean;
  borrowerName: string;
  startDate: string;
  endDate: string;
  status: "pending" | "approved" | "declined" | "returned";
  note?: string;
  lastReminderSentAt?: number;
  recentAutomation: Array<{
    _id: string;
    type: string;
    status: "sent" | "failed";
    summary: string;
    createdAt: number;
  }>;
}

interface LoanCardProps {
  loan: LoanItem;
  mode: "borrower" | "lender" | "admin";
  busyId: string | null;
  onApprove?: (loanId: string) => void;
  onDecline?: (loanId: string) => void;
  onMarkReturned?: (loanId: string) => void;
}

export function LoanCard({
  loan,
  mode,
  busyId,
  onApprove,
  onDecline,
  onMarkReturned,
}: LoanCardProps) {
  const overdue = isOverdue(loan.status, loan.endDate);
  const isBusy = busyId === loan._id;
  const latestEvent = loan.recentAutomation[0];

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-zinc-900">{loan.toolName}</h3>
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600">
              {formatCategory(loan.toolCategory)}
            </span>
            {loan.toolRemoved && (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
                Listing removed
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-zinc-600">
            {mode === "borrower" && (
              <>
                Lender: <span className="font-medium">{loan.ownerName}</span>
                {loan.ownerTrustedLender && (
                  <span className="ml-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                    Trusted Lender
                  </span>
                )}
              </>
            )}
            {mode === "lender" && (
              <>
                Borrower:{" "}
                <span className="font-medium">{loan.borrowerName}</span>
              </>
            )}
            {mode === "admin" && (
              <>
                <span className="font-medium">{loan.borrowerName}</span>{" "}
                borrowing from{" "}
                <span className="font-medium">{loan.ownerName}</span>
                {loan.ownerTrustedLender && (
                  <span className="ml-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                    Trusted Lender
                  </span>
                )}
              </>
            )}
          </p>

          <p className="mt-1 text-xs text-zinc-500">
            Dates: {loan.startDate} → {loan.endDate}
          </p>

          {loan.note && (
            <p className="mt-2 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
              &ldquo;{loan.note}&rdquo;
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-1.5">
            {overdue && (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700">
                Overdue
              </span>
            )}
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${loanStatusClasses(
                loan.status
              )}`}
            >
              {loan.status}
            </span>
          </div>

          {mode === "lender" && loan.status === "pending" && (
            <div className="flex gap-2">
              <button
                disabled={isBusy}
                onClick={() => onApprove?.(loan._id)}
                className="cursor-pointer rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                disabled={isBusy}
                onClick={() => onDecline?.(loan._id)}
                className="cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
              >
                Decline
              </button>
            </div>
          )}

          {mode === "lender" && loan.status === "approved" && (
            <button
              disabled={isBusy}
              onClick={() => onMarkReturned?.(loan._id)}
              className="cursor-pointer rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
            >
              Mark returned
            </button>
          )}
        </div>
      </div>

      {/* Bonus: recent automation activity */}
      {(loan.lastReminderSentAt || latestEvent) && (
        <div className="mt-3 border-t border-zinc-100 pt-2.5 text-xs text-zinc-500">
          {loan.lastReminderSentAt ? (
            <span>
              Reminder sent {formatRelativeTime(loan.lastReminderSentAt)}
            </span>
          ) : latestEvent ? (
            <span
              className={
                latestEvent.status === "failed" ? "text-amber-700" : undefined
              }
            >
              {latestEvent.summary} ·{" "}
              {formatRelativeTime(latestEvent.createdAt)}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}