"use client";

import { useState } from "react";
import {
  CATEGORY_OPTIONS,
  CONDITION_OPTIONS,
  type ToolCategory,
  type ToolCondition,
} from "@/lib/constants";

export interface ToolFormValues {
  name: string;
  category: ToolCategory;
  condition: ToolCondition;
  description: string;
}

interface ToolFormModalProps {
  title: string;
  submitLabel: string;
  initialValues?: ToolFormValues;
  onSubmit: (values: ToolFormValues) => Promise<void>;
  onClose: () => void;
}

export function ToolFormModal({
  title,
  submitLabel,
  initialValues,
  onSubmit,
  onClose,
}: ToolFormModalProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [category, setCategory] = useState<ToolCategory>(
    initialValues?.category ?? "power_tools",
  );
  const [condition, setCondition] = useState<ToolCondition>(
    initialValues?.condition ?? "good",
  );
  const [description, setDescription] = useState(
    initialValues?.description ?? "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({ name, category, condition, description });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save tool");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-sm text-zinc-500 hover:text-zinc-800"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">
              Tool name
            </label>
            <input
              type="text"
              required
              minLength={2}
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. DeWalt Cordless Drill"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">
                Category
              </label>
              <div className="relative">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ToolCategory)}
                  className="w-full appearance-none rounded-lg border border-zinc-300 bg-white py-2 pl-3 pr-9 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none"
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <svg
                  className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-zinc-500"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">
                Condition
              </label>
              <div className="relative">
                <select
                  value={condition}
                  onChange={(e) =>
                    setCondition(e.target.value as ToolCondition)
                  }
                  className="w-full appearance-none rounded-lg border border-zinc-300 bg-white py-2 pl-3 pr-9 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none"
                >
                  {CONDITION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <svg
                  className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-zinc-500"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">
              Short description
            </label>
            <textarea
              required
              minLength={4}
              maxLength={500}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Includes charger and basic drill bit set."
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="cursor-pointer rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {submitting ? "Saving..." : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
