import Link from "next/link";

// The root not-found boundary: what anybody sees for a URL that matches no
// route, anywhere in StoryJar.
//
// WHY THIS IS ROOT-LEVEL AND NOT SCOPED TO A SUBTREE.
//
// `src/app/student/not-found.tsx` covers the child's own area, and Next resolves
// a not-found boundary up the segment tree from the matched route — so it can
// only ever catch `/student/*`. Everything else fell through to the framework's
// default "404 | This page could not be found.", which reads at adult level,
// offers nothing to tap, and leaves whoever met it stuck.
//
// The persona team found it by fuzzing `/ops`, but `/ops` is not the problem. A
// child mistypes `/studnet` or `/teachar`; a parent follows a link from a letter
// printed last term. Those miss `/student/*` entirely. This fixes the class.
//
// THREE CONSTRAINTS, each of which rules something out:
//
//   No session. This page renders for somebody with no account, an expired
//   cookie, or a child who is signed in — so it cannot read an age mode, a
//   register or a role, and must not try. The younger, plainer wording is the
//   right default when the reader is unknown.
//
//   It says nothing about what does or does not exist. Not "that page has
//   moved", not "you may not have access", not a list of places to go instead.
//   `/ops` in particular must not be confirmed to a child who mistyped: the
//   operator area answers notFound() to everyone who is not an operator
//   precisely so that its existence is not discoverable, and a helpful "did you
//   mean the operations console?" would give that away on the one page designed
//   to be reached by accident.
//
//   One way out, and it is the front door. `/` is the only destination every
//   reader of this page can use; a "back to your jar" link would be a dead end
//   for a parent and a hint about the product's shape for everybody else.
//
// AND IT IS CALLED "BACK TO THE START", not "go to the start", which is not a
// preference. The persona sweep judges a way back by the ACCESSIBLE NAME of the
// controls on the page, against the words a child actually navigates by —
// back, home, jar, journal, my work, close, done, bye. The first version of
// this page said "Go to the start", offered a real way out, and was still
// reported by the Wriggler as stranding a child: "There is no way back to
// somewhere I recognise — no back, no home, no jar." A four-year-old does not
// read "the start" as somewhere they have been. "Back" is the word.
//
// Sized and coloured for the youngest reader who can reach it: Atkinson body,
// Fredoka heading, and a 64px target (SAFEGUARDING rule 18, the child floor)
// rather than the 44px adult one, because the child floor also clears the adult.
export default function NotFound() {
  return (
    <main
      style={{
        fontFamily: "var(--font-atkinson)",
        color: "var(--ink)",
        background: "var(--paper)",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "40px 20px",
      }}
    >
      <h1
        style={{
          margin: "0 0 12px",
          font: "600 clamp(32px, 6vw, 52px) var(--font-fredoka)",
          color: "#37796f",
        }}
      >
        We can&apos;t find that page
      </h1>
      <p
        style={{
          margin: "0 0 32px",
          font: "400 clamp(18px, 2.8vw, 24px)/1.5 var(--font-atkinson)",
          color: "var(--ink-soft)",
          maxWidth: 460,
        }}
      >
        That link didn&apos;t work. The button below takes you back to the start.
      </p>
      <Link
        href="/"
        style={{
          minHeight: 64,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          font: "600 clamp(18px, 2.6vw, 24px) var(--font-fredoka)",
          color: "var(--paper)",
          background: "var(--jam)",
          border: "3px solid var(--ink)",
          borderRadius: 999,
          padding: "14px 40px",
          textDecoration: "none",
          boxShadow: "0 5px 0 var(--jam-deep)",
        }}
      >
        Back to the start
      </Link>
    </main>
  );
}
