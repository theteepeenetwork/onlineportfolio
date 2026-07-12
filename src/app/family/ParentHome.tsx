"use client";

import { useState } from "react";
import { parentLogout } from "@/app/actions/family";
import { relativeDay } from "@/lib/relativeDay";
import type { ParentChild, ParentMoment, ParentSession } from "@/lib/parentAuth";

const TYPE_LABEL: Record<string, string> = { PHOTO: "Photo", DRAWING: "Drawing", TEXT: "Their words" };
const TYPE_ART: Record<string, string> = { PHOTO: "📷", DRAWING: "🖍️", TEXT: "💬" };
const TILE_BG = ["#FBEED3", "#F7E0E6", "#DEEAF3", "#E5EED9", "#F3E3C3", "#EAF4F1"];

const AVATAR_PALETTE = ["#E08A9B", "#8AB9D6", "#A6C979", "#F0B441", "#B99CD6", "#37796f"];
function avatarColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

export function ParentHome({ parent }: { parent: ParentSession }) {
  const [childId, setChildId] = useState(parent.children[0]?.id ?? "");
  const child = parent.children.find((c) => c.id === childId) ?? parent.children[0];

  return (
    <div className="sj" style={{ minHeight: "100vh", background: "var(--paper)", fontFamily: "var(--font-atkinson)", color: "var(--ink)" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 18, padding: "14px 32px", background: "var(--cream)", borderBottom: "2px solid var(--calm-border)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <JarMark />
          <span style={{ font: "600 19px var(--font-fredoka)" }}>storyjar</span>
          <span style={{ font: "700 12px var(--font-atkinson)", color: "#2E6B64", background: "var(--glass-light)", borderRadius: 6, padding: "3px 9px", textTransform: "uppercase" }}>Family</span>
        </div>
        {parent.children.length > 1 && (
          <div style={{ display: "flex", gap: 6, marginLeft: 12, flexWrap: "wrap" }}>
            {parent.children.map((ch) => {
              const on = ch.id === child?.id;
              return (
                <button
                  key={ch.id}
                  onClick={() => setChildId(ch.id)}
                  style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", font: "700 14px var(--font-atkinson)", color: "var(--ink)", background: on ? "#F3E3C3" : "var(--cream)", border: `2px solid ${on ? "var(--ink)" : "var(--calm-border)"}`, borderRadius: 999, padding: "5px 12px 5px 6px" }}
                >
                  <span style={{ width: 26, height: 26, borderRadius: "50%", background: avatarColor(ch.id), display: "flex", alignItems: "center", justifyContent: "center", font: "600 13px var(--font-fredoka)", color: "#FFFDF7" }}>{ch.name[0]?.toUpperCase()}</span>
                  {ch.name}
                </button>
              );
            })}
          </div>
        )}
        <form action={parentLogout} style={{ marginLeft: "auto" }}>
          <button type="submit" style={{ font: "700 14px var(--font-atkinson)", color: "var(--sj-muted)", background: "none", border: "none", cursor: "pointer" }}>Sign out</button>
        </form>
      </header>

      {child && <ChildView child={child} />}
    </div>
  );
}

function ChildView({ child }: { child: ParentChild }) {
  return (
    <main style={{ maxWidth: 940, margin: "0 auto", padding: "30px 32px 60px" }}>
      {/* jar hero */}
      <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap", background: "#F3E3C3", border: "3px solid var(--ink)", borderRadius: 20, padding: "22px 26px", boxShadow: "0 4px 0 rgba(34,48,74,0.14)" }}>
        <HeroJar />
        <div>
          <h1 style={{ margin: 0, font: "600 32px var(--font-fredoka)" }}>Hello, {child.name}&apos;s grown-ups 👋</h1>
          <p style={{ margin: "6px 0 0", font: "400 17px var(--font-atkinson)", color: "var(--ink-soft)" }}>
            {child.moments.length} {child.moments.length === 1 ? "moment" : "moments"} in the jar · in {child.className} with {child.teacherDisplayName}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "26px 0 14px" }}>
        <h2 style={{ margin: 0, font: "600 22px var(--font-fredoka)" }}>Recently added</h2>
        <span style={{ font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>only moments the teacher has approved</span>
      </div>

      {child.moments.length === 0 ? (
        <div className="sj-card" style={{ padding: "40px 28px", textAlign: "center", background: "var(--cream)", border: "2px solid var(--calm-border)", borderRadius: 16 }}>
          <div style={{ fontSize: 40 }} aria-hidden>🫙</div>
          <p style={{ margin: "10px 0 0", font: "600 18px var(--font-fredoka)" }}>The jar is waiting for its first moment</p>
          <p style={{ margin: "6px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>When {child.name}&apos;s teacher approves something, it&apos;ll appear here.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
          {child.moments.map((m, i) => (
            <MomentCard key={m.id} moment={m} bg={TILE_BG[i % TILE_BG.length]} />
          ))}
        </div>
      )}

      <p style={{ margin: "26px 2px 0", font: "400 14px/1.55 var(--font-atkinson)", color: "var(--sj-muted)" }}>
        Your child&apos;s storyjar is managed by their school. You can view it, but only their teacher can add or change what&apos;s inside. Questions? Speak to the school office.
      </p>
    </main>
  );
}

function MomentCard({ moment, bg }: { moment: ParentMoment; bg: string }) {
  const showImg = (moment.type === "PHOTO" || moment.type === "DRAWING") && moment.mediaPath;
  const src = moment.mediaPath ? (moment.mediaPath.startsWith("/") ? moment.mediaPath : `/${moment.mediaPath}`) : null;
  return (
    <div style={{ background: "var(--cream)", border: "2px solid var(--calm-border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 3px 0 rgba(34,48,74,0.08)" }}>
      <div style={{ aspectRatio: "4 / 3", background: bg, display: "flex", alignItems: "center", justifyContent: "center", borderBottom: "2px solid var(--calm-border)", overflow: "hidden" }}>
        {showImg && src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={`${moment.title}`} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        ) : (
          <span style={{ fontSize: 52 }} aria-hidden>{moment.type === "TEXT" ? "💬" : TYPE_ART[moment.type] ?? "🫙"}</span>
        )}
      </div>
      <div style={{ padding: "12px 14px 14px" }}>
        <p style={{ margin: 0, font: "700 15px var(--font-atkinson)" }}>{moment.title}</p>
        <p style={{ margin: "3px 0 0", font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>{TYPE_LABEL[moment.type] ?? "Moment"} · {relativeDay(new Date(moment.approvedAt))}</p>
      </div>
    </div>
  );
}

function JarMark() {
  return (
    <svg width="22" height="27" viewBox="0 0 100 120" aria-hidden>
      <rect x="26" y="4" width="48" height="14" rx="7" fill="#C9A87C" />
      <path d="M30,20 L70,20 L70,30 C82,36 86,46 86,58 L86,98 Q86,114 70,114 L30,114 Q14,114 14,98 L14,58 C14,46 18,36 30,30 Z" fill="#D8ECE8" stroke="#22304A" strokeWidth="5" strokeLinejoin="round" />
      <rect x="30" y="76" width="16" height="16" rx="3" fill="#C2476B" transform="rotate(-8 38 84)" />
      <rect x="52" y="82" width="16" height="16" rx="3" fill="#F0B441" transform="rotate(6 60 90)" />
    </svg>
  );
}

function HeroJar() {
  return (
    <svg width="60" height="72" viewBox="0 0 100 120" aria-hidden style={{ flexShrink: 0 }}>
      <rect x="26" y="4" width="48" height="14" rx="7" fill="#C9A87C" />
      <path d="M30,20 L70,20 L70,30 C82,36 86,46 86,58 L86,98 Q86,114 70,114 L30,114 Q14,114 14,98 L14,58 C14,46 18,36 30,30 Z" fill="#FFFDF7" stroke="#22304A" strokeWidth="5" strokeLinejoin="round" />
      <rect x="30" y="72" width="15" height="15" rx="3" fill="#C2476B" transform="rotate(-8 37 79)" />
      <rect x="52" y="78" width="15" height="15" rx="3" fill="#F0B441" transform="rotate(6 59 85)" />
      <rect x="42" y="56" width="15" height="15" rx="3" fill="#37796f" transform="rotate(-4 49 63)" />
    </svg>
  );
}
