import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { JarLogo } from "@/components/storyjar/JarLogo";
import { SignupWizard } from "./SignupWizard";

export default async function TeacherSignupPage() {
  // Already signed in? Go to the dashboard.
  const user = await getCurrentUser();
  if (user?.role === "TEACHER") redirect("/teacher");
  if (user?.role === "STUDENT") redirect("/student");

  return (
    <div
      className="sj"
      style={{ fontFamily: "var(--font-atkinson)", color: "var(--ink)", background: "var(--paper)", minHeight: "100vh", display: "flex", flexDirection: "column", width: "100%" }}
    >
      <nav style={{ display: "flex", alignItems: "center", gap: 12, padding: "22px 48px" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <JarLogo width={26} height={32} />
          <span style={{ font: "600 22px var(--font-fredoka)", color: "var(--ink)" }}>storyjar</span>
        </Link>
        <span style={{ marginLeft: "auto", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>Setting up takes about two minutes</span>
      </nav>

      <main style={{ flex: 1, display: "flex", justifyContent: "center", padding: "24px 24px 80px" }}>
        <SignupWizard />
      </main>
    </div>
  );
}
