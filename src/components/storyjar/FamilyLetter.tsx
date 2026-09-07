import { JarLogo } from "@/components/storyjar/JarLogo";

// The letter that carries ONE family code home, as paper.
//
// Extracted from the single-child letter page so that page and the whole-class
// sheet (`/teacher/class/[classId]/letters`) print the identical thing. A
// teacher who has sent one letter home should be able to send thirty without
// discovering that the thirty look different, and a wording fix should never
// need making twice.
//
// Presentational only, and deliberately so: it holds no database call, no
// ownership check and no `headers()` read. The caller proves the teacher owns
// the child, resolves the code, and renders the QR. That keeps the scoping in
// one place per route rather than hidden inside a component both routes share
// (SAFEGUARDING rules 4 and 8).

const CODE_BGS = ["#F7E0E6", "#FBEED3", "#D8ECE8", "#F7E0E6", "#FBEED3", "#D8ECE8", "#F7E0E6", "#FBEED3"];
const CODE_TILTS = ["-2deg", "1.5deg", "-1deg", "2deg", "-1.5deg", "1deg", "-2deg", "1deg"];

export function FamilyLetter({
  studentName,
  code,
  qrSvg,
  prettyUrl,
  className,
  headingLevel = "h1",
}: {
  studentName: string;
  code: string;
  /** Pre-rendered QR SVG markup pointing at the family sign-in page. */
  qrSvg: string;
  /** The host and path a parent types, e.g. "storyjar.co.uk/family". */
  prettyUrl: string;
  /** Extra classes for the sheet, so the bulk page can add its page-break rule. */
  className?: string;
  /**
   * The letter's own title tag. On paper it is always the biggest thing on the
   * sheet, but a screen reader does not see sheets: on the whole-class page
   * thirty letters sit under that page's own h1, so they become h2 and the
   * document keeps one outline instead of thirty competing ones (WCAG 1.3.1).
   * The printed size is set in the style and does not change with the level.
   */
  headingLevel?: "h1" | "h2";
}) {
  const Heading = headingLevel;
  const SubHeading = headingLevel === "h1" ? "h2" : "h3";
  return (
    <div className={className ? `letter-sheet ${className}` : "letter-sheet"} style={{ width: "100%", maxWidth: 620 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <JarLogo width={28} height={34} />
        <span style={{ font: "600 26px var(--font-fredoka)", color: "var(--ink)" }}>storyjar</span>
      </div>

      <Heading style={{ margin: "14px 0 0", font: "600 34px/1.15 var(--font-fredoka)" }}>
        See what {studentName} has been making at school
      </Heading>

      <p style={{ margin: "16px 0 0", font: "400 17px/1.6 var(--font-atkinson)", color: "var(--ink-soft)" }}>
        {studentName}&rsquo;s class keeps a jar of their work: photos, drawings and their own words.
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
          <SubHeading style={{ margin: 0, font: "600 20px var(--font-fredoka)" }}>How to look</SubHeading>
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
          <strong>A few things worth knowing.</strong> You will only ever see {studentName}, and only
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
  );
}
