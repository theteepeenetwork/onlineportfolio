import Link from "next/link";
import { db } from "@/lib/db";
import { studentLogin } from "@/app/actions/auth";
import { JarLogo } from "@/components/storyjar/JarLogo";

const TWINKLE = "M0,-12 C2,-4 4,-2 12,0 C4,2 2,4 0,12 C-2,4 -4,2 -12,0 C-4,-2 -2,-4 0,-12 Z";

// Step 1: the child (or teacher) types the class code -> ?code=XXX.
// Step 2: we show the class's students and they tap their own name.
export default async function StudentLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const normalised = code?.trim().toUpperCase();

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
      {!klass ? (
        /* ── Stage 1: enter code ── */
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", position: "relative", textAlign: "center" }}>
          <svg width="60" height="60" viewBox="0 0 24 24" style={{ position: "absolute", left: "12%", top: "18%" }} aria-hidden="true"><path transform="translate(12,12) scale(0.8)" d={TWINKLE} fill="#F0B441" /></svg>
          <svg width="44" height="44" viewBox="0 0 24 24" style={{ position: "absolute", right: "14%", bottom: "22%" }} aria-hidden="true"><path transform="translate(12,12) scale(0.7) rotate(15)" d={TWINKLE} fill="#E08A9B" /></svg>

          <JarLogo width={120} height={150} />
          <h1 style={{ margin: "24px 0 0", font: "600 52px var(--font-fredoka)" }}>What&apos;s your class code?</h1>
          <p style={{ margin: "14px 0 0", font: "400 24px var(--font-atkinson)", color: "var(--ink-soft)" }}>Your teacher will show you.</p>

          <form method="get" style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 44 }}>
            <input
              name="code"
              type="text"
              maxLength={7}
              aria-label="Class code"
              placeholder="ABC 123"
              autoFocus
              autoComplete="off"
              style={{ width: 420, maxWidth: "90vw", textAlign: "center", font: "600 64px var(--font-fredoka)", letterSpacing: "0.22em", textTransform: "uppercase", padding: "20px 10px", border: "4px solid var(--ink)", borderRadius: 20, background: "var(--cream)", color: "var(--ink)", boxSizing: "border-box" }}
            />
            {normalised && (
              <p style={{ margin: "18px 0 0", font: "700 18px var(--font-atkinson)", color: "var(--jam)", background: "var(--error-tint)", borderRadius: 12, padding: "12px 18px" }}>
                We couldn&apos;t find that class code. Have another go!
              </p>
            )}
            <button type="submit" style={{ marginTop: 36, minHeight: 72, font: "600 28px var(--font-fredoka)", color: "var(--paper)", background: "var(--jam)", border: "none", padding: "18px 60px", borderRadius: 999, boxShadow: "0 5px 0 var(--jam-deep)", cursor: "pointer" }}>Next →</button>
          </form>
        </div>
      ) : (
        /* ── Stage 2: tap your name ── */
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "40px 56px", boxSizing: "border-box" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            <div style={{ background: "#F3E3C3", border: "3px solid var(--ink)", borderRadius: "8px 14px 14px 8px", padding: "8px 22px 8px 26px", position: "relative", transform: "rotate(-2deg)" }}>
              <div style={{ position: "absolute", left: 8, top: "50%", width: 8, height: 8, border: "3px solid var(--ink)", borderRadius: "50%", transform: "translateY(-50%)", background: "var(--paper)" }} />
              <span style={{ font: "600 26px var(--font-fredoka)", whiteSpace: "nowrap" }}>{klass.name}</span>
            </div>
            <h1 style={{ margin: 0, font: "600 44px var(--font-fredoka)" }}>Tap your name!</h1>
            <Link href="/login/student" style={{ marginLeft: "auto", minHeight: 64, display: "inline-flex", alignItems: "center", font: "700 20px var(--font-atkinson)", color: "var(--sj-muted)", background: "none", border: "3px solid #C9C2B0", borderRadius: 999, padding: "12px 26px", textDecoration: "none" }}>← Wrong class?</Link>
          </div>

          {klass.students.length === 0 ? (
            <p style={{ marginTop: 40, font: "400 22px var(--font-atkinson)", color: "var(--ink-soft)" }}>
              No names here yet — ask your teacher to add you.
            </p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 20, marginTop: 34 }}>
              {klass.students.map((s) => (
                <form key={s.id} action={studentLogin}>
                  <input type="hidden" name="studentId" value={s.id} />
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
