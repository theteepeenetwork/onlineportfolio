// The avatar bubble colours a child's tile is tinted with. Purely decorative —
// assigned round-robin by position in the class, never derived from anything
// about the child. Lives here (not in a "use server" module) so both the
// roster-add and class-import actions can share one palette; a server-action
// file may only export async functions.
export const AVATAR_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#10b981",
  "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899",
] as const;

/** The colour for the child at `index` in a class roster. */
export function avatarColorAt(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}
