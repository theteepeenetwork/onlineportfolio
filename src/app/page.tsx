import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { JarLogo } from "@/components/storyjar/JarLogo";
import { HeroJar } from "@/components/storyjar/HeroJar";
import { ScrollFill } from "@/components/storyjar/ScrollFill";
import { Icon } from "@/components/icons/Icon";
import { avatarInk } from "@/lib/avatar";

// The StoryJar marketing homepage.
//
// Bespoke marketing layout, so it uses inline `style` objects against the CSS
// variables in globals.css rather than utility classes — but anything that
// repeats (buttons, cards, the focus ring, the hover lifts, every animation)
// comes from the shared `.sj-*` / `.v2-*` classes there, because those are what
// the single reduced-motion guard and the a11y gate know about.
//
// Two things here are load-bearing rather than decorative, and both are
// SAFEGUARDING rule 18: the pupil door in the nav is the only element aimed at
// someone who may not read, so it keeps its 64px floor and its jar mark; and the
// hero's scroll-fill has three bail-outs (reduced motion, narrow, SHORT) because
// the sticky stage clips anything taller than the viewport, permanently.

// Fluid horizontal gutter / vertical rhythm shared by every landing section.
const GUTTER = "clamp(20px, 5vw, 56px)";
const SECTION_PAD = "clamp(80px, 10vw, 120px)";

const NAV_LINK: React.CSSProperties = {
  font: "700 15px var(--font-atkinson)",
  textDecoration: "none",
  color: "var(--ink)",
  padding: "12px 0", // 44px adult touch box
  whiteSpace: "nowrap",
};
// Centred section heading, used by "How it works", pricing and the FAQ.
const SECTION_H2: React.CSSProperties = {
  margin: 0,
  font: "600 clamp(34px, 5.4vw, 54px)/1.08 var(--font-fredoka)",
  letterSpacing: "-0.02em",
  textAlign: "center",
};
const FEATURE_KICKER: React.CSSProperties = {
  margin: "0 0 12px",
  font: "700 14px var(--font-atkinson)",
  color: "var(--glass-ink)", // AA contrast for small text (F11)
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};
const FEATURE_H2: React.CSSProperties = {
  margin: 0,
  font: "600 clamp(30px, 4.6vw, 44px)/1.1 var(--font-fredoka)",
  letterSpacing: "-0.02em",
};
const FEATURE_P: React.CSSProperties = {
  margin: "18px 0 0",
  font: "400 18px/1.6 var(--font-atkinson)",
  color: "var(--ink-soft)",
};
const FEATURE_ROW: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 64,
  alignItems: "center",
};
// The information pill that closes feature rows 1 and 2: one geometry, two tints.
const INFO_PILL: React.CSSProperties = {
  margin: "22px 0 0",
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  border: "3px solid var(--ink)",
  borderRadius: 999,
  padding: "8px 18px",
  font: "700 15px var(--font-atkinson)",
};
const ACTIVITY_ROW: React.CSSProperties = {
  background: "var(--cream)",
  border: "3px solid var(--ink)",
  borderRadius: 14,
  padding: "16px 20px",
  display: "flex",
  alignItems: "center",
  gap: 14,
  boxShadow: "0 4px 0 rgba(34,48,74,0.12)",
};
const QUEUE_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  background: "var(--paper)",
  border: "2px solid var(--calm-border)", // the calm register, for dense lists
  borderRadius: 12,
  padding: "11px 12px",
};

// The three "How it works" steps. The numbered disc is filled per step.
const STEPS: { n: string; name: string; disc: string; h: string; p: string }[] = [
  {
    n: "1",
    name: "Make",
    disc: "var(--honey)",
    h: "A photo, a drawing, a voice note, their own words",
    p: "Four icons, one tap each. A three-year-old gets there on their own.",
  },
  {
    n: "2",
    name: "Approve",
    disc: "var(--glass-light)",
    h: "You see every moment first",
    // Rule 1 string: reword for age if you must, never lose the meaning.
    p: "Approve it, tag a skill, or send it back with a kind note. Nothing is kept until you have seen it.",
  },
  {
    n: "3",
    name: "Treasure",
    disc: "var(--pink)",
    h: "A year of evidence, child by child",
    p: "Dated, skill-tagged, ready for leadership, moderation or a proud family.",
  },
];

const ACTIVITIES: {
  icon: "draw" | "camera" | "voice" | "write";
  title: string;
  meta: string;
  chip: string;
  chipBg: string;
  chipInk: string;
  dim?: boolean;
}[] = [
  { icon: "draw", title: "Label the parts of a plant", meta: "Science · worksheet template", chip: "Class 2M · live", chipBg: "var(--glass-light)", chipInk: "var(--glass-ink)" },
  { icon: "camera", title: "Show me your best pattern", meta: "Maths · photo response", chip: "4 waiting", chipBg: "var(--honey-tint)", chipInk: "var(--honey-ink)" },
  { icon: "voice", title: "Read your sentence out loud", meta: "Phonics · voice response", chip: "Class 2M · live", chipBg: "var(--glass-light)", chipInk: "var(--glass-ink)" },
  { icon: "write", title: "News from my weekend", meta: "Writing · reused from last year", chip: "In library", chipBg: "#EFEAE0", chipInk: "#6B7690", dim: true },
];

