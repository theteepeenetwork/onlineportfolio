// A short, kind relative-day label for "last active" lines on teacher screens:
// "today" / "yesterday" / "3 days ago" / "2 weeks ago", falling back to a plain
// date for anything older. Compared by calendar day, not 24h windows.
export function relativeDay(date: Date, now: Date = new Date()): string {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
