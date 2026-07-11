import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { JarLogo } from "@/components/storyjar/JarLogo";
import { PrintButton } from "./PrintButton";

const CODE_BGS = ["#F7E0E6", "#FBEED3", "#D8ECE8", "#F7E0E6", "#FBEED3", "#D8ECE8"];
const CODE_TILTS = ["-2deg", "1.5deg", "-1deg", "2deg", "-1.5deg", "1deg"];

// Success screen after signup: the new class jar's code, a print-out button,
// and a picture of how children sign in. Its own route so it survives the
// post-signup refresh and can be returned to.
export default async function SignupWelcomePage() {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/signup/teacher");

  // The class they just made (their most recent), with a few children to preview.
  const klass = await db.class.findFirst({
    where: { teacherId: user.teacher.id },
    orderBy: { createdAt: "desc" },
    include: { students: { orderBy: { createdAt: "asc" }, take: 3 } },
  });
  if (!klass) redirect("/teacher");

  const code = klass.classCode;

  return (
    <div
      className="sj"
      style={{ fontFamily: "var(--font-atkinson)", color: "var(--ink)", background: "var(--paper)", minHeight: "100vh", display: "flex", flexDirection: "column", width: "100%" }}
    >
      <nav style={{ display: "flex", alignItems: "center", gap: 12, padding: "22px 48px" }}>
        <Link href="/teacher" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <JarLogo width={26} height={32} />
          <span style={{ font: "600 22px var(--font-fredoka)", color: "var(--ink)" }}>storyjar</span>
        </Link>
      </nav>

      <main style={{ flex: 1, display: "flex", justifyContent: "center", padding: "24px 24px 80px" }}>
        <div style={{ width: "100%", maxWidth: 620, textAlign: "center" }}>
          <div style={{ display: "inline-block", background: "#F0B441", border: "3px solid var(--ink)", borderRadius: 999, padding: "6px 20px", transform: "rotate(-2deg)", font: "600 17px var(--font-fredoka)" }}>Your jar is ready! ✦</div>
          <h1 style={{ margin: "20px 0 0", font: "600 40px var(--font-fredoka)" }}>{klass.name}’s class code</h1>
          <p style={{ margin: "12px auto 0", font: "400 18px/1.5 var(--font-atkinson)", color: "var(--ink-soft)", maxWidth: "28em" }}>This is how your children get in. Pop it on the classroom door, the whiteboard — anywhere little eyes can see it.</p>

          <div style={{ display: "inline-flex", gap: 14, marginTop: 34, background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 20, padding: "30px 40px", boxShadow: "0 5px 0 rgba(34,48,74,0.15)" }}>
            {code.split("").map((ch, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 64, height: 76, background: CODE_BGS[i % CODE_BGS.length], border: "3px solid var(--ink)", borderRadius: 12, font: "600 44px var(--font-fredoka)", color: "var(--ink)", transform: `rotate(${CODE_TILTS[i % CODE_TILTS.length]})` }}>{ch}</span>
            ))}
          </div>

          <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 26 }}>
            <PrintButton />
          </div>

          <div style={{ marginTop: 44, background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 18, padding: "30px 34px", boxShadow: "var(--pop-shadow)", textAlign: "left" }}>
            <h2 style={{ margin: "0 0 22px", font: "600 24px var(--font-fredoka)", textAlign: "center" }}>How your children sign in</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto 1fr", gap: 14, alignItems: "center" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ width: "100%", boxSizing: "border-box", background: "var(--paper)", border: "3px solid var(--ink)", borderRadius: 12, padding: "14px 10px", font: "600 22px var(--font-fredoka)", letterSpacing: "0.15em" }}>{code}</div>
                <p style={{ margin: "10px 0 0", font: "700 15px var(--font-atkinson)" }}>1 · Type the code</p>
              </div>
              <span style={{ font: "600 26px var(--font-fredoka)", color: "var(--jam)" }}>→</span>
              <div style={{ textAlign: "center" }}>
                <div style={{ display: "flex", gap: 6, justifyContent: "center", background: "var(--paper)", border: "3px solid var(--ink)", borderRadius: 12, padding: "12px 10px" }}>
                  {klass.students.map((s) => (
                    <div key={s.id} style={{ width: 34, height: 34, borderRadius: "50%", background: s.avatarColor, display: "flex", alignItems: "center", justifyContent: "center", font: "600 15px var(--font-fredoka)", color: "#FFFDF7" }}>{s.name.charAt(0).toUpperCase()}</div>
                  ))}
                </div>
                <p style={{ margin: "10px 0 0", font: "700 15px var(--font-atkinson)" }}>2 · Tap your name</p>
              </div>
              <span style={{ font: "600 26px var(--font-fredoka)", color: "var(--jam)" }}>→</span>
              <div style={{ textAlign: "center" }}>
                <div style={{ display: "flex", gap: 8, justifyContent: "center", background: "var(--paper)", border: "3px solid var(--ink)", borderRadius: 12, padding: "12px 10px", fontSize: 24 }}>
                  <span aria-hidden="true">📷</span><span aria-hidden="true">🖍</span><span aria-hidden="true">⌨</span>
                </div>
                <p style={{ margin: "10px 0 0", font: "700 15px var(--font-atkinson)" }}>3 · Make something!</p>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 34, flexWrap: "wrap" }}>
            <Link href="/teacher/activities/new" style={{ font: "700 17px var(--font-atkinson)", color: "var(--paper)", background: "var(--jam)", textDecoration: "none", padding: "15px 30px", borderRadius: 999, boxShadow: "0 4px 0 var(--jam-deep)" }}>Create your first activity</Link>
            <Link href={`/login/student?code=${code}`} style={{ font: "700 17px var(--font-atkinson)", color: "var(--ink)", textDecoration: "none", padding: "15px 24px" }}>See what your children will see →</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
