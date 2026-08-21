// What a piece of work is CALLED.
//
// Three names compete, and the order matters more than it looks:
//
//   1. the activity the teacher set it from  ("Look at this")
//   2. the child's own caption               ("my best one")
//   3. a generic fallback by type            ("My drawing")
//
// The activity wins. A teacher who names an activity has named the work, and a
// child rarely captions assigned work at all — so reading the caption first
// meant assigned work fell straight through to the generic fallback and every
// quiz in a jar was called "My drawing". A teacher looking for "Look at this"
// could not find it, and the app appeared to have renamed their activity.
//
// It also makes the jar agree with the family space, which has always led with
// the activity title: the same moment should not have two different names
// depending on who is looking at it.
//
// Free choice work has no activity, so the child's caption leads there — which
// is the case the caption was made for.
export function momentTitle(
  item: { caption: string | null; assignment?: { title: string } | null },
  fallback: string,
): string {
  const activity = item.assignment?.title?.trim();
  if (activity) return activity;
  const caption = item.caption?.trim();
  if (caption) return caption;
  return fallback;
}
