export const CATEGORY_OPTIONS = [
  { value: "power_tools", label: "Power Tools" },
  { value: "garden", label: "Garden" },
  { value: "kitchen", label: "Kitchen" },
  { value: "camping", label: "Camping" },
  { value: "automotive", label: "Automotive" },
  { value: "other", label: "Other" },
] as const;

export type ToolCategory = (typeof CATEGORY_OPTIONS)[number]['value'];

export const CONDITION_OPTIONS = [
  { value: "like_new", label: "Like New" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
] as const;

export type ToolCondition = (typeof CONDITION_OPTIONS)[number]["value"];

export function formatCategory(value: string): string {
  return (
    CATEGORY_OPTIONS.find((c) => c.value === value)?.label ?? value
  );
}

export function formatCondition(value: string): string {
  return (
    CONDITION_OPTIONS.find((c) => c.value === value)?.label ?? value
  );
}

export function formatRelativeTime(timestampMs: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} ${diffHr === 1 ? "hour" : "hours"} ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays} ${diffDays === 1 ? "day" : "days"} ago`;
}

export function loanStatusClasses(status: string): string {
  switch (status) {
    case "approved":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "pending":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "declined":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "returned":
      return "bg-zinc-100 text-zinc-700 border-zinc-200";
    default:
      return "bg-zinc-100 text-zinc-700 border-zinc-200";
  }
}
export function isOverdue(status: string, endDate: string): boolean {
  if (status !== "approved") return false;
  const today = new Date().toISOString().slice(0, 10);
  return endDate < today;
}