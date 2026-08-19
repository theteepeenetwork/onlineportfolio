"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { importClass, type ImportResult } from "@/app/actions/classImport";
import { AGE_MODE_OPTIONS } from "@/lib/ageMode";

// ---------------------------------------------------------------------------
// "Paste a class list" — one panel, two homes.
//
//   • A teacher opens it from Your classes and sets up their own class.
//   • A school admin opens it from the admin console and sets a class up FOR a
//     member of staff, choosing whose class it is.
//
// The same component serves both because the difference is one field. Pass
// `staff` to get the "whose class is it?" picker; leave it out and the class
// belongs to whoever is signed in.
//
// What it deliberately does not do: take a file. A CSV upload means a register
// full of surnames, dates of birth and UPNs sitting on our disk, when all we
// keep is first names. A paste box takes the one column that matters and throws
// the rest away before it is ever stored (see src/app/actions/classImport.ts).
// ---------------------------------------------------------------------------

export type StaffOption = { id: string; name: string };

const INPUT: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  font: "400 16px var(--font-atkinson)",
  padding: "11px 13px",
  border: "3px solid var(--ink, #22304A)",
  borderRadius: 10,
  background: "var(--paper, #FAF6EE)",
  color: "var(--ink, #22304A)",
};
const PRIMARY: React.CSSProperties = {
  font: "700 15px var(--font-atkinson)",
  color: "var(--paper, #FAF6EE)",
  background: "var(--jam, #C2476B)",
  border: "none",
  borderRadius: 999,
  padding: "12px 24px",
  cursor: "pointer",
  boxShadow: "0 3px 0 var(--jam-deep, #93304F)",
};
const CARD: React.CSSProperties = {
  background: "#FFFDF7",
  border: "2px solid #E4DCC8",
  borderRadius: 16,
  padding: "18px 20px",
};

