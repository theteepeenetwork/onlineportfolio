"use client";

import Link from "next/link";
import { setLibraryActivityPublished, updateLibraryActivityDetails } from "@/app/actions/library";

// The publishing desk. Only StoryJar staff, signed in at the Academy, ever see
// this screen.
//
// IT SHOWS UNPUBLISHED ROWS AND THE BROWSE SCREEN DOES NOT
//
// That difference is the point of having a second screen at all. A teacher's
// library shows what is visible; this one shows what exists, so an activity
// that was promoted and never made visible is a state somebody can see and act
// on rather than a row nobody knows about.
//
// The two acts are deliberately separate. Publishing puts the activity in the
// library, invisible. Making it visible is a second button. A half-finished
// worksheet cannot reach four hundred classrooms because a menu item was one
// row further down than expected.

export type PublishedSummary = {
  id: string;
  slug: string;
  title: string;
  instructions: string;
  tags: string[];
  thumb: string | null;
  ageMode: string | null;
  published: boolean;
  sortOrder: number;
  /** The template this teacher published it from, if it was this teacher. */
  templateId: string | null;
};

// The same vocabulary the browse screen uses. NULL is "any age" here, never the
// youngest register: on a class null resolves to EYFS because it decides what a
// child sees, but here it is a hint shown to an adult.
const AGE_LABEL: Record<string, string> = {
  EYFS: "EYFS · 3 to 5",
  KS1: "KS1 · 5 to 7",
  KS2: "KS2 · 7 to 11",
};
const ageLabel = (mode: string | null) => (mode && AGE_LABEL[mode]) || "Any age";

