// The admin console's tabs, in one place so the console and the panes it renders
// can share the type without importing each other.
export type Tab = "overview" | "staff" | "classes" | "guide" | "promises" | "audit" | "billing";

export const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "staff", label: "Staff" },
  { id: "classes", label: "Classes" },
  { id: "guide", label: "Guide" },
  { id: "promises", label: "Promises" },
  { id: "audit", label: "Audit log" },
  { id: "billing", label: "Billing" },
];

export const TAB_HEADING: Record<Tab, string> = {
  overview: "School overview",
  staff: "Staff & whole-school",
  classes: "Classes",
  guide: "What you can do",
  promises: "Promises & procedures",
  audit: "Audit log",
  billing: "Billing",
};

// Shared with the panes so a card looks the same wherever it is rendered.
export const CARD: React.CSSProperties = {
  background: "#FFFDF7",
  border: "2px solid #E4DCC8",
  borderRadius: 14,
  padding: "16px 18px",
};
