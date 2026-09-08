import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { registersForTeacher } from "@/lib/consentForms";
import { CONSENT_ANSWER_LABEL, PACKED_LUNCH_LABEL } from "@/lib/consent";

// The permission-slip register: the list a teacher takes on the trip.
//
// THIS IS THE ONLY SCREEN IN THE PRODUCT THAT NAMES A CHILD BESIDE AN ANSWER,
// and it is the class teacher's, because they are the adult who takes the class
// out of the building. The office sees counts on the admin console — how many
// are outstanding in 4B, how many lunches the kitchen needs — and asks the
// teacher if it needs a name, exactly as it did with paper (rule 5, and the
// "administrative records" clause in rule 21).
//
// `registersForTeacher` scopes on `class: { teacherId }`, so a colleague's class
// is not reachable from here even by knowing a form's id: there is no id in this
// route to guess at.

export default async function FormsRegister() {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;

  const [me, registers] = await Promise.all([
    db.teacher.findUnique({ where: { id: user.teacher.id }, select: { schoolId: true } }),
    registersForTeacher(user.teacher.id),
  ]);

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "28px 32px 60px" }}>
      <h1 style={{ margin: 0, font: "600 30px var(--font-fredoka)", color: "var(--ink)" }}>Permission slips</h1>
      <p style={{ margin: "8px 0 0", font: "400 15px/1.6 var(--font-atkinson)", color: "var(--sj-muted)", maxWidth: 680 }}>
        Who has answered, and who hasn&rsquo;t. Families answer in their own family space, so there is nothing to print
        and nobody to chase for a lost slip in a book bag.
      </p>

      {!me?.schoolId ? (
        <Notice>
          Permission slips come with a school plan: the office writes the slip and sends it to whole classes. There is
          nothing to do here.
        </Notice>
      ) : registers.length === 0 ? (
        <Notice>
          Your school hasn&rsquo;t sent a permission slip to one of your classes yet. When it does, the register appears
          here on its own.
        </Notice>
      ) : null}

      {registers.map((r) => (
        <section
          key={`${r.id}-${r.className}`}
          aria-labelledby={`form-${r.id}-${r.className.replace(/\W+/g, "-")}`}
          style={{ marginTop: 22, background: "var(--cream)", border: "2px solid var(--calm-border)", borderRadius: 16, padding: "18px 22px" }}
        >
          <h2
            id={`form-${r.id}-${r.className.replace(/\W+/g, "-")}`}
            style={{ margin: 0, font: "600 20px var(--font-fredoka)", color: "var(--ink)" }}
          >
            {r.title}
          </h2>
          <p style={{ margin: "4px 0 0", font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>
            {r.className} · sent by {r.sentBy}
            {r.closesOn ? ` · answers asked for by ${r.closesOn}` : ""}
          </p>
          <p style={{ margin: "10px 0 0", font: "700 15px var(--font-atkinson)", color: "var(--ink)" }}>
            {r.counts.given} gave permission · {r.counts.notGiven} did not ·{" "}
            {r.counts.waiting === 0 ? "everyone has answered" : `${r.counts.waiting} still to answer`}
            {r.asksPackedLunch ? ` · ${r.counts.packedLunch} packed ${r.counts.packedLunch === 1 ? "lunch" : "lunches"}` : ""}
          </p>

          {/* A table, because it is one: a child per row and the same question
              down the column. A list of paragraphs would read the class name
              out again for every child on a screen reader. */}
          <table style={{ width: "100%", marginTop: 14, borderCollapse: "collapse", font: "400 16px var(--font-atkinson)", color: "var(--ink)" }}>
            <caption style={{ captionSide: "top", textAlign: "left", font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)", paddingBottom: 6 }}>
              Every child in {r.className}, and their family&rsquo;s answer.
            </caption>
            <thead>
              <tr>
                <th scope="col" style={TH}>Child</th>
                <th scope="col" style={TH}>Answer</th>
                {r.asksPackedLunch && <th scope="col" style={TH}>Packed lunch</th>}
              </tr>
            </thead>
            <tbody>
              {r.rows.map((row) => (
                <tr key={row.childId}>
                  <th scope="row" style={{ ...TD, font: "700 16px var(--font-atkinson)" }}>{row.childName}</th>
                  <td style={TD}>
                    {row.answer === null ? (
                      <span style={{ color: "var(--sj-muted)" }}>Not answered yet</span>
                    ) : (
                      <span style={{ color: row.answer === "GIVEN" ? "#2E6B64" : "#C2476B", fontWeight: 700 }}>
                        {CONSENT_ANSWER_LABEL[row.answer]}
                      </span>
                    )}
                  </td>
                  {r.asksPackedLunch && (
                    <td style={TD}>{row.packedLunch ? PACKED_LUNCH_LABEL : "—"}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Said on the screen, not only in a document: a teacher who reads
              "not answered yet" and rings a house needs to know StoryJar is not
              where a reason for it is recorded. */}
          <p style={{ margin: "14px 0 0", font: "400 14px/1.55 var(--font-atkinson)", color: "var(--sj-muted)" }}>
            A family can change their answer until the school closes the form. Anything medical, dietary or about how a
            child is looked after goes to the school office — it is not asked for or kept here.
          </p>
        </section>
      ))}
    </main>
  );
}

const TH: React.CSSProperties = {
  textAlign: "left",
  font: "700 14px var(--font-atkinson)",
  color: "var(--sj-muted)",
  borderBottom: "2px solid var(--calm-border)",
  padding: "6px 8px 6px 0",
};

const TD: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #F5F0E6",
  padding: "10px 8px 10px 0",
  verticalAlign: "top",
};

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: "18px 0 0", font: "400 15px/1.6 var(--font-atkinson)", color: "var(--ink)", background: "var(--cream)", border: "2px solid var(--calm-border)", borderRadius: 14, padding: "14px 18px", maxWidth: 680 }}>
      {children}
    </p>
  );
}
