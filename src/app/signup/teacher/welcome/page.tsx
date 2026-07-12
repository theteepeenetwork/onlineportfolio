import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { JarLogo } from "@/components/storyjar/JarLogo";
import { PrintButton } from "./PrintButton";

const CODE_BGS = ["#F7E0E6", "#FBEED3", "#D8ECE8", "#F7E0E6", "#FBEED3", "#D8ECE8"];
const CODE_TILTS = ["-2deg", "1.5deg", "-1deg", "2deg", "-1.5deg", "1deg"];

// Success screen after signup: the new class jar's code, a print-out button,
// and a picture of how children sign in. Its own route so it survives the
// post-signup refresh and can be returned to. Also the printable class-code
// sheet reachable per class from "My classes" via ?class=<id>.
export default async function SignupWelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/signup/teacher");

  const { class: classId } = await searchParams;
  const include = { students: { orderBy: { createdAt: "asc" as const }, take: 3 } };
  // A specific class (ownership-scoped — a class the teacher doesn't own simply
  // isn't found), or, with no ?class, the one they most recently made.
  const klass = classId
    ? await db.class.findFirst({ where: { id: classId, teacherId: user.teacher.id }, include })
    : await db.class.findFirst({ where: { teacherId: user.teacher.id }, orderBy: { createdAt: "desc" }, include });
  if (!klass) redirect("/teacher");

  const code = klass.classCode;

  // A QR that drops a device straight onto this class's sign-in (the same
  // name-picker the class code opens — so it grants no more access than the
  // printed code already does). Built from the request host so it works in
  // dev and in production without hard-coding the domain.
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "storyjar.co.uk";
  const proto =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const signInUrl = `${proto}://${host}/login/student?code=${code}`;
  const qrSvg = (
    await QRCode.toString(signInUrl, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#22304A", light: "#FFFDF7" },
    })
  ).replace("<svg ", '<svg width="100%" height="100%" ');

  return (
    <div
      className="sj"
      style={{ fontFamily: "var(--font-atkinson)", color: "var(--ink)", background: "var(--paper)", minHeight: "100vh", display: "flex", flexDirection: "column", width: "100%" }}
    >
      <nav className="no-print" style={{ display: "flex", alignItems: "center", gap: 12, padding: "22px 48px" }}>
        <Link href="/teacher" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <JarLogo width={26} height={32} />
          <span style={{ font: "600 22px var(--font-fredoka)", color: "var(--ink)" }}>storyjar</span>
        </Link>
      </nav>

      <main className="welcome-main" style={{ flex: 1, display: "flex", justifyContent: "center", padding: "24px 24px 80px" }}>
        <div className="welcome-sheet" style={{ width: "100%", maxWidth: 620, textAlign: "center" }}>
          {/* Print-only masthead: on the classroom hand-out the celebratory
              badge is replaced by the Storyjar logo + wordmark. */}
          <div className="print-only" style={{ display: "none", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 6 }}>
            <JarLogo width={28} height={34} />
            <span style={{ font: "600 26px var(--font-fredoka)", color: "var(--ink)" }}>storyjar</span>
          </div>
          <div className="no-print" style={{ display: "inline-block", background: "#F0B441", border: "3px solid var(--ink)", borderRadius: 999, padding: "6px 20px", transform: "rotate(-2deg)", font: "600 17px var(--font-fredoka)" }}>Your jar is ready! ✦</div>
          <h1 style={{ margin: "20px 0 0", font: "600 40px var(--font-fredoka)" }}>{klass.name}’s class code</h1>
          <p style={{ margin: "12px auto 0", font: "400 18px/1.5 var(--font-atkinson)", color: "var(--ink-soft)", maxWidth: "28em" }}>Your pupils sign in with this code. Pin it up on the classroom door or whiteboard — anywhere little eyes can easily spot it.</p>

          <div style={{ display: "inline-flex", gap: 14, marginTop: 34, background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 20, padding: "30px 40px", boxShadow: "0 5px 0 rgba(34,48,74,0.15)" }}>
            {code.split("").map((ch, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 64, height: 76, background: CODE_BGS[i % CODE_BGS.length], border: "3px solid var(--ink)", borderRadius: 12, font: "600 44px var(--font-fredoka)", color: "var(--ink)", transform: `rotate(${CODE_TILTS[i % CODE_TILTS.length]})` }}>{ch}</span>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginTop: 30 }}>
            <div
              aria-hidden="true"
              style={{ width: 180, height: 180, background: "#FFFDF7", border: "3px solid var(--ink)", borderRadius: 16, padding: 14, boxSizing: "border-box", boxShadow: "0 5px 0 rgba(34,48,74,0.15)" }}
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <p style={{ margin: 0, font: "700 15px var(--font-atkinson)", color: "var(--ink-soft)" }}>Or scan to jump straight in — no code to type</p>
          </div>

          <div className="no-print" style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 26 }}>
            <PrintButton />
          </div>

          <div style={{ marginTop: 44, background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 18, padding: "30px 34px", boxShadow: "var(--pop-shadow)", textAlign: "left" }}>
            <h2 style={{ margin: "0 0 22px", font: "600 24px var(--font-fredoka)", textAlign: "center" }}>How your pupils sign in</h2>
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

          <div className="no-print" style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 34, flexWrap: "wrap" }}>
            <Link href="/teacher/activities" style={{ font: "700 17px var(--font-atkinson)", color: "var(--paper)", background: "var(--jam)", textDecoration: "none", padding: "15px 30px", borderRadius: 999, boxShadow: "0 4px 0 var(--jam-deep)" }}>Create your first activity</Link>
            <a href={`/login/student?code=${code}&preview=1`} target="_blank" rel="noopener noreferrer" style={{ font: "700 17px var(--font-atkinson)", color: "var(--ink)", textDecoration: "none", padding: "15px 24px" }}>See what your pupils will see ↗</a>
          </div>
        </div>
      </main>
    </div>
  );
}
