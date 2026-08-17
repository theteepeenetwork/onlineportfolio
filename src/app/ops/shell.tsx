import Link from "next/link";
import { opsSignOut } from "@/app/actions/ops/session";

// The frame every operator screen renders inside: a bar that says which hat you
// are wearing, the three links, sign out, and a standing statement of what this
// area cannot do.
//
// WHY THIS IS A COMPONENT AND NOT src/app/ops/layout.tsx
//
// A layout under src/app/ops/ wraps the sign-in door as well as the console,
// and the door is the one screen here that renders for somebody who is not
// signed in yet. A layout carrying requireOperator() would therefore answer 404
// to every attempt to sign in. The alternative, a layout with a weaker guard,
// is worse: the blindness gate is explicit that the guard must be the first
// statement of the function that does the work, "not of an ancestor", because a
// Server Action is a POST endpoint reachable with a crafted request and a
// layout does not run for it. So the frame is a plain component that each
// guarded page renders, and the guard stays where it can be relied on.
//
// WHY TWO COMPONENTS AND NO WRAPPER
//
// A wrapper would take a `children` prop, and the blindness gate refuses the
// identifier `children` anywhere under the ops roots, because on a Parent it is
// the linked-children relation that ruling R11 bans in either direction. The
// gate cannot tell React's prop from Prisma's relation and should not try: the
// word is banned, and the cost of avoiding it is one extra line per page. That
// is the gate working, not the gate being awkward.
//
// The bar is deliberately unlike the teacher product: dark, plain, and labelled
// in words. Distinctness never rests on colour alone, which is why the label
// says "Storyjar operations" rather than being a differently coloured logo.

export const OPS_LINKS = [
  { href: "/ops", label: "Today" },
  { href: "/ops/schools", label: "Schools" },
  { href: "/ops/billing", label: "Billing" },
  { href: "/ops/mail", label: "Mail" },
  { href: "/ops/lookup", label: "Find an adult" },
  { href: "/ops/health", label: "Health" },
] as const;

export type OpsPath = (typeof OPS_LINKS)[number]["href"];

export function OpsBar({ current }: { current: OpsPath }) {
  return (
    <header style={{ background: "var(--ink)", color: "var(--paper)" }}>
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <p className="font-display text-base" style={{ color: "var(--paper)" }}>
          Storyjar operations
        </p>
        <nav aria-label="Operations" className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {OPS_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={link.href === current ? "page" : undefined}
              style={{
                color: "var(--paper)",
                textDecoration: "underline",
                textUnderlineOffset: "4px",
                fontWeight: link.href === current ? 700 : 400,
                minHeight: 44,
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <form action={opsSignOut} className="ms-auto">
          <button
            type="submit"
            style={{
              color: "var(--paper)",
              background: "transparent",
              border: "2px solid var(--paper)",
              borderRadius: 999,
              padding: "0.35rem 1rem",
              minHeight: 44,
              fontWeight: 600,
            }}
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}

// Real text, in the DOM, on every operator page. Not a tooltip, and not
// dismissible. It is the promise a school's data protection lead is given,
// written where the person who might one day add a helpful thumbnail will read
// it.
export function OpsFootnote() {
  return (
    <footer className="mx-auto w-full max-w-4xl px-4 pb-10">
      <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
        This area cannot open any child&rsquo;s name, work, or sign-in details. It shows registered
        schools, the adults who work at them, and parents who have asked for an account. Figures about
        pupils are whole-school totals only, and small ones are not shown at all. (SAFEGUARDING.md
        rules 4, 5 and 11.)
      </p>
    </footer>
  );
}
