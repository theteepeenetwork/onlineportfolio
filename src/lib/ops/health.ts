// ---------------------------------------------------------------------------
// The vocabulary and the derived facts behind the service health pane (PR6).
// ---------------------------------------------------------------------------
//
// Deliberately free of `import "server-only"`, for the same reason
// src/lib/ops/enabled.ts is: a blocking spec has to be able to import this and
// check both branches of the deployment facts in-process, and a module
// carrying `server-only` throws the moment a Playwright test imports it. There
// is nothing secret in here. It reads four Railway variables, formats a date,
// and holds two words.
//
// WHY THE STATUS VOCABULARY IS EXACTLY TWO WORDS
//
// A health pane is almost entirely status, and status is the easiest thing in
// a product to fake. The failure mode the handbook names for this PR is a tile
// that renders calm because its feed is missing: a green light with no gate
// behind it, believed by somebody at seven in the morning who has ten schools
// waiting. So there is no "OK", no "healthy", no amber and no dot. A tile
// either has a signal, in which case it says so and shows the signal, or it
// says it is not monitored and then says why in a sentence.
//
// A third state ("degraded", "amber past 26 hours") is what brief 05 asks for
// once there are feeds to be late. Adding one is not a formatting change: it
// means deciding what a threshold is and what somebody does when it trips, and
// it belongs in the same PR as the feed it describes.
//
// COLOUR CARRIES NOTHING HERE, AND THAT IS NOT AN ACCESSIBILITY FOOTNOTE
//
// Handbook section 6 item 8 forbids status by colour alone, and this is the
// one screen in the product that is mostly status. Automated scanning cannot
// see the rule: a green dot at 7:1 contrast passes every check ever written
// and tells a colour-blind reader nothing. So the status IS the text, and
// tests/battery/a11y/ops-health-a11y.spec.ts reads the pane again with every
// author colour thrown away to prove nothing was lost.

/** A tile that has a real signal, and shows it. */
export const MONITORED = "Monitored here";

/**
 * A tile with no feed. The handbook's phrase, kept word for word, because it
 * is the gate for this PR: "Tiles with no feed render 'not monitored'".
 */
export const NOT_MONITORED = "Not monitored";

/** A fact this instance was never told. Never rendered as a blank. */
export const NOT_RECORDED = "Not recorded";

export type Fact = {
  term: string;
  value: string;
  /** Machine-readable timestamp, where the fact is a moment in time. */
  iso?: string;
};

// The operator is in the UK and the server is in Amsterdam, so the timezone is
// stated rather than inherited. A time rendered in the host's zone is wrong for
// an hour of every summer evening and wrong in a way nobody notices until they
// are comparing it against something else at midnight.
const LONDON = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function londonTimestamp(when: Date): string {
  return `${LONDON.format(when)} (UK time)`;
}

// Everything below is rendered on a phone at 390px, and two of these values
// arrive from outside this codebase. Trimmed and capped so a surprising value
// is a truncated line rather than a page that scrolls sideways.
function tidy(value: string | undefined, max = 60): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/**
 * The seven characters an operator actually compares against GitHub, plus the
 * branch it came from.
 *
 * `RAILWAY_GIT_COMMIT_MESSAGE` is available beside these and is deliberately
 * not read. It is free text written by whoever made the commit, this screen is
 * not where anybody should be reading it, and a commit message in this product
 * can quite easily name a child.
 */
function commitLabel(env: Record<string, string | undefined>): string {
  const sha = tidy(env.RAILWAY_GIT_COMMIT_SHA, 40);
  if (!sha) return NOT_RECORDED;
  const short = sha.slice(0, 7);
  const branch = tidy(env.RAILWAY_GIT_BRANCH, 40);
  return branch ? `${short} on ${branch}` : short;
}

/**
 * What this running process can say about itself, in the order an operator
 * asks it: how long has it been up, is it the version I deployed, and which
 * environment am I actually looking at.
 *
 * Every one of these comes from Railway's own variables or from this process,
 * so nothing here needs an API credential. Brief 01 and the handbook both
 * refuse a Railway API key in the app, and this is the reason it is not needed
 * for the facts that are worth having.
 *
 * An absent variable reads as "Not recorded" rather than as an empty gap,
 * because a blank beside a label is indistinguishable from a bug and somebody
 * will spend ten minutes finding out which it was.
 */
export function instanceFacts(env: Record<string, string | undefined>, startedAt: Date): Fact[] {
  return [
    { term: "Running since", value: londonTimestamp(startedAt), iso: startedAt.toISOString() },
    { term: "Deployed commit", value: commitLabel(env) },
    { term: "Environment", value: tidy(env.RAILWAY_ENVIRONMENT_NAME) ?? NOT_RECORDED },
    { term: "Region", value: tidy(env.RAILWAY_REPLICA_REGION) ?? NOT_RECORDED },
  ];
}

/** "3 hours 12 minutes", or "48 seconds" while it is still that new. */
export function uptimeLabel(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  if (whole < 60) return `${whole} second${whole === 1 ? "" : "s"}`;
  const minutes = Math.floor(whole / 60) % 60;
  const hours = Math.floor(whole / 3600) % 24;
  const days = Math.floor(whole / 86400);
  const parts: string[] = [];
  if (days) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  if (hours) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (minutes && !days) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" ") : "under a minute";
}

/**
 * How long the database took to answer, in words a tired person can read at a
 * glance. Sub-millisecond is the normal answer for a local SQLite file, and
 * saying "under a millisecond" is more honest than rounding it to 0.
 */
export function answerTimeLabel(ms: number): string {
  if (ms < 1) return "in under a millisecond";
  return `in ${Math.round(ms)} ms`;
}
