import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { JarLogo } from "@/components/storyjar/JarLogo";
import { HeroJar } from "@/components/storyjar/HeroJar";
import { ScrollFill } from "@/components/storyjar/ScrollFill";

const NAV_LINK: React.CSSProperties = {
  font: "700 15px var(--font-atkinson)",
  textDecoration: "none",
  color: "var(--ink)",
};
const SECTION_H2: React.CSSProperties = {
  margin: 0,
  font: "600 44px var(--font-fredoka)",
  textAlign: "center",
};
const FEATURE_KICKER: React.CSSProperties = {
  margin: "0 0 12px",
  font: "700 14px var(--font-atkinson)",
  color: "var(--glass-ink)", // AA contrast for small text (F11)
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};
const FEATURE_H2: React.CSSProperties = { margin: 0, font: "600 38px/1.15 var(--font-fredoka)" };
const FEATURE_P: React.CSSProperties = {
  margin: "18px 0 0",
  font: "400 18px/1.6 var(--font-atkinson)",
  color: "var(--ink-soft)",
};

const PROMISES = [
  { chip: "Promise one", chipBg: "#F0B441", tilt: "-1.5deg", h: "No child emails or passwords. Ever.", p: "Children sign in with a class code and by tapping their own name. First names only — no surnames, no accounts, nothing to forget or leak." },
  { chip: "Promise two", chipBg: "#E08A9B", tilt: "1deg", h: "Nothing exists until you approve it", p: "Every single moment passes through your approval queue before it joins a child's jar. You are the gatekeeper, by design, always." },
  { chip: "Promise three", chipBg: "#7FC4BB", tilt: "-1deg", h: "UK GDPR, data kept in the UK/EU", p: "Built for UK schools' obligations from day one: UK GDPR compliant, data stored in the UK/EU, and a DPA ready for your office." },
  { chip: "Promise four", chipBg: "#C9A87C", tilt: "1.5deg", h: "Built by a serving UK primary teacher", p: "Storyjar is made by someone who does the school run, the marking and the moderation meetings. It exists because the classroom needed it." },
];

const FAQS = [
  { q: "Do children need email addresses or passwords?", a: "No — never. Children sign in with your class code and by tapping their own name. We only store first names; no surnames, emails, or dates of birth." },
  { q: "Can anything go into a child's jar without me seeing it?", a: "No. Every moment a child makes waits in your approval queue. You approve it, tag it, or send it back with a note — nothing is kept without your say-so." },
  { q: "Does it count as assessment evidence?", a: "That's the point of it. Every approved moment is dated and can be tagged against skills, building a per-child evidence base across the year you can show leadership, moderators, or Ofsted." },
  { q: "What devices does it work on?", a: "Anything with a browser. Child screens are designed for classroom iPads in landscape first; the teacher side works beautifully on a laptop — including at 8pm on the sofa." },
  { q: "Where is the data stored?", a: "In the UK/EU, under UK GDPR. A data processing agreement is available for your school office, and you can export or delete your class's data at any time." },
  { q: "When can parents see the jar?", a: "A read-only family view is on the roadmap. Parents will only ever see their own child's approved moments — and you'll switch it on when you're ready." },
];

