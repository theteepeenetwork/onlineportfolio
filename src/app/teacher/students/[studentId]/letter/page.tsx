import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { JarLogo } from "@/components/storyjar/JarLogo";
import { PrintLetterButton } from "./PrintLetterButton";

export const metadata = { title: "Family letter" };

const CODE_BGS = ["#F7E0E6", "#FBEED3", "#D8ECE8", "#F7E0E6", "#FBEED3", "#D8ECE8", "#F7E0E6", "#FBEED3"];
const CODE_TILTS = ["-2deg", "1.5deg", "-1deg", "2deg", "-1.5deg", "1deg", "-2deg", "1deg"];

// The letter that carries a family code home.
//
// Without this the whole feature is theoretical: the code has no route to the
// parent, because StoryJar has no way to reach them and deliberately never asks
// the teacher for one. The school prints this, puts it in a bag, and that is the
// entire delivery mechanism.
//
// Written for someone who has never heard of StoryJar and is reading it at the
// kitchen table. Short, plain, no jargon, and it says who to ask when it does
// not work.
export default async function FamilyLetterPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ family?: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");

  const { studentId } = await params;
  const { family: familyId } = await searchParams;

  // Ownership-scoped exactly like the pupil's journal page: a pupil in someone
  // else's class simply is not found, and neither is their family's code.
  const student = await db.student.findFirst({
    where: { id: studentId, class: { teacherId: user.teacher.id } },
    select: { id: true, name: true, class: { select: { name: true } } },
  });
  if (!student) notFound();

  const familyLink = await db.parent.findFirst({
    where: { id: familyId ?? "", children: { some: { id: student.id } } },
    select: { familyCode: true },
  });
  if (!familyLink) notFound();

  const code = familyLink.familyCode;

  // Where to go, as a QR for a phone. It points at the family sign-in page and
  // NOTHING else: the code stays printed text that has to be typed. A QR
  // carrying the code would make a photographed or dropped letter usable in one
  // tap, which is the opposite of what a code on paper is for.
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "storyjar.co.uk";
  const proto =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const familyUrl = `${proto}://${host}/family`;
  const prettyUrl = `${host}/family`;
  const qrSvg = (
    await QRCode.toString(familyUrl, {
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
      <nav className="no-print" style={{ display: "flex", alignItems: "center", gap: 16, padding: "22px 48px", flexWrap: "wrap" }}>
        <Link href={`/teacher/students/${student.id}`} style={{ font: "700 15px var(--font-atkinson)", color: "var(--ink-soft)", textDecoration: "none" }}>
          ← Back to {student.name}&rsquo;s journal
        </Link>
        <div style={{ marginLeft: "auto" }}>
          <PrintLetterButton />
        </div>
      </nav>

      <main className="letter-main" style={{ flex: 1, display: "flex", justifyContent: "center", padding: "8px 24px 80px" }}>
        <div className="letter-sheet" style={{ width: "100%", maxWidth: 620 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <JarLogo width={28} height={34} />
            <span style={{ font: "600 26px var(--font-fredoka)", color: "var(--ink)" }}>storyjar</span>
          </div>

          <h1 style={{ margin: "14px 0 0", font: "600 34px/1.15 var(--font-fredoka)" }}>
            See what {student.name} has been making at school
          </h1>

          <p style={{ margin: "16px 0 0", font: "400 17px/1.6 var(--font-atkinson)", color: "var(--ink-soft)" }}>
            {student.name}&rsquo;s class keeps a jar of their work: photos, drawings and their own words.
            Their teacher chooses what goes in it. You can now look at the jar at home, whenever you like.
          </p>

          <div style={{ marginTop: 22, background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 18, padding: "22px 24px", boxShadow: "0 5px 0 rgba(34,48,74,0.15)" }}>
            <p style={{ margin: 0, font: "700 15px var(--font-atkinson)", color: "var(--ink-soft)" }}>Your family code</p>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              {code.split("").map((ch, i) => (
                <span
                  key={i}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 58, background: CODE_BGS[i % CODE_BGS.length], border: "3px solid var(--ink)", borderRadius: 10, font: "600 32px var(--font-fredoka)", color: "var(--ink)", transform: `rotate(${CODE_TILTS[i % CODE_TILTS.length]})` }}
                >
                  {ch}
                </span>
              ))}
            </div>
            <p style={{ margin: "14px 0 0", font: "400 15px/1.5 var(--font-atkinson)", color: "var(--ink-soft)" }}>
              This code is just for your family. Please keep it somewhere safe, like a password.
            </p>
          </div>

          <div style={{ display: "flex", gap: 20, alignItems: "center", marginTop: 22, flexWrap: "wrap" }}>
            <div
              aria-hidden="true"
              style={{ width: 150, height: 150, background: "#FFFDF7", border: "3px solid var(--ink)", borderRadius: 14, padding: 12, boxSizing: "border-box", flexShrink: 0 }}
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <div style={{ flex: 1, minWidth: 220 }}>
              <h2 style={{ margin: 0, font: "600 20px var(--font-fredoka)" }}>How to look</h2>
              <ol style={{ margin: "10px 0 0", paddingLeft: 20, font: "400 16px/1.7 var(--font-atkinson)", color: "var(--ink-soft)" }}>
                <li>
                  Go to <strong>{prettyUrl}</strong>, or point your phone camera at the square.
                </li>
                <li>Choose <strong>Use the family code from your letter</strong>.</li>
                <li>Type your code and you are in.</li>
              </ol>
            </div>
          </div>

          <div style={{ marginTop: 22, borderTop: "2px dashed #EDE4D2", paddingTop: 16, font: "400 15px/1.6 var(--font-atkinson)", color: "var(--ink-soft)" }}>
            <p style={{ margin: 0 }}>
              <strong>A few things worth knowing.</strong> You will only ever see {student.name}, and only
              the work their teacher has approved. You can look and download, and the teacher looks after
              what is in the jar. There is no password to remember and nothing to pay.
            </p>
            <p style={{ margin: "10px 0 0" }}>
              If you have another child using StoryJar, sign in first and then add their code, so both
              children sit behind the one sign-in.
            </p>
            <p style={{ margin: "10px 0 0" }}>
              If the code stops working, or you would rather nobody at home had one, please ask at the
              school office. They can send a new code or take the old one away.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
