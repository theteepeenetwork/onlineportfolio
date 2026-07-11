import Link from "next/link";

const TWINKLE = "M0,-12 C2,-4 4,-2 12,0 C4,2 2,4 0,12 C-2,4 -4,2 -12,0 C-4,-2 -2,-4 0,-12 Z";

// The celebration shown right after a child pops a moment into the jar. Pure CSS
// animations (data-anim), so it works as a server component and respects
// reduced-motion. "Back to my jar" returns to their journal (where it now waits).
export default function PoppedInPage() {
  return (
    <div className="sj" style={{ fontFamily: "var(--font-atkinson)", color: "var(--ink)", background: "var(--paper)", minHeight: "100vh", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "40px 20px" }}>
      <div data-anim="jar" style={{ position: "relative" }}>
        <svg width="300" height="380" viewBox="0 0 380 480" style={{ overflow: "visible" }} aria-label="Your moment dropping into your jar">
          <g data-anim="tile">
            <g transform="translate(158,180) rotate(3)">
              <rect x="0" y="0" width="64" height="64" rx="6" fill="#FFFDF7" stroke="#22304A" strokeWidth="4" />
              <path d="M14,44 C20,26 32,28 36,40 C40,50 48,48 52,36" fill="none" stroke="#C2476B" strokeWidth="5" strokeLinecap="round" />
              <circle cx="46" cy="18" r="8" fill="#F0B441" />
            </g>
          </g>
          <g transform="rotate(-1.5 189 74)">
            <path d="M106,66 L272,66 C278,66 280,70 280,76 C280,84 276,88 268,88 L110,88 C102,88 98,84 98,76 C98,70 100,66 106,66 Z" fill="#B8945F" stroke="#22304A" strokeWidth="6" strokeLinejoin="round" opacity="0.25" />
          </g>
          <path d="M118,92 C114,104 112,112 114,120 C94,136 78,158 74,192 C69,228 72,262 71,300 C70,338 70,372 74,404 C78,436 100,452 138,455 C172,458 212,458 244,454 C282,450 302,434 306,402 C310,368 309,334 308,298 C307,260 310,226 304,192 C298,156 284,134 264,120 C266,111 264,102 260,93 C260,93 216,86 188,86 C158,86 118,92 118,92 Z" fill="#EAF4F1" stroke="#22304A" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" opacity="0.98" />
          <path d="M96,220 C93,186 102,158 122,140" fill="none" stroke="#FFFFFF" strokeWidth="10" strokeLinecap="round" opacity="0.9" />
          <g transform="translate(104,352) rotate(-6)"><rect width="58" height="58" rx="5" fill="#F0B441" /></g>
          <g transform="translate(170,362) rotate(4)"><rect width="58" height="58" rx="5" fill="#4E9C94" /></g>
          <g transform="translate(232,350) rotate(-3)"><rect width="58" height="58" rx="5" fill="#E08A9B" /></g>
          <g data-anim="twinkle"><path transform="translate(70,140) scale(1.1)" d={TWINKLE} fill="#F0B441" /></g>
          <g data-anim="twinkle"><path transform="translate(316,200) scale(0.85) rotate(15)" d={TWINKLE} fill="#F0B441" /></g>
          <g data-anim="twinkle"><path transform="translate(300,110) scale(0.6) rotate(-10)" d={TWINKLE} fill="#E08A9B" /></g>
        </svg>
      </div>
      <h1 style={{ margin: "10px 0 0", font: "600 54px var(--font-fredoka)", color: "var(--glass)" }}>Popped in!</h1>
      <p style={{ margin: "12px 0 0", font: "400 26px var(--font-atkinson)", color: "var(--ink-soft)" }}>Your teacher will see it soon.</p>
      <Link href="/student" style={{ marginTop: 34, minHeight: 72, display: "inline-flex", alignItems: "center", font: "600 26px var(--font-fredoka)", color: "var(--paper)", background: "var(--jam)", border: "3px solid var(--ink)", borderRadius: 999, padding: "14px 48px", textDecoration: "none", boxShadow: "0 5px 0 var(--jam-deep)" }}>Back to my jar 🫙</Link>
    </div>
  );
}
