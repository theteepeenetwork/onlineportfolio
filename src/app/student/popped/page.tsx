import Link from "next/link";
import { Icon } from "@/components/icons/Icon";
import { ClearMarkedDraft } from "@/components/ClearMarkedDraft";
import { getCurrentUser } from "@/lib/auth";
import { studentCopy } from "@/lib/copy/student";

const TWINKLE = "M0,-12 C2,-4 4,-2 12,0 C4,2 2,4 0,12 C-2,4 -4,2 -12,0 C-4,-2 -2,-4 0,-12 Z";

// The star burst: each star sits around the jar's mouth and flies outward along
// its own (--bx,--by) vector. Kept as data so the markup stays readable.
const STARS: { x: number; y: number; s: number; rot: number; bx: string; by: string; fill: string }[] = [
  { x: 190, y: 54, s: 1.2, rot: 0, bx: "0px", by: "-46px", fill: "#F0B441" },
  { x: 124, y: 92, s: 0.85, rot: -12, bx: "-52px", by: "-30px", fill: "#E08A9B" },
  { x: 258, y: 92, s: 0.85, rot: 12, bx: "52px", by: "-30px", fill: "#F0B441" },
  { x: 90, y: 168, s: 0.7, rot: 8, bx: "-54px", by: "-6px", fill: "#F0B441" },
  { x: 292, y: 170, s: 0.72, rot: -8, bx: "54px", by: "-6px", fill: "#E08A9B" },
  { x: 156, y: 66, s: 0.55, rot: -6, bx: "-26px", by: "-48px", fill: "#E08A9B" },
];

// The celebration shown right after a child pops a moment into the jar. Pure CSS
// animations (data-anim), so it works as a server component and respects
// reduced-motion. "Back to my jar" returns to their journal (where it now waits).
export default async function PoppedInPage() {
  // The child is signed in when they land here; speak their class's register
  // (SJ-06). Fall back to the younger wording if the session can't be read.
  const user = await getCurrentUser();
  const mode = user?.role === "STUDENT" ? user.student.ageMode : "KS1";
  const c = studentCopy(mode);

  return (
    <div className="sj" data-ks={mode} style={{ fontFamily: "var(--font-atkinson)", color: "var(--ink)", background: "var(--paper)", minHeight: "100vh", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "40px 20px" }}>
      <ClearMarkedDraft />
      {mode === "KS2" ? (
        /* Older children have no jar to drop into — a calm tick, not a jar
           bounce (SJ-06). */
        <svg width="150" height="150" viewBox="0 0 24 24" aria-label={c.status.justArrived}>
          <circle cx="12" cy="12" r="10" fill="#37796f" />
          <path d="M7 12.4l3.2 3.2L17 9" fill="none" stroke="#FFFDF7" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
      <div data-anim="jar" style={{ position: "relative" }}>
        <svg width="300" height="380" viewBox="0 0 380 480" style={{ overflow: "visible" }} aria-label="Your moment popping into your jar">
          {/* jar body (glass) + shine */}
          <path d="M118,92 C114,104 112,112 114,120 C94,136 78,158 74,192 C69,228 72,262 71,300 C70,338 70,372 74,404 C78,436 100,452 138,455 C172,458 212,458 244,454 C282,450 302,434 306,402 C310,368 309,334 308,298 C307,260 310,226 304,192 C298,156 284,134 264,120 C266,111 264,102 260,93 C260,93 216,86 188,86 C158,86 118,92 118,92 Z" fill="#EAF4F1" stroke="#22304A" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" opacity="0.98" />
          <path d="M96,220 C93,186 102,158 122,140" fill="none" stroke="#FFFFFF" strokeWidth="10" strokeLinecap="round" opacity="0.9" />

          {/* the open rim — revealed while the lid is lifted */}
          <path d="M110,80 L268,80 C276,80 280,85 280,92 C280,100 275,104 266,104 L112,104 C103,104 98,100 98,92 C98,85 102,80 110,80 Z" fill="#CFE6E0" stroke="#22304A" strokeWidth="5" strokeLinejoin="round" />

          {/* the pile already in the jar */}
          <g transform="translate(104,352) rotate(-6)"><rect width="58" height="58" rx="5" fill="#F0B441" stroke="#22304A" strokeWidth="3" /></g>
          <g transform="translate(170,362) rotate(4)"><rect width="58" height="58" rx="5" fill="#37796f" stroke="#22304A" strokeWidth="3" /></g>
          <g transform="translate(232,350) rotate(-3)"><rect width="58" height="58" rx="5" fill="#E08A9B" stroke="#22304A" strokeWidth="3" /></g>

          {/* the coloured square dropping in, landing on the pile */}
          <g data-anim="square">
            <g transform="translate(160,300) rotate(-5)">
              <rect width="60" height="60" rx="6" fill="#8AB9D6" stroke="#22304A" strokeWidth="4" />
            </g>
          </g>

          {/* the lid — lifts off, then seats back down */}
          <g data-anim="lid">
            <g transform="rotate(-1.5 189 78)">
              <rect x="100" y="62" width="180" height="30" rx="12" fill="#C9A87C" stroke="#22304A" strokeWidth="6" />
              <rect x="112" y="68" width="156" height="8" rx="4" fill="#E0C79B" />
            </g>
          </g>

          {/* the star burst */}
          {STARS.map((st, i) => (
            <g key={i} data-anim="star" style={{ "--bx": st.bx, "--by": st.by } as React.CSSProperties}>
              <path transform={`translate(${st.x},${st.y}) scale(${st.s}) rotate(${st.rot})`} d={TWINKLE} fill={st.fill} />
            </g>
          ))}
        </svg>
      </div>
      )}
      <h1 style={{ margin: "10px 0 0", font: "600 calc(54px * var(--sj-type-scale, 1)) var(--font-fredoka)", color: "#37796f" }}>{c.celebration.heading}</h1>
      <p style={{ margin: "12px 0 0", font: "400 calc(26px * var(--sj-type-scale, 1)) var(--font-atkinson)", color: "var(--ink-soft)" }}>{c.celebration.subtitle}</p>
      <Link href="/student" style={{ marginTop: 34, minHeight: 72, display: "inline-flex", alignItems: "center", font: "600 calc(26px * var(--sj-type-scale, 1)) var(--font-fredoka)", color: "var(--paper)", background: "var(--jam)", border: "3px solid var(--ink)", borderRadius: 999, padding: "14px 48px", textDecoration: "none", boxShadow: "0 5px 0 var(--jam-deep)", gap: 12 }}>{c.add.backToJar} <Icon name={mode === "KS2" ? "home" : "jar"} size={30} decorative /></Link>
    </div>
  );
}
