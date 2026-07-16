import Link from "next/link";
import { db } from "@/lib/db";
import { studentLogin } from "@/app/actions/auth";
import { JarLogo } from "@/components/storyjar/JarLogo";
import { normaliseClassCode } from "@/lib/classCodeChars";
import { studentCopy } from "@/lib/copy/student";
import { CodeEntry } from "./CodeEntry";

const TWINKLE = "M0,-12 C2,-4 4,-2 12,0 C4,2 2,4 0,12 C-2,4 -4,2 -12,0 C-4,-2 -2,-4 0,-12 Z";

// Step 1: the child (or teacher) types the class code -> ?code=XXX.
// Step 2: we show the class's students and they tap their own name.
// ?preview=1 is set by the teacher's "See what your pupils will see" link; it
// adds a teacher-only bar with a way back to the dashboard (children never get
// this param, and the link it shows is auth-guarded anyway).
export default async function StudentLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; preview?: string }>;
}) {
  const { code, preview } = await searchParams;
  const isPreview = preview === "1";
  // Strip ALL whitespace, not just the ends: the old screen modelled the code as
  // "ABC 123" in its placeholder and allowed 7 characters, but only trimmed —
  // so a child who typed exactly what they were shown could never match.
  const normalised = code === undefined ? "" : normaliseClassCode(code);

  const klass = normalised
    ? await db.class.findUnique({
        where: { classCode: normalised },
        include: { students: { orderBy: { name: "asc" } } },
      })
    : null;

  return (
    <div
      className="sj"
      style={{ fontFamily: "var(--font-atkinson)", color: "var(--ink)", background: "var(--paper)", minHeight: "100vh", width: "100%", display: "flex", flexDirection: "column" }}
    >
      {isPreview && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, flexWrap: "wrap", background: "var(--honey-tint)", borderBottom: "3px solid var(--ink)", padding: "12px 20px", font: "700 15px var(--font-atkinson)", color: "var(--honey-ink)" }}>
          <span>👀 Teacher preview — this is exactly what your pupils see.</span>
          <Link href="/teacher" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--ink)", color: "var(--paper)", textDecoration: "none", padding: "9px 18px", borderRadius: 999, font: "700 14px var(--font-atkinson)" }}>← Back to your dashboard</Link>
        </div>
      )}
      {!klass ? (
        /* ── Stage 1: enter code ── */
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "clamp(16px, 3vh, 32px) 20px", position: "relative", textAlign: "center" }}>
          <svg width="60" height="60" viewBox="0 0 24 24" style={{ position: "absolute", left: "6%", top: "14%" }} aria-hidden="true"><path transform="translate(12,12) scale(0.8)" d={TWINKLE} fill="#F0B441" /></svg>
          <svg width="44" height="44" viewBox="0 0 24 24" style={{ position: "absolute", right: "7%", bottom: "16%" }} aria-hidden="true"><path transform="translate(12,12) scale(0.7) rotate(15)" d={TWINKLE} fill="#E08A9B" /></svg>

          {/* The jar shrinks on a short screen so the pad and Next always fit
              above the fold — the whole point is that nothing buries them. */}
          <div className="sj-code-jar">
            <JarLogo width={72} height={90} />
          </div>
          <h1 style={{ margin: "clamp(8px, 1.6vh, 16px) 0 0", font: "600 clamp(28px, 4.6vw, 44px) var(--font-fredoka)" }}>{studentCopy.signIn.codeHeading}</h1>
          <p style={{ margin: "8px 0 0", font: "400 clamp(15px, 2vw, 19px) var(--font-atkinson)", color: "var(--ink-soft)" }}>{studentCopy.signIn.codeHelp}</p>

          <CodeEntry notFound={Boolean(normalised)} />
        </div>
      ) : (
        /* ── Stage 2: tap your name ── */
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "40px 56px", boxSizing: "border-box" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            <div style={{ background: "#F3E3C3", border: "3px solid var(--ink)", borderRadius: "8px 14px 14px 8px", padding: "8px 22px 8px 26px", position: "relative", transform: "rotate(-2deg)" }}>
              <div style={{ position: "absolute", left: 8, top: "50%", width: 8, height: 8, border: "3px solid var(--ink)", borderRadius: "50%", transform: "translateY(-50%)", background: "var(--paper)" }} />
              <span style={{ font: "600 26px var(--font-fredoka)", whiteSpace: "nowrap" }}>{klass.name}</span>
            </div>
            <h1 style={{ margin: 0, font: "600 44px var(--font-fredoka)" }}>{studentCopy.signIn.namesHeading}</h1>
            <Link href="/login/student" style={{ marginLeft: "auto", minHeight: 64, display: "inline-flex", alignItems: "center", font: "700 20px var(--font-atkinson)", color: "var(--sj-muted)", background: "none", border: "3px solid #C9C2B0", borderRadius: 999, padding: "12px 26px", textDecoration: "none" }}>{studentCopy.signIn.wrongClass}</Link>
          </div>

          {klass.students.length === 0 ? (
            <p style={{ marginTop: 40, font: "400 22px var(--font-atkinson)", color: "var(--ink-soft)" }}>
              {studentCopy.signIn.noNames}
            </p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 20, marginTop: 34 }}>
              {klass.students.map((s) => (
                <form key={s.id} action={studentLogin}>
                  <input type="hidden" name="studentId" value={s.id} />
                  {/* The verified class code travels with the choice; the server
                      re-checks the pupil belongs to this class (SAFEGUARDING 4/8). */}
                  <input type="hidden" name="code" value={klass.classCode} />
                  <button type="submit" className="sj-namecard" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, width: "100%", background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 18, padding: "22px 10px", minHeight: 150, boxSizing: "border-box", boxShadow: "0 4px 0 rgba(34,48,74,0.12)", cursor: "pointer" }}>
                    <span aria-hidden="true" style={{ width: 76, height: 76, borderRadius: "50%", background: s.avatarColor, display: "flex", alignItems: "center", justifyContent: "center", font: "600 34px var(--font-fredoka)", color: "#FFFDF7" }}>{s.name.charAt(0).toUpperCase()}</span>
                    <span style={{ font: "600 24px var(--font-fredoka)", color: "var(--ink)" }}>{s.name}</span>
                  </button>
                </form>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