export function PublishedLibrary({
  activities,
  notice,
  problem,
}: {
  activities: PublishedSummary[];
  notice: string | null;
  problem: boolean;
}) {
  const visible = activities.filter((a) => a.published).length;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 24px 60px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 6 }}>
        <div>
          <h1 style={{ margin: 0, font: "600 30px var(--font-fredoka)" }}>Publishing</h1>
          <p style={{ margin: "5px 0 0", font: "400 16px var(--font-atkinson)", color: "var(--sj-muted)" }}>
            Everything StoryJar has published, and everything waiting to be made visible. Build an
            activity in your own activities first, then publish it from its ⋯ menu.
          </p>
        </div>
        <Link
          href="/teacher/activities"
          style={{ marginLeft: "auto", font: "700 15px var(--font-atkinson)", color: "var(--ink)", textDecoration: "underline" }}
        >
          ← My activities
        </Link>
      </div>

      {notice && (
        <p
          role="status"
          style={{
            margin: "18px 0 0",
            font: "700 15px var(--font-atkinson)",
            color: problem ? "var(--paper)" : "var(--ink)",
            background: problem ? "var(--jam)" : "#D8ECE8",
            borderRadius: 12,
            padding: "12px 16px",
          }}
        >
          {notice}
        </p>
      )}

      {activities.length === 0 ? (
        <div className="sj-card" style={{ marginTop: 24, padding: "48px 32px", textAlign: "center" }}>
          <p style={{ margin: 0, font: "600 20px var(--font-fredoka)" }}>Nothing published yet</p>
          <p style={{ margin: "6px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
            Make an activity on the canvas, then choose &ldquo;Publish to library&rdquo; from its ⋯
            menu.
          </p>
        </div>
      ) : (
        <>
          <p style={{ margin: "22px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
            {activities.length === 1 ? "1 activity" : `${activities.length} activities`}, {visible}{" "}
            visible to teachers.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 18, marginTop: 18 }}>
            {activities.map((a) => (
              <article key={a.id} className="sj-card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <div style={{ position: "relative", background: "#F3EEE2", aspectRatio: "4 / 3", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {a.thumb && a.published ? (
                    // Only a PUBLISHED activity's media can be loaded: the
                    // /uploads route answers a shared path only where a
                    // published row references it, so an unpublished thumbnail
                    // would be a broken image rather than a preview. Showing the
                    // placeholder instead is honest about why.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>
                      {a.thumb ? "Preview once visible" : "No preview"}
                    </span>
                  )}
                  <span
                    style={{
                      position: "absolute",
                      top: 10,
                      left: 10,
                      font: "700 12px var(--font-atkinson)",
                      color: "var(--paper)",
                      background: a.published ? "var(--ink)" : "var(--jam)",
                      borderRadius: 999,
                      padding: "4px 10px",
                    }}
                  >
                    {a.published ? "Visible to teachers" : "Not visible yet"}
                  </span>
                </div>

                <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                  <h2 style={{ margin: 0, font: "700 17px var(--font-atkinson)" }}>{a.title}</h2>
                  {a.instructions && (
                    <p style={{ margin: 0, font: "400 14px/1.5 var(--font-atkinson)", color: "var(--ink-soft)" }}>{a.instructions}</p>
                  )}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ font: "700 12px var(--font-atkinson)", color: "var(--ink)", background: "#D8ECE8", borderRadius: 999, padding: "4px 10px" }}>
                      {ageLabel(a.ageMode)}
                    </span>
                    {a.tags.map((t) => (
                      <span key={t} style={{ font: "700 12px var(--font-atkinson)", color: "var(--ink)", background: "#F3E3C3", borderRadius: 999, padding: "4px 10px" }}>{t}</span>
                    ))}
                  </div>
                  <p style={{ margin: 0, font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>
                    Reference <code>{a.slug}</code>
                  </p>

                  {/* The two editorial decisions, made on the shelf rather than
                      on the canvas: which band it is offered under and where it
                      sits. Re-publishing the activity deliberately leaves both
                      alone, so a corrected worksheet cannot reset a choice
                      somebody made weeks later. */}
                  <form
                    action={updateLibraryActivityDetails}
                    style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}
                  >
                    <input type="hidden" name="slug" value={a.slug} />
                    <label style={{ font: "700 12px var(--font-atkinson)", display: "flex", flexDirection: "column", gap: 4 }}>
                      Age band
                      <select
                        name="ageMode"
                        defaultValue={a.ageMode ?? ""}
                        style={{ font: "400 14px var(--font-atkinson)", padding: "8px 10px", minHeight: 44, borderRadius: 10, border: "2px solid var(--ink)" }}
                      >
                        <option value="">Any age</option>
                        <option value="EYFS">EYFS · 3 to 5</option>
                        <option value="KS1">KS1 · 5 to 7</option>
                        <option value="KS2">KS2 · 7 to 11</option>
                      </select>
                    </label>
                    <label style={{ font: "700 12px var(--font-atkinson)", display: "flex", flexDirection: "column", gap: 4 }}>
                      Order
                      <input
                        type="number"
                        name="sortOrder"
                        defaultValue={a.sortOrder}
                        style={{ font: "400 14px var(--font-atkinson)", padding: "8px 10px", width: 84, minHeight: 44, borderRadius: 10, border: "2px solid var(--ink)" }}
                      />
                    </label>
                    <button
                      type="submit"
                      style={{ font: "700 14px var(--font-atkinson)", color: "var(--ink)", background: "transparent", border: "2px solid var(--ink)", borderRadius: 999, padding: "10px 16px", minHeight: 44, cursor: "pointer" }}
                    >
                      Save
                    </button>
                  </form>

                  <div style={{ marginTop: "auto", paddingTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <form action={setLibraryActivityPublished}>
                      <input type="hidden" name="slug" value={a.slug} />
                      <input type="hidden" name="published" value={a.published ? "0" : "1"} />
                      <button
                        type="submit"
                        style={{
                          font: "700 15px var(--font-atkinson)",
                          color: a.published ? "var(--ink)" : "var(--paper)",
                          background: a.published ? "transparent" : "var(--jam)",
                          border: a.published ? "2px solid var(--ink)" : "none",
                          borderRadius: 999,
                          padding: "11px 20px",
                          minHeight: 44,
                          cursor: "pointer",
                          boxShadow: a.published ? "none" : "0 3px 0 var(--jam-deep)",
                        }}
                      >
                        {a.published ? "Withdraw" : "Make visible"}
                      </button>
                    </form>
                    {a.templateId && (
                      <Link
                        href={`/teacher/activities/${a.templateId}`}
                        style={{ font: "700 15px var(--font-atkinson)", color: "var(--ink)", textDecoration: "underline" }}
                      >
                        Open the original
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
