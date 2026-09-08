import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { eveningsForTeacher } from "@/lib/meetingBookings";

// A teacher's own list for parents' evening: the sheet they work from.
//
// THIS IS THE ONE SCREEN THAT PUTS A CHILD'S NAME AGAINST A TIME, and it is the
// class teacher's, because they are the person who will be sitting there. The
// office sees counts on the admin console — is 4B full, does another letter need
// to go home — and asks the teacher if it needs a name, exactly as it did when
// the sheet was on a clipboard (rule 5's administrative-records clause).
//
// `eveningsForTeacher` scopes on the appointment's own `teacherId`, so a
// colleague's evening is not reachable from here even by knowing an event id:
// there is no id in this route to guess at.
//
// Every time on this page was formatted on the server by `slotLabel`, which
// reads the wall-clock minute in the school's zone. Nothing here calls
// `toLocaleTimeString`.

export default async function MeetingsList() {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;

  const [me, evenings] = await Promise.all([
    db.teacher.findUnique({ where: { id: user.teacher.id }, select: { schoolId: true } }),
    eveningsForTeacher(user.teacher.id),
  ]);

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "28px 32px 60px" }}>
      <h1 style={{ margin: 0, font: "600 30px var(--font-fredoka)", color: "var(--ink)" }}>Parents&rsquo; evening</h1>
      <p style={{ margin: "8px 0 0", font: "400 15px/1.6 var(--font-atkinson)", color: "var(--sj-muted)", maxWidth: 680 }}>
        Who is coming, and when. Families book their own time in their family space, so there is no list to keep and
        nobody to ring back about a swap.
      </p>

      {!me?.schoolId ? (
        <Notice>
          Parents&rsquo; evening comes with a school plan: the school picks the night and lays out the appointments.
          There is nothing to do here.
        </Notice>
      ) : evenings.length === 0 ? (
        <Notice>
          Your school hasn&rsquo;t set an evening up for one of your classes yet. When it does, your list appears here on
          its own.
        </Notice>
      ) : null}

      {evenings.map((e) => (
        <section
          key={`${e.id}-${e.className}`}
          aria-labelledby={`evening-${e.id}-${e.className.replace(/\W+/g, "-")}`}
          style={{ marginTop: 22, background: "var(--cream)", border: "2px solid var(--calm-border)", borderRadius: 16, padding: "18px 22px" }}
        >
          <h2
            id={`evening-${e.id}-${e.className.replace(/\W+/g, "-")}`}
            style={{ margin: 0, font: "600 20px var(--font-fredoka)", color: "var(--ink)" }}
          >
            {e.title}
          </h2>
          <p style={{ margin: "4px 0 0", font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>
            {e.on} · {e.className}
          </p>
          <p style={{ margin: "10px 0 0", font: "700 15px var(--font-atkinson)", color: "var(--ink)" }}>
            {e.booked} booked · {e.free === 0 ? "no times left" : `${e.free} still free`}
          </p>

          <table style={{ width: "100%", marginTop: 14, borderCollapse: "collapse", font: "400 16px var(--font-atkinson)", color: "var(--ink)" }}>
            <caption style={{ captionSide: "top", textAlign: "left", font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)", paddingBottom: 6 }}>
              Your appointments for {e.className}, in order.
            </caption>
            <thead>
              <tr>
                <th scope="col" style={TH}>Time</th>
                <th scope="col" style={TH}>Who</th>
              </tr>
            </thead>
            <tbody>
              {e.rows.map((r, i) => (
                <tr key={`${r.at}-${i}`}>
                  <th scope="row" style={{ ...TD, font: "700 16px var(--font-atkinson)" }}>{r.at}</th>
                  <td style={TD}>
                    {r.childName ?? <span style={{ color: "var(--sj-muted)" }}>Free</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {e.notBooked.length > 0 && (
            <p style={{ margin: "14px 0 0", font: "400 15px/1.6 var(--font-atkinson)", color: "var(--ink)" }}>
              <strong>Not booked yet:</strong> {e.notBooked.join(", ")}.
            </p>
          )}
          <p style={{ margin: "10px 0 0", font: "400 14px/1.55 var(--font-atkinson)", color: "var(--sj-muted)" }}>
            A family can move or give up their time until the evening, so this list is live rather than a snapshot.
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
