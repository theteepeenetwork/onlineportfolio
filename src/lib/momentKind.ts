import type { IconName } from "@/components/icons/Icon";

// How each kind of moment is drawn wherever one is shown small — the queue row,
// the "just added" tiles on Journals. One map, so a drawing is the same honey
// square with the same pencil on every screen.
export const MOMENT_KIND: Record<string, { label: string; bg: string; icon: IconName }> = {
  PHOTO: { label: "photo", bg: "#DEEAF3", icon: "camera" },
  DRAWING: { label: "drawing", bg: "#FBEED3", icon: "draw" },
  TEXT: { label: "their words", bg: "#F7E0E6", icon: "write" },
  AUDIO: { label: "voice", bg: "#EAF4F1", icon: "voice" },
};

export const momentKind = (type: string) => MOMENT_KIND[type] ?? MOMENT_KIND.PHOTO;