const PROMISES = [
  {
    chip: "Promise one",
    chipBg: "var(--honey)",
    tilt: "-1.5deg",
    // States a capability rather than an absence, per docs/brand-and-copy.md.
    // The safeguarding meaning is identical to the old "No child emails or
    // passwords. Ever." and must stay identical.
    h: "Children sign in with a code and their own name",
    p: "A short class code, then they tap their name. First names only, so there is nothing to forget and nothing to leak.",
  },
  {
    chip: "Promise two",
    chipBg: "var(--pink)",
    tilt: "1deg",
    h: "Nothing exists until you approve it",
    p: "Every moment passes through your queue before it joins a child's jar. You are the gatekeeper, by design, always.",
  },
  {
    chip: "Promise three",
    chipBg: "#7FC4BB",
    tilt: "-1deg",
    h: "UK GDPR, and your data stays in Europe",
    p: "Built for UK schools' obligations from day one, with a data agreement ready for your office and export or deletion on request.",
  },
  {
    chip: "Promise four",
    chipBg: "var(--kraft)",
    tilt: "1.5deg",
    h: "Built by a serving UK primary teacher",
    p: "Made by someone who does the school run, the marking and the moderation meetings. It exists because the classroom needed it.",
  },
];

const TEACHER_FEATURES = [
  "Every class you teach",
  "Unlimited moments and approvals",
  "Canvas, photos, voice and words",
  "Families see approved work",
  "Export your data whenever you like",
];

// The bands stay on the page, verbatim. "Prices are the price" only reads as
// honest because a reader can check it right here (docs/pricing-decisions.md).
// StoryJar is not VAT registered: never add "+ VAT".
const PRICE_BANDS: [string, string][] = [
  ["Up to 105 pupils", "£199"],
  ["Up to 210 pupils", "£299"],
  ["Up to 420 pupils", "£449"],
  ["Over 420 pupils", "£649"],
];

// EVERY LINE HERE IS A CAPABILITY THAT EXISTS TODAY. "Year-end transfer and
// whole-school export" sat in this list until 2 September 2026 and neither was
// built (docs/paid-tier-plan.md, items 1 and 3): no rollover or move-up logic
// exists, and export is teacher-scoped with no admin route. It was a dead-end
// paragraph when it was written and it is now one press above a live checkout,
// which changes what it is. Both go back when they ship, and not before.
const SCHOOL_FEATURES = [
  "Everything in the teacher plan, for all your staff",
  "Oversight for leadership across the school",
  "Staff, classes and an audit log in one admin console",
  "Work stays with the school when staff move on",
  "A data agreement naming the school as controller",
  "Pay by card or invoice and PO",
];

const FAQS = [
  {
    // The one place a flat "No" survives: it answers a parent's yes/no question.
    q: "Do children need email addresses or passwords?",
    a: "No, never. Children sign in with your class code and by tapping their own name. We store first names only: no surnames, no emails, no dates of birth.",
  },
  {
    q: "Can anything reach a child's jar before I see it?",
    a: "No. Every moment a child makes waits in your approval queue. You approve it, tag it, or send it back with a note, and it is kept once you say so.",
  },
  {
    q: "Does it count as assessment evidence?",
    a: "That is the point of it. Every approved moment is dated and can be tagged against skills, building a per-child evidence base across the year for leadership, moderators or Ofsted.",
  },
  {
    q: "What devices does it work on?",
    a: "Anything with a browser. Child screens are designed for classroom iPads in landscape first, and the teacher side works beautifully on a laptop, including at 8pm on the sofa.",
  },
  {
    q: "Where is the data stored?",
    a: "In Europe, in Amsterdam, under UK GDPR. A data processing agreement and a full sub-processor list are available for your school office, and you can export or delete your class's data at any time.",
  },
  {
    q: "When can parents see the jar?",
    a: "A read-only family view is on the roadmap. Parents see their own child's approved moments only, and you switch it on when you are ready.",
  },
];

const FOOTER_LINKS: [string, string][] = [
  ["/legal/privacy", "Privacy"],
  ["/legal/cookies", "Cookies"],
  ["/legal/safeguarding", "Safeguarding"],
  ["/legal/terms", "Terms"],
  ["/legal/acceptable-use", "Acceptable use"],
  ["/legal/accessibility", "Accessibility"],
  ["/legal", "All policies"],
  ["/family", "Family sign in"],
  ["/login/student", "Pupil sign in"],
];

// A jar for the "Treasure" card, at the JarLogo geometry, filling up across the
// three. `tiles` are [x, y, fill, rotation] on the 100×130 grid.
function TreasureJar({ tiles }: { tiles: [number, number, string, number][] }) {
  return (
    <svg width="52" height="70" viewBox="0 0 100 130" aria-hidden="true">
      <rect x="26" y="4" width="48" height="14" rx="7" fill="var(--kraft)" stroke="var(--ink)" strokeWidth="4" />
      <path
        d="M30,20 L70,20 L70,30 C82,36 86,46 86,58 L86,104 Q86,120 70,120 L30,120 Q14,120 14,104 L14,58 C14,46 18,36 30,30 Z"
        fill="var(--glass-jar)"
        stroke="var(--ink)"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      {tiles.map(([x, y, fill, r]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="18" height="18" rx="4" fill={fill} transform={`rotate(${r} ${x + 9} ${y + 9})`} />
      ))}
    </svg>
  );
}

// A felt-tip standing in the canvas mock's pen tray.
function FeltTip({ x, y, fill }: { x: number; y: number; fill: string }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect y="14" width="26" height="70" rx="8" fill={fill} stroke="#22304A" strokeWidth="4" />
      <path d="M13,-8 L24,14 L2,14 Z" fill="#F3E3C3" stroke="#22304A" strokeWidth="4" strokeLinejoin="round" />
    </g>
  );
}

