"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveItem } from "@/app/actions/journal";
import { Sticker } from "@/components/stickers/Sticker";
import { Icon, type IconName } from "@/components/icons/Icon";
import { STICKER_CATALOG, STICKER_CATEGORIES, MAX_STICKERS, type StickerCategoryKey } from "@/lib/stickers";

// The teacher's full-size compose view (design 1b): work preview on the left,
// a real sheet of stickers sorted by kind on the right. Tapping a sticker
// peels it onto the work at one of four preset spots; tapping it again on the
// sheet removes it. "Add to jar" approves the moment with stickers + note.

type ItemProps = {
  id: string;
  child: string;
  type: string;
  mediaPath: string | null;
  text: string | null;
  caption: string | null;
  activity: string;
  when: string;
};

const KIND: Record<string, { bg: string; icon: IconName }> = {
  PHOTO: { bg: "#DEEAF3", icon: "camera" },
  DRAWING: { bg: "#FBEED3", icon: "draw" },
  TEXT: { bg: "#F7E0E6", icon: "write" },
};

// Where peeled stickers land on the preview tile, in placement order.
const SPOTS = [
  { top: -18, left: 18, tilt: "-9deg" },
  { top: 92, left: -20, tilt: "7deg" },
  { top: 112, left: 150, tilt: "-6deg" },
  { top: -16, left: 150, tilt: "8deg" },
];

export function StickerSheet({ item }: { item: ItemProps }) {
  const router = useRouter();
  const [tab, setTab] = useState<StickerCategoryKey>("praise");
  const [placed, setPlaced] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const k = KIND[item.type] ?? KIND.PHOTO;

  const togglePlace = (key: string) => {
    setPlaced((prev) => {
      if (prev.includes(key)) return prev.filter((p) => p !== key);
      if (prev.length >= MAX_STICKERS) return prev;
      return [...prev, key];
    });
  };

  const submit = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("itemId", item.id);
      placed.forEach((key) => fd.append("stickerKeys", key));
      if (note.trim()) fd.set("praiseNote", note.trim());
      await approveItem(fd);
      router.push("/teacher/queue");
    } finally {
      setBusy(false);
    }
  };

  const cta = placed.length
    ? `✓ Add to jar with ${placed.length} sticker${placed.length === 1 ? "" : "s"}`
    : "Add to jar";
  const hint = placed.length
    ? `${placed.length} of ${MAX_STICKERS} placed · tap a placed sticker to remove`
    : `Tap a sticker to peel it onto the work (up to ${MAX_STICKERS}).`;

  return (
    <div style={{ background: "var(--cream)", border: "2px solid #DFD6C0", borderRadius: 18, padding: 18, boxShadow: "0 12px 30px rgba(34,48,74,.10)", display: "grid", gridTemplateColumns: "232px 1fr", gap: 18 }}>
      {/* left — the work, note & submit */}
      <div>
        <div style={{ position: "relative", height: 200, borderRadius: 14, background: k.bg, border: "3px solid var(--ink)" }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: 11, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {item.mediaPath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.mediaPath} alt={`${item.child}'s work`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : item.text ? (
              <p style={{ margin: 0, padding: "14px 16px", font: "400 15px/1.5 var(--font-atkinson)", color: "var(--ink)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 7, WebkitBoxOrient: "vertical" }}>{item.text}</p>
            ) : (
              <Icon name={k.icon} size={64} decorative />
            )}
          </div>
          {placed.map((key, i) => {
            const spot = SPOTS[i] ?? SPOTS[0];
            return (
              <span key={key} data-stk="pop" style={{ position: "absolute", top: spot.top, left: spot.left, "--tilt": spot.tilt } as React.CSSProperties}>
                <Sticker k={key} size={52} />
              </span>
            );
          })}
        </div>
        <p style={{ margin: "10px 0 0", font: "600 16px var(--font-fredoka)" }}>
          {item.child} · {item.caption || item.activity}
        </p>
        <p style={{ margin: "2px 0 0", font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>
          {item.activity} · {item.when}
        </p>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={`A note to ${item.child} (optional)…`}
          aria-label={`A note to ${item.child} (optional)`}
          style={{ width: "100%", boxSizing: "border-box", marginTop: 12, font: "400 13px var(--font-atkinson)", padding: "9px 12px", border: "2px solid var(--calm-border)", borderRadius: 10, background: "var(--paper)", color: "var(--ink)" }}
        />
        <button
          onClick={submit}
          disabled={busy}
          style={{ width: "100%", boxSizing: "border-box", marginTop: 10, font: "700 15px var(--font-atkinson)", color: "var(--paper)", background: "var(--glass)", border: "none", borderRadius: 999, padding: 12, minHeight: 44, cursor: "pointer", boxShadow: "0 3px 0 #35706A", opacity: busy ? 0.7 : 1 }}
        >
          {cta}
        </button>
      </div>

      {/* right — the sticker sheet */}
      <div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {STICKER_CATEGORIES.map((c) => {
            const on = tab === c.key;
            return (
              <button
                key={c.key}
                onClick={() => setTab(c.key)}
                aria-pressed={on}
                style={{ font: "700 13px var(--font-atkinson)", color: on ? "var(--paper)" : "var(--ink-soft)", background: on ? "var(--ink)" : "var(--cream)", border: `2px solid ${on ? "var(--ink)" : "var(--calm-border)"}`, borderRadius: 999, padding: "6px 13px", minHeight: 36, cursor: "pointer" }}
              >
                {c.name}
              </button>
            );
          })}
        </div>
        <div style={{ background: "var(--paper)", border: "2px dashed #DFD6C0", borderRadius: 12, padding: 14, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px 8px", minHeight: 168, alignContent: "start" }}>
          {STICKER_CATALOG[tab].map((s) => {
            const on = placed.includes(s.k);
            return (
              <button
                key={s.k}
                onClick={() => togglePlace(s.k)}
                aria-pressed={on}
                title={s.label}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, background: "none", border: "none", padding: 2, cursor: "pointer" }}
              >
                <Sticker k={s.k} size={52} selected={on} />
                <span style={{ font: "700 11px var(--font-atkinson)", color: "var(--ink-soft)", textAlign: "center", lineHeight: 1.15 }}>{s.label}</span>
              </button>
            );
          })}
        </div>
        <p style={{ margin: "10px 2px 0", font: "400 12px var(--font-atkinson)", color: "var(--sj-muted)" }} aria-live="polite">{hint}</p>
      </div>
    </div>
  );
}