export function ImportClassForm({
  staff,
  defaultOwnerId,
  onDone,
}: {
  /** Present only for a school admin: the staff this class may be set up for. */
  staff?: StaffOption[];
  defaultOwnerId?: string;
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState<ImportResult | undefined, FormData>(importClass, undefined);
  const [names, setNames] = useState("");

  // Deliberately NOT kept in sessionStorage, unlike the add-a-pupil box.
  //
  // A pasted register is the rawest child data in the product — full names, in
  // whatever order the MIS exported them — and this panel is often open on a
  // shared office machine. Two things follow. It must not outlive the panel:
  // closing it, or a failed submit, leaves nothing behind for the next person
  // to find. And it must not be carried between owners: a draft restored into a
  // panel now pointed at a different teacher would file one class's children
  // under another teacher, which IS the access control (SAFEGUARDING rule 4).
  // So the text lives in component state and dies with it.

  // Live count of the names pasted, splitting exactly as the server does. It is
  // how many lines will be CONSIDERED, not always how many children are made:
  // the server also collapses two lines that resolve to the same child, and says
  // so in the confirmation.
  const count = new Set(
    names.split(/[\n\r,;\t]+/).map((n) => n.trim().toLowerCase()).filter(Boolean),
  ).size;

  const done = state?.imported;

  if (done) {
    return (
      <div style={{ ...CARD, marginBottom: 20, borderColor: "#B6D8D2", background: "#E9F5F2" }} role="status">
        <p style={{ margin: 0, font: "600 20px var(--font-fredoka)", color: "#2E6B64" }}>
          {done.className} is ready
        </p>
        <p style={{ margin: "6px 0 0", font: "400 16px var(--font-atkinson)", color: "#2E6B64" }}>
          {done.pupils} {done.pupils === 1 ? "pupil" : "pupils"} added
          {done.onBehalf ? ` — it's ${done.ownerName}'s class now.` : "."}
          {done.duplicatesSkipped > 0 && ` ${done.duplicatesSkipped} repeated ${done.duplicatesSkipped === 1 ? "name was" : "names were"} left out.`}
          {done.classCode && (
            <>
              {" "}The class code is <strong>{done.classCode}</strong>.
            </>
          )}
        </p>
        {done.onBehalf ? (
          <p style={{ margin: "8px 0 0", font: "400 15px var(--font-atkinson)", color: "#43506B" }}>
            {done.ownerName} will find it under their own classes, with the class code and the printable sign-in
            sheet. The class list stays with them — setting a class up doesn&rsquo;t give you access to the children&rsquo;s work.
          </p>
        ) : (
          <p style={{ margin: "10px 0 0" }}>
            <Link href={`/teacher/class?class=${encodeURIComponent(done.classId)}`} style={{ font: "700 15px var(--font-atkinson)", color: "var(--jam, #C2476B)" }}>
              Open {done.className} →
            </Link>
          </p>
        )}
        {onDone && (
          <button
            onClick={onDone}
            style={{ marginTop: 12, font: "700 14px var(--font-atkinson)", background: "none", border: "none", color: "#43506B", cursor: "pointer", padding: 0 }}
          >
            Import another class
          </button>
        )}
      </div>
    );
  }

  return (
    <form action={action} style={{ ...CARD, marginBottom: 20 }} onClick={(e) => e.stopPropagation()}>
      <p style={{ margin: "0 0 14px", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted, #6B7385)" }}>
        Copy the names column out of your register — SIMS, Arbor, Bromcom, a spreadsheet, anything — and paste it
        below. Surnames are fine to leave in: only the first name is kept, and a surname is drawn on only where
        two children share one (Olivia Smith and Olivia Small become Olivia Smi and Olivia Sma).
      </p>

      <div style={{ display: "grid", gridTemplateColumns: staff ? "1.2fr 1.6fr 1fr" : "2fr 1fr", gap: 12 }}>
        {staff && (
          <div>
            <label htmlFor="import-owner" style={{ display: "block", font: "700 14px var(--font-atkinson)", marginBottom: 6 }}>Whose class is it?</label>
            <select id="import-owner" name="ownerId" defaultValue={defaultOwnerId ?? staff[0]?.id} style={INPUT}>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="import-name" style={{ display: "block", font: "700 14px var(--font-atkinson)", marginBottom: 6 }}>Class name</label>
          <input id="import-name" name="name" placeholder="e.g. Bluebell Class" autoComplete="off" required style={INPUT} />
        </div>
        <div>
          <label htmlFor="import-year" style={{ display: "block", font: "700 14px var(--font-atkinson)", marginBottom: 6 }}>
            Year group <span style={{ font: "400 13px var(--font-atkinson)", color: "var(--sj-muted, #6B7385)" }}>optional</span>
          </label>
          <input id="import-year" name="yearGroup" placeholder="e.g. Year 2" autoComplete="off" style={INPUT} />
        </div>
      </div>

      {/* The register question. Nothing is pre-selected — the Children's Code
          forbids nudging a choice that changes how a child's screen behaves, and
          skipping is a real answer (the youngest register is used). */}
      <fieldset style={{ margin: "14px 0 0", padding: 0, border: "none" }}>
        <legend style={{ font: "700 14px var(--font-atkinson)", padding: 0, marginBottom: 8 }}>
          Which children is this class for?{" "}
          <span style={{ font: "400 13px var(--font-atkinson)", color: "var(--sj-muted, #6B7385)" }}>
            Sets how the children&rsquo;s screens read. You can leave it — early years is used if you do.
          </span>
        </legend>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {AGE_MODE_OPTIONS.map((o) => (
            <label
              key={o.value}
              style={{ flex: 1, minWidth: 190, display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", border: "2px solid #E6E0D2", borderRadius: 12, cursor: "pointer", font: "400 15px var(--font-atkinson)" }}
            >
              <input type="radio" name="ageMode" value={o.value} style={{ marginTop: 3, width: 18, height: 18 }} />
              <span>
                <span style={{ display: "block", font: "700 15px var(--font-atkinson)" }}>{o.label}</span>
                <span style={{ color: "var(--sj-muted, #6B7385)" }}>{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label htmlFor="import-names" style={{ display: "block", font: "700 14px var(--font-atkinson)", margin: "16px 0 6px" }}>
        Class list — one name per line
      </label>
      <textarea
        id="import-names"
        name="names"
        rows={7}
        placeholder={"Poppy Fields\nJesse Cole\nAmara Okafor\nOlivia Smith\nOlivia Small"}
        autoComplete="off"
        value={names}
        onChange={(e) => setNames(e.target.value)}
        style={{ ...INPUT, font: "400 16px/1.6 var(--font-atkinson)", resize: "vertical" }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
        <button type="submit" disabled={pending} style={{ ...PRIMARY, opacity: pending ? 0.7 : 1 }}>
          {pending ? "Setting up…" : count > 0 ? `Create the class from ${count} ${count === 1 ? "name" : "names"}` : "Create the class"}
        </button>
        <span style={{ font: "400 14px var(--font-atkinson)", color: "var(--sj-muted, #6B7385)" }}>
          First names only — a surname is used just far enough to tell two children with the same first name
          apart. No emails, no dates of birth, nothing else from your register is kept.
        </span>
      </div>

      {state?.error && (
        <p role="alert" style={{ margin: "12px 0 0", font: "700 14px var(--font-atkinson)", color: "var(--jam, #C2476B)" }}>{state.error}</p>
      )}
    </form>
  );
}
