// The hand-inked hero jar (380×480): domed kraft lid, twine + hanging "Class 2M"
// tag, glass shine, honey twinkles, and nine work tiles that drop in on scroll.
// Tiles carry data-scroll-tile so the ScrollFill client island can reveal them;
// they're visible by default so the page works with no JS / reduced motion.
export function HeroJar() {
  return (
    <div
      data-jar-jiggle="on"
      style={{
        position: "relative",
        width: 380,
        transform: "rotate(-6deg)",
        transformOrigin: "50% 85%",
      }}
    >
      <svg
        width="380"
        height="480"
        viewBox="0 0 380 480"
        style={{ overflow: "visible" }}
        aria-label="A class jar filling with children's work as you scroll"
      >
        {/* falling tile: a little sun */}
        <g transform="translate(268,10) rotate(14)">
          <rect x="0" y="0" width="56" height="56" rx="6" fill="#FFFDF7" stroke="#22304A" strokeWidth="4" />
          <circle cx="28" cy="28" r="11" fill="#F0B441" />
          <g stroke="#F0B441" strokeWidth="4" strokeLinecap="round">
            <path d="M28,8 L28,13" /><path d="M28,43 L28,48" />
            <path d="M8,28 L13,28" /><path d="M43,28 L48,28" />
            <path d="M14,14 L18,18" /><path d="M42,42 L38,38" />
            <path d="M42,14 L38,18" /><path d="M14,42 L18,38" />
          </g>
        </g>
        <path d="M262,78 C258,86 250,96 244,102" fill="none" stroke="#C2476B" strokeWidth="4" strokeLinecap="round" strokeDasharray="1 9" />
        {/* lid */}
        <g transform="rotate(-1.5 189 74)">
          <path d="M112,60 C114,42 134,32 189,32 C244,32 264,42 266,60 L266,66 L112,66 Z" fill="#C9A87C" stroke="#22304A" strokeWidth="6" strokeLinejoin="round" />
          <path d="M106,66 L272,66 C278,66 280,70 280,76 C280,84 276,88 268,88 L110,88 C102,88 98,84 98,76 C98,70 100,66 106,66 Z" fill="#B8945F" stroke="#22304A" strokeWidth="6" strokeLinejoin="round" />
          <path d="M132,42 C152,36 226,36 246,42" fill="none" stroke="#A8854F" strokeWidth="4" strokeLinecap="round" />
        </g>
        {/* jar body */}
        <path d="M118,92 C114,104 112,112 114,120 C94,136 78,158 74,192 C69,228 72,262 71,300 C70,338 70,372 74,404 C78,436 100,452 138,455 C172,458 212,458 244,454 C282,450 302,434 306,402 C310,368 309,334 308,298 C307,260 310,226 304,192 C298,156 284,134 264,120 C266,111 264,102 260,93 C260,93 216,86 188,86 C158,86 118,92 118,92 Z" fill="#EAF4F1" stroke="#22304A" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
        {/* twine */}
        <path d="M112,118 C150,128 232,128 266,117" fill="none" stroke="#A8854F" strokeWidth="5" strokeLinecap="round" />
        <path d="M112,124 C150,134 232,134 266,123" fill="none" stroke="#A8854F" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M264,122 C276,130 280,142 274,152 M268,124 C262,138 264,148 272,156" fill="none" stroke="#A8854F" strokeWidth="3.5" strokeLinecap="round" />
        {/* shine */}
        <path d="M96,220 C93,186 102,158 122,140" fill="none" stroke="#FFFFFF" strokeWidth="10" strokeLinecap="round" opacity="0.9" />
        <path d="M92,262 C91,250 92,242 94,236" fill="none" stroke="#FFFFFF" strokeWidth="9" strokeLinecap="round" opacity="0.8" />
        {/* tiles — visible by default; ScrollFill hides + reveals on scroll */}
        <g data-scroll-tile="1">
          <g transform="translate(92,352) rotate(-7)">
            <rect x="0" y="0" width="64" height="64" rx="5" fill="#FFFDF7" stroke="#22304A" strokeWidth="4" />
            <path d="M18,34 L46,33 L47,52 L19,53 Z" fill="#C2476B" />
            <path d="M14,35 L32,18 L50,34" fill="none" stroke="#22304A" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="28" y="42" width="9" height="11" fill="#22304A" opacity="0.7" />
          </g>
        </g>
        <g data-scroll-tile="2">
          <g transform="translate(164,364) rotate(5)">
            <rect x="0" y="0" width="62" height="62" rx="5" fill="#F0B441" />
            <text x="31" y="47" fontFamily="var(--font-fredoka)" fontWeight="600" fontSize="42" fill="#7A4E10" textAnchor="middle">a</text>
          </g>
        </g>
        <g data-scroll-tile="3">
          <g transform="translate(234,350) rotate(-4)">
            <rect x="0" y="0" width="62" height="62" rx="5" fill="#37796f" />
            <path d="M12,42 C18,26 24,26 28,38 C32,50 38,50 42,34 C45,24 50,24 52,32" fill="none" stroke="#EAF4F1" strokeWidth="5" strokeLinecap="round" />
          </g>
        </g>
        <g data-scroll-tile="4">
          <g transform="translate(122,286) rotate(6)">
            <rect x="0" y="0" width="60" height="60" rx="5" fill="#FFFDF7" stroke="#22304A" strokeWidth="4" />
            <path d="M30,48 C30,40 30,36 30,32" stroke="#5E9C4E" strokeWidth="4" strokeLinecap="round" />
            <circle cx="30" cy="24" r="6" fill="#F0B441" />
            <g fill="#E08A9B">
              <circle cx="30" cy="13" r="5.5" /><circle cx="41" cy="20" r="5.5" />
              <circle cx="38" cy="32" r="5.5" /><circle cx="22" cy="32" r="5.5" />
              <circle cx="19" cy="20" r="5.5" />
            </g>
          </g>
        </g>
        <g data-scroll-tile="5">
          <g transform="translate(196,292) rotate(-6)">
            <rect x="0" y="0" width="60" height="60" rx="5" fill="#E08A9B" />
            <path d="M30,44 C14,32 16,18 24,17 C28,16.5 30,20 30,23 C30,20 32,16.5 36,17 C44,18 46,32 30,44 Z" fill="#FFFDF7" />
          </g>
        </g>
        <g data-scroll-tile="6">
          <g transform="translate(252,282) rotate(4)">
            <rect x="0" y="0" width="56" height="56" rx="5" fill="#FFFDF7" stroke="#22304A" strokeWidth="4" />
            <text x="28" y="37" fontFamily="var(--font-fredoka)" fontWeight="600" fontSize="22" fill="#37796f" textAnchor="middle">3+4</text>
          </g>
        </g>
        <g data-scroll-tile="7">
          <g transform="translate(158,226) rotate(3)">
            <rect x="0" y="0" width="58" height="58" rx="5" fill="#FFFDF7" stroke="#22304A" strokeWidth="4" />
            <path d="M12,44 C12,26 46,26 46,44" fill="none" stroke="#C2476B" strokeWidth="5" strokeLinecap="round" />
            <path d="M20,44 C20,32 38,32 38,44" fill="none" stroke="#F0B441" strokeWidth="5" strokeLinecap="round" />
            <path d="M27,44 C27,39 31,39 31,44" fill="none" stroke="#37796f" strokeWidth="5" strokeLinecap="round" />
          </g>
        </g>
        <g data-scroll-tile="8">
          <g transform="translate(100,222) rotate(-5)">
            <rect x="0" y="0" width="54" height="54" rx="5" fill="#8AB9D6" />
            <text x="27" y="38" fontFamily="var(--font-fredoka)" fontWeight="600" fontSize="24" fill="#FFFDF7" textAnchor="middle">cat</text>
          </g>
        </g>
        <g data-scroll-tile="9">
          <g transform="translate(222,222) rotate(6)">
            <rect x="0" y="0" width="54" height="54" rx="5" fill="#A6C979" />
            <circle cx="27" cy="27" r="13" fill="#FFFDF7" />
            <circle cx="32" cy="24" r="10" fill="#A6C979" />
          </g>
        </g>
        {/* twinkles */}
        <g fill="#F0B441">
          <path transform="translate(58,126) scale(1.15)" d="M0,-12 C2,-4 4,-2 12,0 C4,2 2,4 0,12 C-2,4 -4,2 -12,0 C-4,-2 -2,-4 0,-12 Z" />
          <path transform="translate(322,214) scale(0.9) rotate(15)" d="M0,-12 C2,-4 4,-2 12,0 C4,2 2,4 0,12 C-2,4 -4,2 -12,0 C-4,-2 -2,-4 0,-12 Z" />
          <path transform="translate(48,318) scale(0.65) rotate(-10)" d="M0,-12 C2,-4 4,-2 12,0 C4,2 2,4 0,12 C-2,4 -4,2 -12,0 C-4,-2 -2,-4 0,-12 Z" />
          <path transform="translate(330,116) scale(0.55) rotate(20)" d="M0,-12 C2,-4 4,-2 12,0 C4,2 2,4 0,12 C-2,4 -4,2 -12,0 C-4,-2 -2,-4 0,-12 Z" />
          <path transform="translate(86,58) scale(0.5)" d="M0,-12 C2,-4 4,-2 12,0 C4,2 2,4 0,12 C-2,4 -4,2 -12,0 C-4,-2 -2,-4 0,-12 Z" />
          <circle cx="76" cy="88" r="3" />
          <circle cx="336" cy="160" r="3.5" />
          <circle cx="40" cy="270" r="3" />
          <circle cx="316" cy="300" r="2.5" />
          <circle cx="104" cy="34" r="2.5" fill="#E08A9B" />
          <circle cx="344" cy="252" r="3" fill="#E08A9B" />
        </g>
        <path transform="translate(268,206) scale(0.6) rotate(12)" d="M0,-12 C2,-4 4,-2 12,0 C4,2 2,4 0,12 C-2,4 -4,2 -12,0 C-4,-2 -2,-4 0,-12 Z" fill="#F0B441" opacity="0.85" />
      </svg>
      {/* hanging kraft tag */}
      <div style={{ position: "absolute", left: 22, top: 128, transform: "rotate(-8deg)" }}>
        <svg width="30" height="34" viewBox="0 0 30 34" style={{ position: "absolute", right: -16, top: -20 }} aria-hidden="true">
          <path d="M26,2 C14,8 8,16 6,30" fill="none" stroke="#A8854F" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
        <div
          style={{
            background: "#F3E3C3",
            border: "3px solid #22304A",
            borderRadius: "8px 14px 14px 8px",
            padding: "10px 24px 10px 28px",
            position: "relative",
            boxShadow: "0 3px 0 rgba(34,48,74,0.2)",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 9,
              top: "50%",
              width: 9,
              height: 9,
              border: "3px solid #22304A",
              borderRadius: "50%",
              transform: "translateY(-50%)",
              background: "#FAF6EE",
            }}
          />
          <span style={{ font: "600 25px var(--font-fredoka)", whiteSpace: "nowrap" }}>Class 2M</span>
        </div>
      </div>
    </div>
  );
}
