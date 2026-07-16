"use client";

import { useRef, useState } from "react";
import { sendStickerBack } from "@/app/actions/journal";
import { Sticker } from "@/components/stickers/Sticker";
import { Icon, type IconName } from "@/components/icons/Icon";

// "What the child sees" (design 1d): the payoff. The teacher's sticker drops
// gently onto the moment, the card gives a little bump, and the teacher's kind
// note sits alongside. The child can send exactly one fixed heart back — never
// free text (SAFEGUARDING.md rule 2).

type Props = {
  itemId: string;
  childName: string;
  avatarColor: string;
  teacherName: string;
  note: string | null;
  stickers: string[]; // catalog keys, placement order
  moment: {
    mediaPath: string | null;
    text: string | null;
    title: string;
    dateLabel: string;
    bandBg: string;
    icon: IconName;
  };
};

// Where arriving stickers land on the moment card. The first (main) sticker
// takes the top-right spot at full size; any others follow, smaller and later.
const DROP_SPOTS = [
  { top: -20, right: -18, size: 68, tilt: "-7deg", delay: 0 },
  { top: 84, right: -20, size: 52, tilt: "6deg", delay: 0.35 },
  { top: -18, left: -16, size: 52, tilt: "8deg", delay: 0.6 },
  { top: 96, left: -18, size: 52, tilt: "-6deg", delay: 0.85 },
];

export function StickerArrival({ itemId, childName, avatarColor, teacherName, note, stickers, moment }: Props) {
  const [show, setShow] = useState(true);
  const [replied, setReplied] = useState(false);
  const [busy, setBusy] = useState(false);
  const replayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restart the CSS animations by unmounting the animated bits for a beat.
  const replay = () => {
    setShow(false);
    if (replayTimer.current) clearTimeout(replayTimer.current);
    replayTimer.current = setTimeout(() => setShow(true), 40);
  };

  const reply = async () => {
    if (replied || busy) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("itemId", itemId);
      await sendStickerBack(fd);
      setReplied(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="A new sticker just arrived" style={{ background: "var(--ink)", borderRadius: 18, padding: 26, boxShadow: "0 12px 30px rgba(34,48,74,.16)" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <span aria-hidden="true" style={{ width: 46, height: 46, borderRadius: "50%", background: avatarColor, display: "flex", alignItems: "center", justifyContent: "center", font: "600 22px var(--font-fredoka)", color: "#FFFDF7", flexShrink: 0 }}>
          {childName.charAt(0).toUpperCase()}
        </span>
        <div>
          <p style={{ margin: 0, font: "600 20px var(--font-fredoka)", color: "var(--paper)" }}>{childName}&apos;s jar</p>
          <p style={{ margin: "2px 0 0", font: "400 14px var(--font-atkinson)", color: "#A9B4C9" }}>A new sticker just arrived ✨</p>
        </div>
        <button onClick={replay} style={{ marginLeft: "auto", font: "700 15px var(--font-atkinson)", color: "var(--ink)", background: "var(--honey)", border: "none", borderRadius: 999, padding: "9px 20px", minHeight: 64, cursor: "pointer" }}>
          ↺ Play again
        </button>
      </div>

      {/* inner card */}
      <div style={{ background: "var(--paper)", borderRadius: 14, padding: 22, display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap" }}>
        {/* the moment */}
        <div style={{ position: "relative", width: 200, flexShrink: 0 }}>
          <div data-stk={show ? "bump" : undefined} style={{ background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 0 rgba(34,48,74,.12)" }}>
            <div style={{ height: 118, background: moment.bandBg, display: "flex", alignItems: "center", justifyContent: "center" }} aria-hidden="true">
              {moment.mediaPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={moment.mediaPath} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : moment.text ? (
                <p style={{ margin: 0, padding: "10px 12px", font: "400 13px/1.4 var(--font-atkinson)", color: "var(--ink)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical" }}>{moment.text}</p>
              ) : (
                <Icon name={moment.icon} size={52} decorative />
              )}
            </div>
            <div style={{ padding: "12px 14px" }}>
              <p style={{ margin: 0, font: "600 17px var(--font-fredoka)" }}>{moment.title}</p>
              <p style={{ margin: "3px 0 0", font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>{moment.dateLabel}</p>
            </div>
          </div>
          {show &&
            stickers.map((k, i) => {
              const spot = DROP_SPOTS[i] ?? DROP_SPOTS[0];
              return (
                <span
                  key={k}
                  data-stk="drop"
                  style={{
                    position: "absolute",
                    top: spot.top,
                    left: spot.left,
                    right: spot.right,
                    animationDelay: `${spot.delay}s`,
                    filter: "drop-shadow(0 6px 14px rgba(34,48,74,.28))",
                    "--tilt": spot.tilt,
                  } as React.CSSProperties}
                >
                  <Sticker k={k} size={spot.size} />
                </span>
              );
            })}
        </div>

        {/* the message */}
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: "inline-block", background: "#F3E3C3", border: "3px solid var(--ink)", borderRadius: "8px 14px 14px 8px", padding: "7px 16px", transform: "rotate(-2deg)", marginBottom: 12 }}>
            <span style={{ font: "600 15px var(--font-fredoka)" }}>From {teacherName}</span>
          </div>
          <p style={{ margin: 0, font: "400 21px/1.4 var(--font-atkinson)", color: "var(--ink)" }}>
            {note ? `“${note}”` : `A sticker for you, ${childName}! 🎉`}
          </p>
          <button
            onClick={reply}
            disabled={replied || busy}
            style={{ marginTop: 18, font: "600 17px var(--font-fredoka)", color: "var(--paper)", background: "var(--jam)", border: "3px solid var(--ink)", borderRadius: 999, padding: "11px 24px", minHeight: 64, cursor: replied ? "default" : "pointer", boxShadow: "0 4px 0 var(--jam-deep)", opacity: busy ? 0.7 : 1 }}
          >
            {replied ? "💛 Sent a heart back!" : "Send one back 💛"}
          </button>
        </div>
      </div>
    </section>
  );
}
