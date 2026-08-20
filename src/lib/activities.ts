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

// The picture to show for a template, or null when there is nothing worth
// showing.
//
// Not simply `pages[0]`. That is the BACKGROUND handed back to the editor: it
// deliberately leaves out the movable pieces (they would appear twice on
// reopening) and never carries the question boxes at all. A template built from
// those alone therefore saved a blank white page — and a blank page is a
// truthy string, so every `thumb ? …` check passed and a teacher got a white
// rectangle that read as "it didn't save".
//
// So: the picture if there is one; otherwise the background, but ONLY when we
// know the background is the whole story. When a template carries pieces or
// questions and has no picture — a row saved before pictures existed — the
// background is known to be unrepresentative, and a designed card saying what
// the activity IS beats a white rectangle.
export function templateThumb(t: {
  previewPathsJson: string | null;
  templatePathsJson: string | null;
  objectsJson: string | null;
  quizJson: string | null;
}): string | null {
  const preview = jsonArray(t.previewPathsJson)[0];
  if (preview) return preview;
  const carriesMore = Boolean(t.objectsJson) || Boolean(t.quizJson);
  return carriesMore ? null : jsonArray(t.templatePathsJson)[0] ?? null;
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