// Marketing landing page for StoryJar.
export default async function Home() {
  // Returning teachers/children skip the marketing page and go to their app.
  const user = await getCurrentUser();
  if (user?.role === "TEACHER") redirect("/teacher");
  if (user?.role === "STUDENT") redirect("/student");

  return (
    <main
      className="sj"
      style={{
        fontFamily: "var(--font-atkinson)",
        color: "var(--ink)",
        background: "var(--paper)",
        width: "100%",
      }}
    >
      <ScrollFill />

      {/* ═══════════ HERO (tall track; sticky stage; jar fills on scroll) ═══════════ */}
      {/* Do not give an ancestor of this an `overflow` that creates a scroll
          container (auto / hidden / scroll). Sticky positions against the
          nearest scrollport, so the stage would silently stop sticking and the
          jar would never fill. Nothing on the page overflows sideways as it
          stands (the tilts all sit inside padded, max-width containers); if
          something ever does, clip THAT section, not <main>. */}
      <section id="hero-track" className="hero-track" style={{ height: "230vh", position: "relative" }}>
        <div className="hero-sticky" style={{ position: "sticky", top: 0, height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <nav style={{ display: "flex", alignItems: "center", gap: 28, padding: `20px ${GUTTER}`, flexWrap: "wrap" }}>
            <a href="#hero-track" style={{ display: "flex", alignItems: "center", gap: 10, marginRight: "auto", textDecoration: "none" }}>
              <JarLogo width={32} height={38} />
              <span style={{ font: "600 25px var(--font-fredoka)", letterSpacing: "-0.01em", color: "var(--ink)" }}>storyjar</span>
            </a>
            {/* Anchor links hide below 640px; both sign-in pills stay. */}
            <span className="nav-links" style={{ display: "contents" }}>
              <a href="#how" style={NAV_LINK}>How it works</a>
              <a href="#safeguarding" style={NAV_LINK}>Safeguarding</a>
              <a href="#pricing" style={NAV_LINK}>Pricing</a>
              <a href="#faq" style={NAV_LINK}>FAQ</a>
            </span>
            {/* A child on a fresh classroom iPad has to be able to get in on
                their own — every dead end here is an adult interruption. The
                pupil door comes first and is the bigger of the two. */}
            <Link href="/login/student" className="sj-btn-door">
              <JarLogo width={22} height={26} />
              I&apos;m a pupil
            </Link>
            <Link
              href="/login/teacher"
              className="sj-btn-outline"
              style={{ border: "3px solid var(--ink)", padding: "11px 22px", whiteSpace: "nowrap" }}
            >
              Teacher sign in
            </Link>
          </nav>

          <div className="hero-grid" style={{ flex: 1, display: "grid", gridTemplateColumns: "1.02fr 0.98fr", gap: 20, alignItems: "center", padding: `0 ${GUTTER} 30px`, maxWidth: 1280, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
            <div>
              <p style={{ margin: "0 0 16px", display: "inline-flex", alignItems: "center", background: "var(--glass-light)", border: "3px solid var(--ink)", borderRadius: 999, padding: "6px 16px", font: "700 14px var(--font-atkinson)", color: "var(--ink)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                A learning journal for ages 3–11
              </p>
              <h1 style={{ margin: 0, font: "600 clamp(38px, 7vw, 72px)/1.02 var(--font-fredoka)", letterSpacing: "-0.02em" }}>
                Every child&apos;s story,{" "}
                <span style={{ position: "relative", whiteSpace: "nowrap" }}>
                  collected.
                  <svg width="100%" height="14" viewBox="0 0 320 14" preserveAspectRatio="none" style={{ position: "absolute", left: 0, bottom: -10 }} aria-hidden="true">
                    <path className="v2-underline" d="M5,9 Q80,3 160,8 T315,5" fill="none" stroke="var(--jam)" strokeWidth="6" strokeLinecap="round" />
                  </svg>
                </span>
              </h1>
              <p style={{ margin: "30px 0 0", font: "400 clamp(18px, 2.2vw, 21px)/1.55 var(--font-atkinson)", maxWidth: "26em", color: "var(--ink-soft)" }}>
                Photos, drawings, voice notes and their own words go in the jar. You see every one, and you decide what stays.
              </p>
              <div style={{ display: "flex", gap: 14, marginTop: 34, alignItems: "center", flexWrap: "wrap" }}>
                <Link
                  href="/signup/teacher"
                  className="sj-btn-jam"
                  style={{ font: "700 19px var(--font-atkinson)", padding: "17px 32px", boxShadow: "0 5px 0 var(--jam-deep)", whiteSpace: "nowrap" }}
                >
                  Start your class jar
                </Link>
                <a
                  href="#how"
                  className="sj-btn-outline"
                  style={{ border: "3px solid var(--glass)", color: "var(--glass-ink)", padding: "15px 26px", font: "700 17px var(--font-atkinson)", whiteSpace: "nowrap" }}
                >
                  See how it works →
                </a>
              </div>
              <p style={{ margin: "26px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
                Free for teachers, permanently · Built by a serving UK primary teacher
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div className="hero-jar-wrap" style={{ position: "relative" }}>
                <HeroJar />
              </div>
              <p data-scroll-cue="true" style={{ margin: "14px 0 0", font: "700 15px var(--font-atkinson)", color: "var(--sj-muted)", transition: "opacity 0.4s" }}>
                Scroll to fill the jar ↓
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ HOW IT WORKS ═══════════ */}
      <section id="how" style={{ padding: `${SECTION_PAD} ${GUTTER} clamp(40px, 6vw, 60px)`, maxWidth: 1280, margin: "0 auto", boxSizing: "border-box" }}>
        <p className="sj-kicker" style={{ display: "block", textAlign: "center", margin: "0 0 14px" }}>How it works</p>
        <h2 style={SECTION_H2}>Three steps, all year.</h2>
        <p style={{ margin: "18px auto 0", font: "400 19px/1.55 var(--font-atkinson)", color: "var(--ink-soft)", textAlign: "center", maxWidth: "30em" }}>
          A child makes something. You see it. It joins their jar, dated and tagged.
        </p>
        {/* auto-fit lets the three cards wrap to two/one column on narrow
            screens so the row never overflows (supersedes the F13 fix). */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: 28, marginTop: 60 }}>
          {STEPS.map((step, i) => (
            <div key={step.n} className="sj-card v2-lift" style={{ borderRadius: 20, padding: "30px 28px 34px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 999, background: step.disc, border: "3px solid var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", font: "600 22px var(--font-fredoka)", color: "var(--ink)" }}>
                  {step.n}
                </span>
                <span style={{ font: "600 26px var(--font-fredoka)" }}>{step.name}</span>
              </div>

              {/* 1 · Make — the four ways in, one tile each. */}
              {i === 0 && (
                <div style={{ display: "flex", gap: 10, margin: "26px 0 22px", flexWrap: "wrap" }}>
                  <div style={{ width: 62, height: 62, borderRadius: 12, background: "var(--glass-jar)", border: "3px solid var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="32" height="32" viewBox="0 0 30 30" aria-hidden="true">
                      <rect x="3" y="9" width="24" height="16" rx="4" fill="none" stroke="#22304A" strokeWidth="3" />
                      <path d="M10,9 L12,5 L18,5 L20,9" fill="none" stroke="#22304A" strokeWidth="3" strokeLinejoin="round" />
                      <circle cx="15" cy="17" r="4.5" fill="none" stroke="#37796F" strokeWidth="3" />
                    </svg>
                  </div>
                  <div style={{ width: 62, height: 62, borderRadius: 12, background: "var(--honey-tint)", border: "3px solid var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="32" height="32" viewBox="0 0 30 30" aria-hidden="true">
                      <path d="M6,24 L8,17 L21,4 L26,9 L13,22 L6,24 Z" fill="none" stroke="#22304A" strokeWidth="3" strokeLinejoin="round" />
                      <path d="M18,7 L23,12" stroke="#BD3F63" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div style={{ width: 62, height: 62, borderRadius: 12, background: "#F7E0E6", border: "3px solid var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="32" height="32" viewBox="0 0 30 30" aria-hidden="true">
                      <path d="M15,6 C11,6 8,9 8,13 C8,17 11,20 15,20 L15,25 C15,25 22,22 22,13 C22,9 19,6 15,6 Z" fill="none" stroke="#22304A" strokeWidth="3" strokeLinejoin="round" />
                      <path d="M12,13 L18,13" stroke="#BD3F63" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div style={{ width: 62, height: 62, borderRadius: 12, background: "var(--glass-light)", border: "3px solid var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ font: "600 26px var(--font-fredoka)", color: "var(--ink)" }}>Aa</span>
                  </div>
                </div>
              )}

              {/* 2 · Approve — one row of the queue, and the tick that clears it. */}
              {i === 1 && (
                <div style={{ margin: "26px 0 22px", background: "var(--paper)", border: "3px solid var(--ink)", borderRadius: 12, padding: "13px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--honey)", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ height: 8, width: "70%", background: "#D9D2C2", borderRadius: 4 }} />
                    <div style={{ height: 8, width: "45%", background: "#D9D2C2", borderRadius: 4, marginTop: 6 }} />
                  </div>
                  <svg width="32" height="32" viewBox="0 0 30 30" aria-hidden="true">
                    <circle cx="15" cy="15" r="13" fill="#37796F" />
                    <path d="M9,15 L13.5,20 L21,10" fill="none" stroke="#FFFDF7" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}

              {/* 3 · Treasure — the same jar, three times, filling up. */}
              {i === 2 && (
                <div style={{ margin: "26px 0 22px", display: "flex", gap: 10, alignItems: "flex-end" }}>
                  <TreasureJar tiles={[[24, 92, "var(--jam)", -6], [46, 96, "var(--honey)", 5]]} />
                  <TreasureJar tiles={[[24, 92, "var(--glass)", -6], [46, 96, "var(--pink)", 5], [34, 72, "var(--honey)", -3]]} />
                  <TreasureJar tiles={[[24, 92, "var(--blue)", -6], [46, 96, "var(--jam)", 5], [34, 72, "var(--green)", -3], [44, 52, "var(--honey)", 4]]} />
                </div>
              )}

              <h3 style={{ margin: "14px 0 0", font: "600 23px/1.2 var(--font-fredoka)" }}>{step.h}</h3>
              <p style={{ margin: "10px 0 0", font: "400 17px/1.55 var(--font-atkinson)", color: "var(--ink-soft)" }}>{step.p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════ FEATURES (alternating) ═══════════ */}
      <section style={{ padding: `clamp(40px, 6vw, 60px) ${GUTTER} 20px`, maxWidth: 1280, margin: "0 auto", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: SECTION_PAD }}>
        {/* ── Row 1 · the drawing canvas ───────────────────────────────────── */}
        <div className="feat-row" style={FEATURE_ROW}>
          <div>
            <p style={FEATURE_KICKER}>The drawing canvas</p>
            <h2 style={FEATURE_H2}>A pot of felt-tips, on a screen.</h2>
            <p style={FEATURE_P}>
              Full-screen and child-led. Pencils, pens and markers rise from the bottom edge, the chosen one lifted. A rainbow colour slider, shapes, text boxes, pages, undo. Four-year-olds find their way with the icons alone.
            </p>
            <p style={{ ...INFO_PILL, background: "var(--honey-tint)", color: "var(--honey-ink)" }}>
              Works with a finger, a stylus or a mouse
            </p>
          </div>
          <div className="sj-card" style={{ borderRadius: 20, padding: 16, position: "relative", minHeight: 320 }}>
            <div style={{ position: "absolute", inset: 16, borderRadius: 12, background: "var(--paper)", overflow: "hidden", border: "2px solid var(--calm-border)" }}>
              <svg width="100%" height="100%" viewBox="0 0 520 320" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                <path d="M90,150 C120,80 180,80 210,140 C240,200 300,200 330,130" fill="none" stroke="#BD3F63" strokeWidth="9" strokeLinecap="round" />
                <circle cx="410" cy="86" r="32" fill="#F0B441" />
                <g stroke="#F0B441" strokeWidth="8" strokeLinecap="round">
                  <path d="M410,36 L410,48" /><path d="M410,124 L410,136" />
                  <path d="M360,86 L372,86" /><path d="M448,86 L460,86" />
                </g>
                <rect x="80" y="206" width="72" height="54" fill="#37796F" rx="6" />
                <path d="M70,208 L116,172 L164,206" fill="none" stroke="#22304A" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
                {/* One pencil is mid-stroke, wandering the artboard on a loop. */}
                <g className="v2-pencil">
                  <g transform="translate(300,150)">
                    <rect x="0" y="0" width="22" height="86" rx="7" fill="#BD3F63" stroke="#22304A" strokeWidth="4" />
                    <path d="M11,-16 L21,0 L1,0 Z" fill="#F3E3C3" stroke="#22304A" strokeWidth="4" strokeLinejoin="round" />
                  </g>
                </g>
                <FeltTip x={190} y={254} fill="#37796F" />
                <FeltTip x={236} y={272} fill="#F0B441" />
                <FeltTip x={282} y={272} fill="#8AB9D6" />
                <FeltTip x={328} y={272} fill="#A6C979" />
              </svg>
              <div style={{ position: "absolute", top: 12, right: 12, background: "#37796F", color: "#FFFDF7", font: "600 17px var(--font-fredoka)", padding: "8px 20px", borderRadius: 999, border: "3px solid #22304A", boxShadow: "0 4px 0 #22304A" }}>
                Done!
              </div>
            </div>
          </div>
        </div>

        {/* ── Row 2 · photos and voice ─────────────────────────────────────── */}
        <div className="feat-row" style={FEATURE_ROW}>
          <div style={{ order: 2 }}>
            <p style={FEATURE_KICKER}>Photos and voice</p>
            <h2 style={FEATURE_H2}>Point, snap, popped in.</h2>
            <p style={FEATURE_P}>
              The junk model, the tricky maths on a whiteboard, the tower that took all of golden time. Captured on the classroom iPad in seconds, with a caption in the child&apos;s own words, typed or spoken.
            </p>
            <p style={{ ...INFO_PILL, background: "var(--glass-light)", color: "var(--ink)" }}>
              🔊 A voice note works before reading does
            </p>
          </div>
          {/* flexWrap beyond the design file: two fixed 214px polaroids cannot
              fit side-by-side under ~480px, so they stack rather than forcing
              sideways scroll. The imagery rule these two hold: warm, real,
              indoors, unstyled, children's hands and WORK rather than faces. */}
          <div style={{ order: 1, display: "flex", justifyContent: "center", gap: 22, alignItems: "center", flexWrap: "wrap", paddingBottom: 20 }}>
            <div className="v2-polaroid v2-polaroid-l" style={{ width: 214, background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 12, padding: "12px 12px 16px", transform: "rotate(-4deg)", boxShadow: "var(--pop-shadow)" }}>
              {/* `fill` inside a fixed 152px slot: the photograph is a 3:2
                  original and this is a cover crop, so next/image must not try
                  to honour the intrinsic ratio. */}
              <div style={{ position: "relative", width: "100%", height: 152, borderRadius: 6, overflow: "hidden" }}>
                <Image
                  src="/junk-model-rocket.png"
                  alt="A junk-model rocket made from a cardboard tube, foil and masking tape, on a classroom table"
                  fill
                  sizes="214px"
                  style={{ objectFit: "cover", objectPosition: "50% 42%" }}
                />
              </div>
              <p style={{ margin: "10px 0 0", font: "400 15px/1.45 var(--font-atkinson)", color: "var(--ink-soft)" }}>
                &ldquo;my rocket has 3 boosters because i want it to fly into space fast&rdquo;
              </p>
            </div>
            <div className="v2-polaroid v2-polaroid-r" style={{ width: 214, background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 12, padding: "12px 12px 16px", transform: "rotate(3deg)", boxShadow: "var(--pop-shadow)" }}>
              <div style={{ position: "relative", width: "100%", height: 152, borderRadius: 6, overflow: "hidden" }}>
                <Image
                  src="/whiteboard-maths-32-plus-13.png"
                  alt="A child's whiteboard showing 32 + 13 partitioned into tens and ones with base ten rods and cubes, worked down to 32 + 13 = 45"
                  fill
                  sizes="214px"
                  style={{ objectFit: "cover", objectPosition: "50% 50%" }}
                />
              </div>
              {/* A sentence a Year 2 can say in five seconds and would never
                  type. That is the case for voice notes, made by the artefact
                  rather than by a line of marketing copy. */}
              <p style={{ margin: "10px 0 0", font: "400 15px/1.45 var(--font-atkinson)", color: "var(--ink-soft)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, font: "700 12px var(--font-atkinson)", letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--glass-ink)", marginRight: 6 }}>
                  🔊 Voice
                </span>
                &ldquo;I did thirty and ten is forty, then two and three is five, so it&apos;s forty-five&rdquo;
              </p>
            </div>
          </div>
        </div>

        {/* ── Row 3 · activities ───────────────────────────────────────────── */}
        <div className="feat-row" style={FEATURE_ROW}>
          <div>
            <p style={FEATURE_KICKER}>Activities</p>
            <h2 style={FEATURE_H2}>Build it once, teach it every year.</h2>
            <p style={FEATURE_P}>
              A library of reusable activities: instructions, tags, and a worksheet or drawn template children work directly on top of. Assign to a whole class or a few children, then reassign next September in one tap. Teach more than one class and they all live under one roof.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {ACTIVITIES.map((a) => (
              <div
                key={a.title}
                className={a.dim ? undefined : "v2-lift-sm"}
                style={a.dim ? { ...ACTIVITY_ROW, opacity: 0.75 } : ACTIVITY_ROW}
              >
                <Icon name={a.icon} size={28} decorative />
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, font: "600 18px var(--font-fredoka)" }}>{a.title}</p>
                  <p style={{ margin: "2px 0 0", font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>{a.meta}</p>
                </div>
                <span style={{ background: a.chipBg, borderRadius: 999, padding: "5px 14px", font: "700 13px var(--font-atkinson)", color: a.chipInk, whiteSpace: "nowrap" }}>
                  {a.chip}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Row 4 · the approval queue ───────────────────────────────────── */}
        <div className="feat-row" style={FEATURE_ROW}>
          <div style={{ order: 2 }}>
            <p style={FEATURE_KICKER}>The approval queue</p>
            <h2 style={FEATURE_H2}>Marking, minus the pile.</h2>
            <p style={FEATURE_P}>
              Every submission waits in one queue, built to be cleared. Approve in two taps, tag skills as you go, send one back with a kind note, or clear the lot at 8pm with a cup of tea.
            </p>
          </div>
          {/* data-queue: ScrollFill sets data-queue-run once this scrolls into
              view and the rows settle in sequence. First names only, always. */}
          <div data-queue className="sj-card" style={{ order: 1, borderRadius: 20, padding: 22, position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ font: "600 20px var(--font-fredoka)" }}>Waiting for you · 3</span>
              <span style={{ font: "700 14px var(--font-atkinson)", color: "var(--glass-ink)" }}>Approve all ✓</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="v2-q-row-1" style={QUEUE_ROW}>
                <div style={{ width: 42, height: 42, borderRadius: 8, background: "#E08A9B", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ font: "600 18px var(--font-fredoka)", color: avatarInk("#E08A9B") }}>P</span>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, font: "700 15px var(--font-atkinson)" }}>Poppy · drawing</p>
                  <p style={{ margin: 0, font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>Label the parts of a plant</p>
                </div>
                <span className="v2-q-tick" style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--glass)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3,8 L6.5,12 L13,4" fill="none" stroke="#FFFDF7" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span style={{ width: 36, height: 36, borderRadius: "50%", border: "2px solid #C9C2B0", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7690", font: "700 15px var(--font-atkinson)" }}>↩</span>
              </div>
              <div className="v2-q-row-2" style={QUEUE_ROW}>
                <div style={{ width: 42, height: 42, borderRadius: 8, background: "#8AB9D6", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ font: "600 18px var(--font-fredoka)", color: avatarInk("#8AB9D6") }}>J</span>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, font: "700 15px var(--font-atkinson)" }}>Jesse · photo</p>
                  <p style={{ margin: 0, font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>Show me your best pattern</p>
                </div>
                <span style={{ background: "var(--glass-light)", borderRadius: 999, padding: "4px 10px", font: "700 12px var(--font-atkinson)", color: "var(--glass-ink)", whiteSpace: "nowrap" }}>Maths · pattern</span>
              </div>
              <div className="v2-q-row-3" style={QUEUE_ROW}>
                <div style={{ width: 42, height: 42, borderRadius: 8, background: "#A6C979", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ font: "600 18px var(--font-fredoka)", color: avatarInk("#A6C979") }}>A</span>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, font: "700 15px var(--font-atkinson)" }}>Amara · her words</p>
                  <p style={{ margin: 0, font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>News from my weekend</p>
                </div>
                <span style={{ font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)", whiteSpace: "nowrap" }}>2 taps</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ SAFEGUARDING ═══════════ */}
      <section id="safeguarding" style={{ background: "var(--ink)", color: "var(--paper)", padding: `${SECTION_PAD} ${GUTTER}`, marginTop: SECTION_PAD }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <p style={{ margin: "0 0 14px", font: "700 14px var(--font-atkinson)", color: "#9DD0C6", letterSpacing: "0.08em", textTransform: "uppercase" }}>Safeguarding</p>
          <div style={{ display: "flex", alignItems: "baseline", gap: 20, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, font: "600 clamp(34px, 5.4vw, 54px)/1.08 var(--font-fredoka)", letterSpacing: "-0.02em", color: "var(--paper)" }}>Our promises to your school.</h2>
            <span style={{ font: "400 18px var(--font-atkinson)", color: "#A9B4C9" }}>Not small print. The whole point.</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24, marginTop: 56 }}>
            {PROMISES.map((pr) => (
              <div key={pr.chip} style={{ border: "3px solid rgba(250,246,238,0.25)", borderRadius: 18, padding: 30 }}>
                <div style={{ display: "inline-block", background: pr.chipBg, color: "var(--ink)", border: "3px solid var(--ink)", borderRadius: 8, padding: "4px 14px", transform: `rotate(${pr.tilt})`, font: "600 16px var(--font-fredoka)" }}>{pr.chip}</div>
                <h3 style={{ margin: "20px 0 0", font: "600 26px/1.15 var(--font-fredoka)", color: "var(--paper)" }}>{pr.h}</h3>
                <p style={{ margin: "12px 0 0", font: "400 17px/1.6 var(--font-atkinson)", color: "#C4CDDD" }}>{pr.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ FAMILIES TEASER ═══════════ */}
      <section id="parents" style={{ padding: `${SECTION_PAD} ${GUTTER} 0`, maxWidth: 1280, margin: "0 auto", boxSizing: "border-box" }}>
        <div className="parents-grid" style={{ background: "#F3E9D8", border: "3px solid var(--ink)", borderRadius: 20, padding: "52px 56px", display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 40, alignItems: "center", boxShadow: "var(--pop-shadow)" }}>
          <div>
            <div style={{ display: "inline-block", background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 999, padding: "6px 18px", font: "600 15px var(--font-fredoka)", whiteSpace: "nowrap", transform: "rotate(-1.5deg)" }}>Coming soon</div>
            <h2 style={{ margin: "18px 0 0", font: "600 clamp(28px, 4.4vw, 40px)/1.15 var(--font-fredoka)", letterSpacing: "-0.02em" }}>Families watch the jar fill up from home</h2>
            <p style={{ margin: "14px 0 0", font: "400 18px/1.6 var(--font-atkinson)", color: "var(--ink-soft)" }}>
              A quiet, read-only view for parents and carers: only what you have approved, only their own child, and a heart is the whole channel back. On the roadmap alongside video, groups and scheduled activities.
            </p>
          </div>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end" }}>
            <div data-jar-jiggle="on" style={{ width: 132, transformOrigin: "50% 85%" }}>
              <svg width="132" height="164" viewBox="0 0 190 230" aria-hidden="true">
                <rect x="52" y="4" width="86" height="22" rx="11" fill="var(--kraft)" stroke="var(--ink)" strokeWidth="5" />
                <path d="M58,30 L132,30 L132,48 C156,58 164,76 164,100 L164,190 Q164,218 136,218 L54,218 Q26,218 26,190 L26,100 C26,76 34,58 58,48 Z" fill="var(--glass-jar)" stroke="var(--ink)" strokeWidth="6" strokeLinejoin="round" />
                <path d="M95,168 C71,150 74,130 86,128 C92,127 95,132 95,137 C95,132 98,127 104,128 C116,130 119,150 95,168 Z" fill="var(--jam)" />
                <path className="v2-tw" transform="translate(62,96) scale(0.6)" d="M0,-12 C2,-4 4,-2 12,0 C4,2 2,4 0,12 C-2,4 -4,2 -12,0 C-4,-2 -2,-4 0,-12 Z" fill="var(--honey)" />
                <path className="v2-tw v2-tw-c" transform="translate(130,88) scale(0.5) rotate(15)" d="M0,-12 C2,-4 4,-2 12,0 C4,2 2,4 0,12 C-2,4 -4,2 -12,0 C-4,-2 -2,-4 0,-12 Z" fill="var(--honey)" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ FOUNDER NOTE ═══════════ */}
      <section id="founder" style={{ padding: `${SECTION_PAD} ${GUTTER} 0`, maxWidth: 900, margin: "0 auto", boxSizing: "border-box" }}>
        {/* borderRadius 6 on purpose: this is a sheet of paper, not a card. */}
        <div style={{ position: "relative", background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 6, padding: "clamp(38px, 5vw, 54px) clamp(28px, 5vw, 56px)", boxShadow: "0 5px 0 rgba(34,48,74,0.15)" }}>
          <div style={{ position: "absolute", left: "50%", top: -14, transform: "translateX(-50%) rotate(-2deg)", width: 124, height: 28, background: "#E5A0B2", opacity: 0.85 }} />
          {/* This wording was set by the founder and it matters legally: it must
              not imply StoryJar was built, demoed or tested on school time. Do
              not reintroduce any claim of doing so in a class or a classroom. */}
          <p style={{ margin: 0, font: "400 clamp(18px, 2.4vw, 22px)/1.7 var(--font-atkinson)", color: "var(--ink)" }}>
            I teach in a primary school in the North East, and I built StoryJar in my own time, in the evenings and the holidays. The tools we were handed made evidence-gathering feel like admin, and the children&apos;s work deserved better than a folder on a shelf. Every decision in it comes from what a teacher actually needs at four o&apos;clock on a Thursday, with thirty book bags still to pack.
          </p>
          <p style={{ margin: "26px 0 0", font: "600 22px var(--font-fredoka)", color: "var(--glass-ink)" }}>
            Mark Pearson <span style={{ font: "400 17px var(--font-atkinson)", color: "var(--sj-muted)" }}>Creator of StoryJar</span>
          </p>
        </div>
      </section>

      {/* ═══════════ PRICING ═══════════ */}
      <section id="pricing" style={{ padding: `${SECTION_PAD} ${GUTTER} 0`, maxWidth: 1100, margin: "0 auto", boxSizing: "border-box" }}>
        <h2 style={SECTION_H2}>Free for you. £199 to £649 for your school.</h2>
        <p style={{ margin: "18px auto 0", font: "400 19px/1.55 var(--font-atkinson)", color: "var(--ink-soft)", textAlign: "center", maxWidth: "32em" }}>
          Every feature is in every band. Your band is set when you join and fixed for the year.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 30, marginTop: 56 }}>
          {/* Teacher */}
          <div style={{ background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 20, padding: "42px 40px", boxShadow: "var(--pop-shadow)" }}>
            <h3 style={{ margin: 0, font: "600 28px var(--font-fredoka)" }}>Teacher</h3>
            <p style={{ margin: "16px 0 0", font: "600 clamp(40px, 5.6vw, 50px) var(--font-fredoka)" }}>Free</p>
            <p style={{ margin: "4px 0 0", font: "400 16px var(--font-atkinson)", color: "var(--sj-muted)" }}>permanently · card-free, clock-free</p>
            <ul style={{ margin: "28px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12, font: "400 17px var(--font-atkinson)", color: "var(--ink-soft)" }}>
              {TEACHER_FEATURES.map((f) => (
                <li key={f} style={{ display: "flex", gap: 10 }}>
                  <span style={{ color: "var(--glass-ink)", fontWeight: 700 }}>✓</span> {f}
                </li>
              ))}
            </ul>
            <Link
              href="/signup/teacher"
              className="v2-lift-sm"
              style={{ display: "block", marginTop: 34, textAlign: "center", font: "700 17px var(--font-atkinson)", color: "var(--ink)", border: "3px solid var(--ink)", borderRadius: 999, padding: 15, textDecoration: "none", whiteSpace: "nowrap", boxShadow: "0 4px 0 var(--ink)" }}
            >
              Start your class jar
            </Link>
          </div>

          {/* School */}
          <div style={{ background: "var(--ink)", color: "var(--paper)", border: "3px solid var(--ink)", borderRadius: 20, padding: "42px 40px", position: "relative", boxShadow: "0 4px 0 rgba(34,48,74,0.3)" }}>
            <div style={{ position: "absolute", top: -16, right: 32, background: "var(--honey)", color: "var(--ink)", border: "3px solid var(--ink)", borderRadius: 999, padding: "5px 16px", font: "600 14px var(--font-fredoka)", transform: "rotate(2deg)" }}>Launch pricing</div>
            <h3 style={{ margin: 0, font: "600 28px var(--font-fredoka)", color: "var(--paper)" }}>School plan</h3>
            <p style={{ margin: "16px 0 0", font: "600 clamp(40px, 5.6vw, 50px) var(--font-fredoka)", color: "var(--paper)" }}>
              from £199 <span style={{ font: "400 17px var(--font-atkinson)", color: "#A9B4C9" }}>a year</span>
            </p>
            <p style={{ margin: "4px 0 0", font: "400 16px var(--font-atkinson)", color: "#A9B4C9" }}>banded by pupils on roll · prices are the price</p>
            <ul style={{ margin: "18px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6, font: "400 15px var(--font-atkinson)", color: "#C4CDDD" }}>
              {PRICE_BANDS.map(([band, price]) => (
                <li key={band} style={{ display: "flex", justifyContent: "space-between", gap: 12, borderBottom: "1px solid rgba(196,205,221,0.22)", paddingBottom: 5 }}>
                  <span>{band}</span><strong style={{ color: "var(--paper)" }}>{price}</strong>
                </li>
              ))}
            </ul>
            <ul style={{ margin: "26px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12, font: "400 17px var(--font-atkinson)", color: "#C4CDDD" }}>
              {SCHOOL_FEATURES.map((f) => (
                <li key={f} style={{ display: "flex", gap: 10 }}>
                  <span style={{ color: "var(--honey)", fontWeight: 700 }}>✓</span> {f}
                </li>
              ))}
            </ul>
            <Link
              href="/signup/teacher"
              className="sj-btn-jam"
              style={{ display: "block", marginTop: 34, textAlign: "center", font: "700 17px var(--font-atkinson)", padding: 15, whiteSpace: "nowrap", boxShadow: "0 5px 0 var(--jam-deep)" }}
            >
              Start with your school
            </Link>
            <p style={{ margin: "16px 0 0", font: "400 14px var(--font-atkinson)", color: "#A9B4C9" }}>
              Pay by card or purchase order. Full refund within 42 days if it isn’t right for your school.
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════ FAQ ═══════════ */}
      <section id="faq" style={{ padding: `${SECTION_PAD} ${GUTTER}`, maxWidth: 900, margin: "0 auto", boxSizing: "border-box" }}>
        <h2 style={{ ...SECTION_H2, margin: "0 0 44px" }}>Questions teachers ask.</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {FAQS.map((item) => (
            <details key={item.q} style={{ background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 14, padding: "20px 26px" }}>
              <summary style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, font: "600 20px var(--font-fredoka)", minHeight: 44 }}>
                {item.q}
                <span className="faq-chevron" style={{ font: "600 26px var(--font-fredoka)", color: "var(--jam)", transition: "transform 0.2s", flexShrink: 0 }}>+</span>
              </summary>
              <p style={{ margin: "14px 0 0", font: "400 17px/1.6 var(--font-atkinson)", color: "var(--ink-soft)" }}>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ═══════════ FINAL CTA + FOOTER ═══════════ */}
      <section style={{ background: "var(--ink)", color: "var(--paper)", padding: `clamp(60px, 8vw, 96px) ${GUTTER} 40px` }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ margin: 0, font: "600 clamp(34px, 5.4vw, 54px)/1.08 var(--font-fredoka)", letterSpacing: "-0.02em", color: "var(--paper)" }}>Start your class jar today.</h2>
          <p style={{ margin: "16px auto 0", font: "400 19px var(--font-atkinson)", color: "#A9B4C9", maxWidth: "30em" }}>
            Free for one teacher and every class they teach. Your children can pop their first moment in before home time.
          </p>
          <Link
            href="/signup/teacher"
            className="sj-btn-jam"
            style={{ marginTop: 32, font: "700 19px var(--font-atkinson)", padding: "18px 34px", boxShadow: "0 5px 0 var(--jam-deep)", whiteSpace: "nowrap" }}
          >
            Start your class jar
          </Link>
          <div style={{ marginTop: 70, paddingTop: 28, borderTop: "1px solid rgba(250,246,238,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px 24px", flexWrap: "wrap" }}>
              <span style={{ font: "600 18px var(--font-fredoka)", marginRight: 6 }}>storyjar</span>
              {FOOTER_LINKS.map(([href, label]) => (
                <Link key={href} href={href} style={{ font: "400 15px var(--font-atkinson)", color: "#A9B4C9", textDecoration: "none", padding: "12px 0", whiteSpace: "nowrap" }}>
                  {label}
                </Link>
              ))}
            </div>
            <p style={{ margin: "20px 0 0", font: "400 14px var(--font-atkinson)", color: "#6B7690", textAlign: "center" }}>
              StoryJar is a data processor for schools · Data kept in Europe · © 2026 StoryJar · storyjar.co.uk
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
