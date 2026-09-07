"use client";

import { useActionState, useState } from "react";
import { passFamilyToColleague, shareFamilyThread, stopSharingFamilyThread } from "@/app/actions/messaging";
import type { StaffReader } from "@/lib/messaging/threads";

// The two things a teacher may do to a family's conversation, and the one
// thing a colleague it was shared with may do (SAFEGUARDING rule 21):
//
//   • SHARE it with a colleague at the school, who then reads and replies
//     exactly as the teacher can. The parent sees the name in the reader list.
//   • PASS the family to a colleague: opting out of this one family. The
//     colleague holds everything; the teacher sees nothing until they take it
//     back from the inbox. The parent is not told. The reason is optional,
//     for the school admin, and never reaches the audit log.
//   • A colleague it was shared with can stop seeing it.
//
// Neither list offers anyone who is not set up to message families, so a share
// can never route around the admin's per-staff switch.

const SELECT: React.CSSProperties = {
  font: "400 15px var(--font-atkinson)",
  padding: "9px 11px",
  border: "3px solid var(--ink)",
  borderRadius: 10,
  background: "var(--cream)",
  color: "var(--ink)",
  minWidth: 220,
};

const QUIET_BTN: React.CSSProperties = {
  font: "700 14px var(--font-atkinson)",
  color: "var(--ink)",
  background: "var(--paper)",
  border: "2px solid var(--ink)",
  borderRadius: 999,
  padding: "9px 16px",
  cursor: "pointer",
};

function Flash({ text, tone }: { text: string; tone: "good" | "bad" }) {
  const good = tone === "good";
  return (
    <p role={good ? "status" : "alert"} style={{ margin: "10px 0 0", font: "700 14px var(--font-atkinson)", color: good ? "#2E6B64" : "var(--jam)", background: good ? "var(--glass-light)" : "var(--error-tint)", borderRadius: 10, padding: "9px 12px" }}>{text}</p>
  );
}

export function StaffThreadControls({
  studentId,
  childName,
  meId,
  standing,
  readers,
  colleagues,
}: {
  studentId: string;
  childName: string;
  meId: string;
  standing: { reader: boolean; controls: boolean; isClassTeacher: boolean };
  readers: StaffReader[];
  colleagues: Array<{ id: string; name: string }>;
}) {
  const [shareState, shareAction, sharing] = useActionState(shareFamilyThread, {});
  const [passState, passAction, passing] = useActionState(passFamilyToColleague, {});
  const [showPass, setShowPass] = useState(false);
  const shared = readers.filter((r) => r.role === "SHARED");
  const mine = readers.find((r) => r.id === meId);

  if (!standing.controls) {
    if (mine?.role !== "SHARED") return null;
    return (
      <section style={{ marginTop: 22 }} aria-label="Sharing">
        <form action={stopSharingFamilyThread} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <input type="hidden" name="studentId" value={studentId} />
          <input type="hidden" name="teacherId" value={meId} />
          <span style={{ font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>This conversation was shared with you.</span>
          <button type="submit" style={QUIET_BTN}>Stop seeing it</button>
        </form>
      </section>
    );
  }

  return (
    <section style={{ marginTop: 26, display: "grid", gap: 16 }} aria-label="Who else sees this">
      <div style={{ background: "var(--cream)", border: "2px solid var(--calm-border)", borderRadius: 14, padding: "16px 20px" }}>
        <h2 style={{ margin: 0, font: "600 18px var(--font-fredoka)", color: "var(--ink)" }}>Share with a colleague</h2>
        <p style={{ margin: "6px 0 0", font: "400 14px/1.55 var(--font-atkinson)", color: "var(--sj-muted)" }}>
          A job-share partner, the SENCo, a head of year: they see and can reply to this family exactly as you can. The family sees their name at the top of the conversation.
        </p>
        {shared.length > 0 && (
          <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "grid", gap: 6 }}>
            {shared.map((r) => (
              <li key={r.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ flex: 1, font: "700 15px var(--font-atkinson)", color: "var(--ink)" }}>{r.name}</span>
                <form action={stopSharingFamilyThread}>
                  <input type="hidden" name="studentId" value={studentId} />
                  <input type="hidden" name="teacherId" value={r.id} />
                  <button type="submit" style={QUIET_BTN} aria-label={`Stop sharing with ${r.name}`}>Stop sharing</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {colleagues.length > 0 ? (
          <form action={shareAction} style={{ display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <input type="hidden" name="studentId" value={studentId} />
            <label style={{ display: "grid", gap: 5, font: "700 13px var(--font-atkinson)", color: "var(--ink)" }}>
              Colleague
              <select name="teacherId" required defaultValue="" style={SELECT}>
                <option value="" disabled>Choose…</option>
                {colleagues.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <button type="submit" disabled={sharing} style={{ ...QUIET_BTN, opacity: sharing ? 0.7 : 1 }}>{sharing ? "Sharing…" : "Share"}</button>
          </form>
        ) : (
          <p style={{ margin: "12px 0 0", font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>Nobody else at the school is set up to message families just now.</p>
        )}
        {shareState.error && <Flash tone="bad" text={shareState.error} />}
        {shareState.done && <Flash tone="good" text={`✓ ${shareState.done}`} />}
      </div>

      <div style={{ background: "var(--cream)", border: "2px solid var(--calm-border)", borderRadius: 14, padding: "16px 20px" }}>
        <h2 style={{ margin: 0, font: "600 18px var(--font-fredoka)", color: "var(--ink)" }}>Pass this family to a colleague</h2>
        <p style={{ margin: "6px 0 0", font: "400 14px/1.55 var(--font-atkinson)", color: "var(--sj-muted)" }}>
          If you would rather not be the one talking to {childName}&rsquo;s family, hand the conversation to a colleague. They take it over completely and you stop seeing it. The family isn&rsquo;t told anything has changed. You can take it back from your messages page whenever you like.
        </p>
        {!showPass ? (
          <button onClick={() => setShowPass(true)} style={{ ...QUIET_BTN, marginTop: 12 }} disabled={colleagues.length === 0}>
            {colleagues.length === 0 ? "Nobody available to pass to — ask your school admin" : "Pass this family on…"}
          </button>
        ) : (
          <form action={passAction} style={{ display: "grid", gap: 10, marginTop: 12, maxWidth: 520 }}>
            <input type="hidden" name="studentId" value={studentId} />
            <label style={{ display: "grid", gap: 5, font: "700 13px var(--font-atkinson)", color: "var(--ink)" }}>
              Pass to
              <select name="teacherId" required defaultValue="" style={SELECT}>
                <option value="" disabled>Choose…</option>
                {colleagues.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 5, font: "700 13px var(--font-atkinson)", color: "var(--ink)" }}>
              A note for your school admin (optional — the family never sees it)
              <textarea name="reason" maxLength={300} rows={2} style={{ ...SELECT, minWidth: 0, width: "100%", boxSizing: "border-box", resize: "vertical", font: "400 15px/1.5 var(--font-atkinson)" }} />
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" disabled={passing} style={{ ...QUIET_BTN, background: "var(--ink)", color: "var(--paper)", opacity: passing ? 0.7 : 1 }}>{passing ? "Passing…" : "Pass this family on"}</button>
              <button type="button" onClick={() => setShowPass(false)} style={QUIET_BTN}>Cancel</button>
            </div>
          </form>
        )}
        {passState.error && <Flash tone="bad" text={passState.error} />}
      </div>
    </section>
  );
}
