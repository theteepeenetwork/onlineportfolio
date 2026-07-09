const STYLES: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Waiting for you", className: "bg-amber-100 text-amber-800" },
  APPROVED: { label: "Published", className: "bg-emerald-100 text-emerald-800" },
  RETURNED: { label: "Sent back", className: "bg-rose-100 text-rose-800" },
};

// A small coloured pill showing where a journal item is in the approval flow.
export function StatusBadge({ status }: { status: string }) {
  const s = STYLES[status] ?? { label: status, className: "bg-gray-100 text-gray-700" };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.className}`}>
      {s.label}
    </span>
  );
}
