import Link from "next/link";
import { addSharedActivityToLibrary } from "@/app/actions/sharedActivities";

// The browse screen for Storyjar's own activities.
//
// Attribution is explicit while browsing, because a teacher deciding whether to
// use something should know whose it is. Once they have added it and made it
// their own, it is theirs and nothing marks it.

export type SharedSummary = {
  id: string;
  title: string;
  instructions: string;
  tags: string[];
  thumb: string | null;
  ageMode: string | null;
  /** The teacher's own copy, if they have already added this one. */
  addedTemplateId: string | null;
};

// The SJ-06 vocabulary, in the words a teacher uses out loud.
//
// NULL is "any age" here, NOT the youngest register. On a class it means EYFS
// because it decides what a child sees and the protective default wins; here it
// is a browsing hint shown to an adult, and labelling every unbanded activity
// as nursery content would be wrong in the other direction.
const AGE_LABEL: Record<string, string> = {
  EYFS: "EYFS · 3 to 5",
  KS1: "KS1 · 5 to 7",
  KS2: "KS2 · 7 to 11",
};
const ageLabel = (mode: string | null) => (mode && AGE_LABEL[mode]) || "Any age";

export function SharedLibrary({ activities }: { activities: SharedSummary[] }) {
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 24px 60px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 6 }}>
        <div>
          <h1 style={{ margin: 0, font: "600 30px var(--font-fredoka)" }}>Storyjar library</h1>
          <p style={{ margin: "5px 0 0", font: "400 16px var(--font-atkinson)", color: "var(--sj-muted)" }}>
            Activities we have made, ready to use. Add one and it becomes yours to change however you like.
          </p>
        </div>
        <Link
          href="/teacher/activities"
          style={{ marginLeft: "auto", font: "700 15px var(--font-atkinson)", color: "var(--ink)", textDecoration: "underline" }}
        >
          ← My activities
        </Link>
      </div>

      {activities.length === 0 ? (
        <div className="sj-card" style={{ marginTop: 24, padding: "48px 32px", textAlign: "center" }}>
          <p style={{ margin: 0, font: "600 20px var(--font-fredoka)" }}>Nothing in the library yet</p>
          <p style={{ margin: "6px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
            We are still making these. Your own activities are on the previous screen.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 18, marginTop: 24 }}>
          {activities.map((a) => (
            <article key={a.id} className="sj-card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ position: "relative", background: "#F3EEE2", aspectRatio: "4 / 3", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {a.thumb ? (
                  // A preview, without adding. The teacher is authorised to load
                  // this because it is Storyjar's own media, which is what the
                  // /uploads widening exists for.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>No preview</span>
                )}
                <span
                  style={{ position: "absolute", top: 10, left: 10, font: "700 12px var(--font-atkinson)", color: "var(--paper)", background: "var(--ink)", borderRadius: 999, padding: "4px 10px" }}
                >
                  From Storyjar
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

                <div style={{ marginTop: "auto", paddingTop: 10 }}>
                  {a.addedTemplateId ? (
                    <p style={{ margin: 0, font: "700 15px var(--font-atkinson)", color: "var(--ink-soft)" }}>
                      ✓ Added ·{" "}
                      <Link href={`/teacher/activities/${a.addedTemplateId}`} style={{ color: "var(--ink)" }}>
                        open your copy
                      </Link>
                    </p>
                  ) : (
                    <form action={addSharedActivityToLibrary}>
                      <input type="hidden" name="sharedActivityId" value={a.id} />
                      <button
                        type="submit"
                        style={{ font: "700 15px var(--font-atkinson)", color: "var(--paper)", background: "var(--jam)", border: "none", borderRadius: 999, padding: "11px 20px", cursor: "pointer", boxShadow: "0 3px 0 var(--jam-deep)" }}
                      >
                        Add to my activities
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
