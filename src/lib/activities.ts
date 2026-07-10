// Parse a JSON string array (tags / template page paths); tolerant of nulls.
export function jsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? (a as string[]) : [];
  } catch {
    return [];
  }
}

// Plain shapes passed from the server pages to the client components.
export type ClassInfo = {
  id: string;
  name: string;
  students: { id: string; name: string; avatarColor: string }[];
};

export type RunSummary = {
  id: string;
  className: string;
  wholeClass: boolean;
  status: "LIVE" | "CLOSED";
  createdAt: string;
  assigned: number;
  turnedIn: number;
  waiting: number;
};