// Marketing landing page for Storyjar.
export default async function Home() {
  // Returning teachers/children skip the marketing page and go to their app.
  const user = await getCurrentUser();
  if (user?.role === "TEACHER") redirect("/teacher");
  if (user?.role === "STUDENT") redirect("/student");

  return (
    <main
      className="sj"
      style={{ fontFamily: "var(--font-atkinson)", color: "var(--ink)", background: "var(--paper)", width: "100%" }}
    >
      <ScrollFill />

      {/* ═══════════ HERO (tall track; sticky stage; jar fills on scroll) ═══════════ */}
      <section id="hero-track" style={{ height: "220vh", position: "relative" }}>
        <div style={{ position: "sticky", top: 0, height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <nav style={{ display: "flex", alignItems: "center", gap: 30, padding: "22px 56px", flexWrap: "wrap" }}>
            <a href="#hero-track" style={{ display: "flex", alignItems: "center", gap: 10, marginRight: "auto", textDecoration: "none" }}>
              <JarLogo />
              <span style={{ font: "600 24px var(--font-fredoka)", letterSpacing: "-0.01em", color: "var(--ink)" }}>storyjar</span>
            </a>
            <a href="#how" style={NAV_LINK}>How it works</a>
            <a href="#safeguarding" style={NAV_LINK}>Safeguarding</a>
            <a href="#pricing" style={NAV_LINK}>Pricing</a>
            <a href="#faq" style={NAV_LINK}>FAQ</a>
            <Link href="/login/teacher" className="sj-btn-outline">Teacher sign in</Link>
          </nav>

          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 24, alignItems: "center", padding: "0 56px 40px", maxWidth: 1280, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
            <div>
              <p style={{ margin: "0 0 18px", display: "inline-block", font: "700 14px var(--font-atkinson)", color: "#37796f", letterSpacing: "0.08em", textTransform: "uppercase" }}>A class journal for ages 3–7</p>
              <h1 style={{ margin: 0, font: "600 62px/1.05 var(--font-fredoka)", letterSpacing: "-0.015em" }}>
                Every child&apos;s story,{" "}
                <span style={{ position: "relative", whiteSpace: "nowrap" }}>
                  collected.
                  <svg width="100%" height="12" viewBox="0 0 300 12" preserveAspectRatio="none" style={{ position: "absolute", left: 0, bottom: -8 }} aria-hidden="true">
                    <path d="M4,8 Q75,2 150,7 T296,5" fill="none" stroke="#C2476B" strokeWidth="5" strokeLinecap="round" />
                  </svg>
                </span>
              </h1>
              <p style={{ margin: "26px 0 0", font: "400 20px/1.55 var(--font-atkinson)", maxWidth: "30em", color: "var(--ink-soft)" }}>
                A journal and portfolio for your class. Children pop their photos, drawings and words into the jar — and nothing is kept until you&apos;ve seen it.
              </p>
              <div style={{ display: "flex", gap: 14, marginTop: 34, alignItems: "center", flexWrap: "wrap" }}>
                <Link href="/signup/teacher" className="sj-btn-jam">Start your class jar</Link>
                <a href="#how" style={{ font: "700 18px var(--font-atkinson)", color: "var(--ink)", textDecoration: "none", padding: "16px 22px" }}>See how it works →</a>
              </div>
              <p style={{ margin: "26px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>Built by a serving UK primary teacher · No child emails or passwords, ever</p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <HeroJar />
              <p data-scroll-cue="true" style={{ margin: "10px 0 0", font: "700 15px var(--font-atkinson)", color: "var(--sj-muted)", transition: "opacity 0.4s" }}>Scroll to fill the jar ↓</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ HOW IT WORKS ═══════════ */}
      <section id="how" style={{ padding: "110px 56px", maxWidth: 1280, margin: "0 auto", boxSizing: "border-box", overflowX: "clip" }}>
        <h2 style={SECTION_H2}>How the jar fills up</h2>
        <p style={{ margin: "14px auto 0", font: "400 19px/1.5 var(--font-atkinson)", color: "var(--ink-soft)", textAlign: "center", maxWidth: "34em" }}>Three small steps, over and over, all year. That&apos;s it.</p>
        {/* minmax(0,1fr) lets the cards shrink below their content width on narrow
            screens (e.g. iPad portrait) so the row never overflows — FINDINGS F13. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 32, marginTop: 56 }}>
          {/* 1 · Make */}
          <div className="sj-card" style={{ padding: "34px 30px" }}>
            <div style={{ display: "inline-block", background: "#F3E3C3", border: "3px solid #22304A", borderRadius: 8, padding: "4px 14px", transform: "rotate(-2deg)", font: "600 17px var(--font-fredoka)" }}>1 · Make</div>
            <div style={{ display: "flex", gap: 10, margin: "24px 0" }}>
              <div style={{ width: 58, height: 58, borderRadius: 12, background: "#EAF4F1", border: "3px solid #22304A", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><rect x="3" y="9" width="24" height="16" rx="4" fill="none" stroke="#22304A" strokeWidth="3" /><path d="M10,9 L12,5 L18,5 L20,9" fill="none" stroke="#22304A" strokeWidth="3" strokeLinejoin="round" /><circle cx="15" cy="17" r="4.5" fill="none" stroke="#37796f" strokeWidth="3" /></svg>
              </div>
              <div style={{ width: 58, height: 58, borderRadius: 12, background: "#FBEED3", border: "3px solid #22304A", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><path d="M6,24 L8,17 L21,4 L26,9 L13,22 L6,24 Z" fill="none" stroke="#22304A" strokeWidth="3" strokeLinejoin="round" /><path d="M18,7 L23,12" stroke="#C2476B" strokeWidth="3" strokeLinecap="round" /></svg>
              </div>
              <div style={{ width: 58, height: 58, borderRadius: 12, background: "#F7E0E6", border: "3px solid #22304A", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ font: "600 26px var(--font-fredoka)", color: "#22304A" }}>Aa</span>
              </div>
            </div>
            <h3 style={{ margin: 0, font: "600 24px var(--font-fredoka)" }}>A photo, a drawing, or their own words</h3>
            <p style={{ margin: "10px 0 0", font: "400 17px/1.55 var(--font-atkinson)", color: "var(--ink-soft)" }}>Children choose how to capture their work — no reading needed, no accounts, just tap and make.</p>
          </div>
          {/* 2 · Approve */}
          <div className="sj-card" style={{ padding: "34px 30px" }}>
            <div style={{ display: "inline-block", background: "#D8ECE8", border: "3px solid #22304A", borderRadius: 8, padding: "4px 14px", transform: "rotate(1.5deg)", font: "600 17px var(--font-fredoka)" }}>2 · Approve</div>
            <div style={{ margin: "24px 0", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, background: "#FAF6EE", border: "3px solid #22304A", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: "#F0B441", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ height: 8, width: "70%", background: "#D9D2C2", borderRadius: 4 }} />
                  <div style={{ height: 8, width: "45%", background: "#D9D2C2", borderRadius: 4, marginTop: 6 }} />
                </div>
                <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="13" fill="#37796f" /><path d="M9,15 L13.5,20 L21,10" fill="none" stroke="#FFFDF7" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
            </div>
            <h3 style={{ margin: 0, font: "600 24px var(--font-fredoka)" }}>You see every moment first</h3>
            <p style={{ margin: "10px 0 0", font: "400 17px/1.55 var(--font-atkinson)", color: "var(--ink-soft)" }}>Nothing joins a child&apos;s jar until you&apos;ve approved it — tag a skill as you go, or send it back with a kind note. That&apos;s the safety promise, built in.</p>
          </div>
          {/* 3 · Treasure */}
          <div className="sj-card" style={{ padding: "34px 30px" }}>
            <div style={{ display: "inline-block", background: "#F7E0E6", border: "3px solid #22304A", borderRadius: 8, padding: "4px 14px", transform: "rotate(-1deg)", font: "600 17px var(--font-fredoka)" }}>3 · Treasure</div>
            <div style={{ margin: "24px 0", display: "flex", gap: 8, alignItems: "flex-end" }}>
              <svg width="44" height="60" viewBox="0 0 100 130" aria-hidden="true"><rect x="26" y="4" width="48" height="14" rx="7" fill="#C9A87C" /><path d="M30,20 L70,20 L70,30 C82,36 86,46 86,58 L86,104 Q86,120 70,120 L30,120 Q14,120 14,104 L14,58 C14,46 18,36 30,30 Z" fill="#EAF4F1" stroke="#22304A" strokeWidth="5" strokeLinejoin="round" /><rect x="24" y="92" width="18" height="18" rx="4" fill="#C2476B" transform="rotate(-6 33 101)" /><rect x="46" y="96" width="18" height="18" rx="4" fill="#F0B441" transform="rotate(5 55 105)" /></svg>
              <svg width="44" height="60" viewBox="0 0 100 130" aria-hidden="true"><rect x="26" y="4" width="48" height="14" rx="7" fill="#C9A87C" /><path d="M30,20 L70,20 L70,30 C82,36 86,46 86,58 L86,104 Q86,120 70,120 L30,120 Q14,120 14,104 L14,58 C14,46 18,36 30,30 Z" fill="#EAF4F1" stroke="#22304A" strokeWidth="5" strokeLinejoin="round" /><rect x="24" y="92" width="18" height="18" rx="4" fill="#37796f" transform="rotate(-6 33 101)" /><rect x="46" y="96" width="18" height="18" rx="4" fill="#E08A9B" transform="rotate(5 55 105)" /><rect x="34" y="72" width="18" height="18" rx="4" fill="#F0B441" transform="rotate(-3 43 81)" /></svg>
              <svg width="44" height="60" viewBox="0 0 100 130" aria-hidden="true"><rect x="26" y="4" width="48" height="14" rx="7" fill="#C9A87C" /><path d="M30,20 L70,20 L70,30 C82,36 86,46 86,58 L86,104 Q86,120 70,120 L30,120 Q14,120 14,104 L14,58 C14,46 18,36 30,30 Z" fill="#EAF4F1" stroke="#22304A" strokeWidth="5" strokeLinejoin="round" /><rect x="24" y="92" width="18" height="18" rx="4" fill="#8AB9D6" transform="rotate(-6 33 101)" /><rect x="46" y="96" width="18" height="18" rx="4" fill="#C2476B" transform="rotate(5 55 105)" /><rect x="34" y="72" width="18" height="18" rx="4" fill="#A6C979" transform="rotate(-3 43 81)" /><rect x="44" y="52" width="18" height="18" rx="4" fill="#F0B441" transform="rotate(4 53 61)" /></svg>
            </div>
            <h3 style={{ margin: 0, font: "600 24px var(--font-fredoka)" }}>A year of evidence, child by child</h3>
            <p style={{ margin: "10px 0 0", font: "400 17px/1.55 var(--font-atkinson)", color: "var(--ink-soft)" }}>Every approved moment joins that child&apos;s jar — dated, skill-tagged, and ready to show leadership, Ofsted, or a proud family.</p>
          </div>
        </div>
      </section>

      {/* ═══════════ FEATURES (alternating) ═══════════ */}
      <section style={{ padding: "20px 56px 40px", maxWidth: 1280, margin: "0 auto", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 110 }}>
        {/* canvas */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
          <div>
            <p style={FEATURE_KICKER}>The drawing canvas</p>
            <h2 style={FEATURE_H2}>A canvas that feels like a pot of felt-tips</h2>
            <p style={FEATURE_P}>Full-screen and child-led: pencils, pens and markers rise from the bottom edge, a rainbow colour slider, shapes, text boxes and pages. Four-year-olds find their way without a single word of instructions.</p>
          </div>
          <div className="sj-card" style={{ padding: 18, position: "relative", minHeight: 300 }}>
            <div style={{ position: "absolute", inset: 18, borderRadius: 10, background: "#FAF6EE", overflow: "hidden" }}>
              <svg width="100%" height="100%" viewBox="0 0 520 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                <path d="M90,150 C120,80 180,80 210,140 C240,200 300,200 330,130" fill="none" stroke="#C2476B" strokeWidth="9" strokeLinecap="round" />
                <circle cx="400" cy="90" r="34" fill="#F0B441" />
                <g stroke="#F0B441" strokeWidth="8" strokeLinecap="round"><path d="M400,38 L400,50" /><path d="M400,130 L400,142" /><path d="M348,90 L360,90" /><path d="M440,90 L452,90" /></g>
                <rect x="80" y="200" width="70" height="52" fill="#37796f" rx="6" />
                <path d="M70,202 L115,168 L162,200" fill="none" stroke="#22304A" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
                <g transform="translate(180,244)"><rect x="0" y="14" width="26" height="66" rx="8" fill="#C2476B" stroke="#22304A" strokeWidth="4" /><path d="M13,-8 L24,14 L2,14 Z" fill="#F3E3C3" stroke="#22304A" strokeWidth="4" strokeLinejoin="round" /></g>
                <g transform="translate(226,262)"><rect x="0" y="14" width="26" height="66" rx="8" fill="#37796f" stroke="#22304A" strokeWidth="4" /><path d="M13,-8 L24,14 L2,14 Z" fill="#F3E3C3" stroke="#22304A" strokeWidth="4" strokeLinejoin="round" /></g>
                <g transform="translate(272,262)"><rect x="0" y="14" width="26" height="66" rx="8" fill="#F0B441" stroke="#22304A" strokeWidth="4" /><path d="M13,-8 L24,14 L2,14 Z" fill="#F3E3C3" stroke="#22304A" strokeWidth="4" strokeLinejoin="round" /></g>
                <g transform="translate(318,262)"><rect x="0" y="14" width="26" height="66" rx="8" fill="#8AB9D6" stroke="#22304A" strokeWidth="4" /><path d="M13,-8 L24,14 L2,14 Z" fill="#F3E3C3" stroke="#22304A" strokeWidth="4" strokeLinejoin="round" /></g>
              </svg>
              <div style={{ position: "absolute", top: 12, right: 12, background: "#37796f", color: "#FFFDF7", font: "600 17px var(--font-fredoka)", padding: "8px 20px", borderRadius: 999, border: "3px solid #22304A" }}>Done!</div>
            </div>
          </div>
        </div>

        {/* photos */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
          <div style={{ order: 2 }}>
            <p style={FEATURE_KICKER}>Photos</p>
            <h2 style={FEATURE_H2}>Point, snap, pop it in</h2>
            <p style={FEATURE_P}>The junk-model, the tricky maths on a whiteboard, the tower that took all of golden time — captured on the classroom iPad in seconds, with an optional caption in the child&apos;s own words.</p>
          </div>
          <div style={{ order: 1, display: "flex", justifyContent: "center", gap: 20, alignItems: "center" }}>
            <div style={{ width: 210, background: "#FFFDF7", border: "3px solid #22304A", borderRadius: 12, padding: "12px 12px 16px", transform: "rotate(-4deg)", boxShadow: "var(--pop-shadow)" }}>
              <div style={{ height: 150, borderRadius: 6, background: "repeating-linear-gradient(45deg, #EAF4F1, #EAF4F1 12px, #E0EEE9 12px, #E0EEE9 24px)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ font: "400 12px/1.4 monospace", color: "#37796f", textAlign: "center" }}>photo of a<br />junk model</span></div>
              <p style={{ margin: "10px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--ink-soft)" }}>&ldquo;my rocket has 3 boosters&rdquo;</p>
            </div>
            <div style={{ width: 210, background: "#FFFDF7", border: "3px solid #22304A", borderRadius: 12, padding: "12px 12px 16px", transform: "rotate(3deg)", boxShadow: "var(--pop-shadow)" }}>
              <div style={{ height: 150, borderRadius: 6, background: "repeating-linear-gradient(45deg, #FBEED3, #FBEED3 12px, #F6E4BE 12px, #F6E4BE 24px)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ font: "400 12px/1.4 monospace", color: "#A8854F", textAlign: "center" }}>photo of<br />whiteboard maths</span></div>
              <p style={{ margin: "10px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--ink-soft)" }}>&ldquo;I did it a new way&rdquo;</p>
            </div>
          </div>
        </div>

        {/* activities */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
          <div>
            <p style={FEATURE_KICKER}>Activities</p>
            <h2 style={FEATURE_H2}>Set an activity once, use it every year</h2>
            <p style={FEATURE_P}>Build a library of reusable activities — instructions, tags, even a worksheet or drawn template children work directly on top of. Assign to the whole class or a few children, then reassign next September in one tap. And if you teach more than one class, they all live under one roof.</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: "#FFFDF7", border: "3px solid #22304A", borderRadius: 14, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 4px 0 rgba(34,48,74,0.12)" }}>
              <span style={{ fontSize: 26 }} aria-hidden="true">🖍</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, font: "600 18px var(--font-fredoka)" }}>Label the parts of a plant</p>
                <p style={{ margin: "2px 0 0", font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>Science · worksheet template</p>
              </div>
              <span style={{ background: "#D8ECE8", borderRadius: 999, padding: "5px 14px", font: "700 13px var(--font-atkinson)", color: "#2E6B64" }}>Class 2M · live</span>
            </div>
            <div style={{ background: "#FFFDF7", border: "3px solid #22304A", borderRadius: 14, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 4px 0 rgba(34,48,74,0.12)" }}>
              <span style={{ fontSize: 26 }} aria-hidden="true">📷</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, font: "600 18px var(--font-fredoka)" }}>Show me your best pattern</p>
                <p style={{ margin: "2px 0 0", font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>Maths · photo response</p>
              </div>
              <span style={{ background: "#FBEED3", borderRadius: 999, padding: "5px 14px", font: "700 13px var(--font-atkinson)", color: "#8A5F1E" }}>4 waiting</span>
            </div>
            <div style={{ background: "#FFFDF7", border: "3px solid #22304A", borderRadius: 14, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 4px 0 rgba(34,48,74,0.12)", opacity: 0.75 }}>
              <span style={{ fontSize: 26 }} aria-hidden="true">⌨</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, font: "600 18px var(--font-fredoka)" }}>News from my weekend</p>
                <p style={{ margin: "2px 0 0", font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>Writing · reused from last year</p>
              </div>
              <span style={{ background: "#EFEAE0", borderRadius: 999, padding: "5px 14px", font: "700 13px var(--font-atkinson)", color: "#6B7690" }}>In library</span>
            </div>
          </div>
        </div>

        {/* approval queue */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
          <div style={{ order: 2 }}>
            <p style={FEATURE_KICKER}>The approval queue</p>
            <h2 style={FEATURE_H2}>Marking, minus the pile</h2>
            <p style={FEATURE_P}>Every submission waits calmly in one queue. Approve in two taps, tag skills as you go, send back with a kind note, or batch-approve the lot at 8pm with a cup of tea. Works beautifully on a laptop.</p>
          </div>
          <div className="sj-card" style={{ order: 1, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ font: "600 18px var(--font-fredoka)" }}>Waiting for you · 3</span>
              <span style={{ font: "700 14px var(--font-atkinson)", color: "#2E6B64" }}>Approve all ✓</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#FAF6EE", border: "2px solid #E4DCC8", borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ width: 42, height: 42, borderRadius: 8, background: "#E08A9B", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ font: "600 18px var(--font-fredoka)", color: "#FFFDF7" }}>P</span></div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, font: "700 15px var(--font-atkinson)" }}>Poppy · drawing</p>
                  <p style={{ margin: 0, font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>Label the parts of a plant</p>
                </div>
                <span style={{ width: 34, height: 34, borderRadius: "50%", background: "#37796f", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3,8 L6.5,12 L13,4" fill="none" stroke="#FFFDF7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                <span style={{ width: 34, height: 34, borderRadius: "50%", border: "2px solid #C9C2B0", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7690", font: "700 15px var(--font-atkinson)" }}>↩</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#FAF6EE", border: "2px solid #E4DCC8", borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ width: 42, height: 42, borderRadius: 8, background: "#8AB9D6", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ font: "600 18px var(--font-fredoka)", color: "#FFFDF7" }}>J</span></div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, font: "700 15px var(--font-atkinson)" }}>Jesse · photo</p>
                  <p style={{ margin: 0, font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>Show me your best pattern</p>
                </div>
                <span style={{ background: "#D8ECE8", borderRadius: 999, padding: "4px 10px", font: "700 12px var(--font-atkinson)", color: "#2E6B64" }}>Maths · pattern</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#FAF6EE", border: "2px solid #E4DCC8", borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ width: 42, height: 42, borderRadius: 8, background: "#A6C979", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ font: "600 18px var(--font-fredoka)", color: "#FFFDF7" }}>A</span></div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, font: "700 15px var(--font-atkinson)" }}>Amara · her words</p>
                  <p style={{ margin: 0, font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>News from my weekend</p>
                </div>
                <span style={{ font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>2 taps to approve</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ SAFEGUARDING ═══════════ */}
      <section id="safeguarding" style={{ background: "#22304A", color: "#FAF6EE", padding: "110px 56px", marginTop: 110 }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, font: "600 44px var(--font-fredoka)", color: "#FAF6EE" }}>Our promises to your school</h2>
            <span style={{ font: "400 17px var(--font-atkinson)", color: "#A9B4C9" }}>Not small print. The whole point.</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 26, marginTop: 52 }}>
            {PROMISES.map((pr) => (
              <div key={pr.chip} style={{ border: "3px solid rgba(250,246,238,0.25)", borderRadius: 16, padding: 30 }}>
                <div style={{ display: "inline-block", background: pr.chipBg, color: "#22304A", borderRadius: 8, padding: "4px 14px", transform: `rotate(${pr.tilt})`, font: "600 16px var(--font-fredoka)" }}>{pr.chip}</div>
                <h3 style={{ margin: "18px 0 0", font: "600 26px var(--font-fredoka)", color: "#FAF6EE" }}>{pr.h}</h3>
                <p style={{ margin: "10px 0 0", font: "400 17px/1.6 var(--font-atkinson)", color: "#C4CDDD" }}>{pr.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ PARENTS TEASER + ROADMAP ═══════════ */}
      <section id="parents" style={{ padding: "110px 56px 0", maxWidth: 1280, margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ background: "#F3E9D8", border: "3px solid #22304A", borderRadius: 20, padding: "48px 56px", display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 40, alignItems: "center", boxShadow: "var(--pop-shadow)" }}>
          <div>
            <div style={{ display: "inline-block", background: "#FFFDF7", border: "3px solid #22304A", borderRadius: 999, padding: "5px 16px", font: "600 15px var(--font-fredoka)", transform: "rotate(-1.5deg)" }}>Coming soon</div>
            <h2 style={{ margin: "16px 0 0", font: "600 36px/1.2 var(--font-fredoka)" }}>One day, families will watch the jar fill up from home</h2>
            <p style={{ margin: "14px 0 0", font: "400 18px/1.6 var(--font-atkinson)", color: "var(--ink-soft)" }}>A gentle, read-only view for parents and carers — only what you&apos;ve approved, only their own child. On the roadmap alongside voice &amp; video recording, groups, and scheduled activities.</p>
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <svg width="180" height="220" viewBox="0 0 190 230" aria-hidden="true">
              <rect x="52" y="4" width="86" height="22" rx="11" fill="#C9A87C" stroke="#22304A" strokeWidth="5" />
              <path d="M58,30 L132,30 L132,48 C156,58 164,76 164,100 L164,190 Q164,218 136,218 L54,218 Q26,218 26,190 L26,100 C26,76 34,58 58,48 Z" fill="#EAF4F1" stroke="#22304A" strokeWidth="6" strokeLinejoin="round" />
              <path d="M95,168 C71,150 74,130 86,128 C92,127 95,132 95,137 C95,132 98,127 104,128 C116,130 119,150 95,168 Z" fill="#C2476B" />
              <path transform="translate(62,96) scale(0.6)" d="M0,-12 C2,-4 4,-2 12,0 C4,2 2,4 0,12 C-2,4 -4,2 -12,0 C-4,-2 -2,-4 0,-12 Z" fill="#F0B441" />
              <path transform="translate(130,88) scale(0.5) rotate(15)" d="M0,-12 C2,-4 4,-2 12,0 C4,2 2,4 0,12 C-2,4 -4,2 -12,0 C-4,-2 -2,-4 0,-12 Z" fill="#F0B441" />
            </svg>
          </div>
        </div>
      </section>

      {/* ═══════════ FOUNDER NOTE ═══════════ */}
      <section id="founder" style={{ padding: "110px 56px 0", maxWidth: 900, margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ position: "relative", background: "#FFFDF7", border: "3px solid #22304A", borderRadius: 6, padding: "52px 56px", boxShadow: "0 5px 0 rgba(34,48,74,0.15)" }}>
          <div style={{ position: "absolute", left: "50%", top: -14, transform: "translateX(-50%) rotate(-2deg)", width: 120, height: 28, background: "#E5A0B2", opacity: 0.85 }} />
          <p style={{ margin: 0, font: "400 21px/1.7 var(--font-atkinson)", color: "#22304A" }}>I built Storyjar in my own Year 2 classroom in the North East, because the tools we were given made evidence-gathering feel like admin, and the children&apos;s work deserved better than a folder on a shelf. Every feature here has been tested by the toughest review panel there is: thirty six-year-olds and one very tired teacher on a Thursday afternoon.</p>
          <p style={{ margin: "26px 0 0", font: "600 22px var(--font-fredoka)", color: "#37796f" }}>— A Year 2 teacher in the North East</p>
        </div>
      </section>

      {/* ═══════════ PRICING ═══════════ */}
      <section id="pricing" style={{ padding: "110px 56px 0", maxWidth: 1100, margin: "0 auto", boxSizing: "border-box" }}>
        <h2 style={SECTION_H2}>Simple, honest launch pricing</h2>
        <p style={{ margin: "14px auto 0", font: "400 18px var(--font-atkinson)", color: "var(--ink-soft)", textAlign: "center", maxWidth: "32em" }}>Start free with one class. Grow when your school does.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginTop: 52 }}>
          <div style={{ background: "#FFFDF7", border: "3px solid #22304A", borderRadius: 20, padding: "42px 40px", boxShadow: "var(--pop-shadow)" }}>
            <h3 style={{ margin: 0, font: "600 28px var(--font-fredoka)" }}>One class jar</h3>
            <p style={{ margin: "16px 0 0", font: "600 46px var(--font-fredoka)" }}>Free</p>
            <p style={{ margin: "4px 0 0", font: "400 16px var(--font-atkinson)", color: "var(--sj-muted)" }}>forever, for one class</p>
            <ul style={{ margin: "26px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12, font: "400 17px var(--font-atkinson)", color: "var(--ink-soft)" }}>
              {["One teacher, one class", "Unlimited moments & approvals", "Drawing canvas, photos & words", "Class code sign-in for children"].map((f) => (
                <li key={f} style={{ display: "flex", gap: 10 }}><span style={{ color: "#2E6B64", fontWeight: 700 }}>✓</span> {f}</li>
              ))}
            </ul>
            <Link href="/signup/teacher" style={{ display: "block", marginTop: 34, textAlign: "center", font: "700 17px var(--font-atkinson)", color: "#22304A", border: "3px solid #22304A", borderRadius: 999, padding: 14, textDecoration: "none" }}>Start your class jar</Link>
          </div>
          <div style={{ background: "#22304A", color: "#FAF6EE", border: "3px solid #22304A", borderRadius: 20, padding: "42px 40px", position: "relative", boxShadow: "0 4px 0 rgba(34,48,74,0.3)" }}>
            <div style={{ position: "absolute", top: -16, right: 32, background: "#F0B441", color: "#22304A", border: "3px solid #22304A", borderRadius: 999, padding: "5px 16px", font: "600 14px var(--font-fredoka)", transform: "rotate(2deg)" }}>Launch pricing</div>
            <h3 style={{ margin: 0, font: "600 28px var(--font-fredoka)", color: "#FAF6EE" }}>School plan</h3>
            <p style={{ margin: "16px 0 0", font: "600 46px var(--font-fredoka)", color: "#FAF6EE" }}>£4.99 <span style={{ font: "400 17px var(--font-atkinson)", color: "#A9B4C9" }}>per teacher / month</span></p>
            <p style={{ margin: "4px 0 0", font: "400 16px var(--font-atkinson)", color: "#A9B4C9" }}>billed annually · final pricing confirmed at launch</p>
            <ul style={{ margin: "26px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12, font: "400 17px var(--font-atkinson)", color: "#C4CDDD" }}>
              {["Every class you teach, one roof", "Reusable activity library & worksheets", "Skill tagging & evidence reports", "Priority support from a real teacher"].map((f) => (
                <li key={f} style={{ display: "flex", gap: 10 }}><span style={{ color: "#F0B441", fontWeight: 700 }}>✓</span> {f}</li>
              ))}
            </ul>
            <Link href="/signup/teacher" style={{ display: "block", marginTop: 34, textAlign: "center", font: "700 17px var(--font-atkinson)", color: "#FAF6EE", background: "#C2476B", borderRadius: 999, padding: 14, textDecoration: "none", boxShadow: "0 4px 0 #93304F" }}>Start with your school</Link>
          </div>
        </div>
      </section>

      {/* ═══════════ FAQ ═══════════ */}
      <section id="faq" style={{ padding: "110px 56px", maxWidth: 860, margin: "0 auto", boxSizing: "border-box" }}>
        <h2 style={{ margin: "0 0 40px", font: "600 44px var(--font-fredoka)", textAlign: "center" }}>Questions teachers ask</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {FAQS.map((item) => (
            <details key={item.q} style={{ background: "#FFFDF7", border: "3px solid #22304A", borderRadius: 14, padding: "20px 26px" }}>
              <summary style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, font: "600 20px var(--font-fredoka)" }}>
                {item.q}
                <span className="faq-chevron" style={{ font: "600 24px var(--font-fredoka)", color: "#C2476B", transition: "transform 0.2s", flexShrink: 0 }}>+</span>
              </summary>
              <p style={{ margin: "14px 0 0", font: "400 17px/1.6 var(--font-atkinson)", color: "var(--ink-soft)" }}>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ═══════════ FINAL CTA + FOOTER ═══════════ */}
      <section style={{ background: "#22304A", color: "#FAF6EE", padding: "90px 56px 40px" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ margin: 0, font: "600 44px var(--font-fredoka)", color: "#FAF6EE" }}>Start your class jar today</h2>
          <p style={{ margin: "14px auto 0", font: "400 18px var(--font-atkinson)", color: "#A9B4C9", maxWidth: "30em" }}>Free for one class. Your children can pop their first moment in before home time.</p>
          <Link href="/signup/teacher" className="sj-btn-jam" style={{ marginTop: 30 }}>Start your class jar</Link>
          <div style={{ marginTop: 70, paddingTop: 28, borderTop: "1px solid rgba(250,246,238,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px 24px", flexWrap: "wrap" }}>
              <span style={{ font: "600 18px var(--font-fredoka)", marginRight: 6 }}>storyjar</span>
              {[
                ["/legal/privacy", "Privacy"],
                ["/legal/cookies", "Cookies"],
                ["/legal/safeguarding", "Safeguarding"],
                ["/legal/terms", "Terms"],
                ["/legal/acceptable-use", "Acceptable use"],
                ["/legal/accessibility", "Accessibility"],
                ["/legal", "All policies"],
                ["/family", "Family sign in"],
              ].map(([href, label]) => (
                <Link key={href} href={href} style={{ font: "400 15px var(--font-atkinson)", color: "#A9B4C9", textDecoration: "none" }}>{label}</Link>
              ))}
            </div>
            <p style={{ margin: "22px 0 0", font: "400 14px var(--font-atkinson)", color: "#6B7690", textAlign: "center" }}>
              Storyjar is a data processor for schools · Data kept in the UK/EU · © 2026 Storyjar · storyjar.co.uk · Made in a Year 2 classroom
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
