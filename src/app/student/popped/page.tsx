import Link from "next/link";
import { Icon } from "@/components/icons/Icon";
import { ClearMarkedDraft } from "@/components/ClearMarkedDraft";
import { getCurrentUser } from "@/lib/auth";
import { studentCopy } from "@/lib/copy/student";
import { PoppedJar } from "./PoppedJar";

// The celebration shown right after a child pops a moment into the jar. The KS1
// jar (PoppedJar) is a client component so tapping it replays the animation;
// everything else stays server-rendered. "Back to my jar" returns to their
// journal (where the moment now waits).
export default async function PoppedInPage() {
  // The child is signed in when they land here; speak their class's register
  // (SJ-06). Fall back to the younger wording if the session can't be read.
  const user = await getCurrentUser();
  const mode = user?.role === "STUDENT" ? user.student.ageMode : "KS1";
  const c = studentCopy(mode);

  return (
    <div className="sj" data-ks={mode} style={{ fontFamily: "var(--font-atkinson)", color: "var(--ink)", background: "var(--paper)", minHeight: "100vh", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "40px 20px" }}>
      <ClearMarkedDraft />
      {mode === "KS2" ? (
        /* Older children have no jar to drop into — a calm tick, not a jar
           bounce (SJ-06). */
        <svg width="150" height="150" viewBox="0 0 24 24" aria-label={c.status.justArrived}>
          <circle cx="12" cy="12" r="10" fill="#37796f" />
          <path d="M7 12.4l3.2 3.2L17 9" fill="none" stroke="#FFFDF7" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <PoppedJar />
      )}
      <h1 style={{ margin: "10px 0 0", font: "600 calc(54px * var(--sj-type-scale, 1)) var(--font-fredoka)", color: "#37796f" }}>{c.celebration.heading}</h1>
      <p style={{ margin: "12px 0 0", font: "400 calc(26px * var(--sj-type-scale, 1)) var(--font-atkinson)", color: "var(--ink-soft)" }}>{c.celebration.subtitle}</p>
      <Link href="/student" style={{ marginTop: 34, minHeight: 72, display: "inline-flex", alignItems: "center", font: "600 calc(26px * var(--sj-type-scale, 1)) var(--font-fredoka)", color: "var(--paper)", background: "var(--jam)", border: "3px solid var(--ink)", borderRadius: 999, padding: "14px 48px", textDecoration: "none", boxShadow: "0 5px 0 var(--jam-deep)", gap: 12 }}>{c.add.backToJar} <Icon name={mode === "KS2" ? "home" : "jar"} size={30} decorative /></Link>
    </div>
  );
}
