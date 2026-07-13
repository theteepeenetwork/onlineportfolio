import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TopBar } from "@/components/TopBar";
import { teacherNav } from "@/lib/teacherNav";
import { readQuiz, readAnswers, type QuizOption } from "@/lib/quiz";
import { QueueBoard } from "./QueueBoard";

function formatWhen(d: Date) {
  const time = d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return `${time} · ${day}`;
}

// A readable label for an option: its text, else a marker for a picture-only
// answer, else a dash for "not answered". Rendered as plain text (never HTML).
function optionLabel(o: QuizOption | null | undefined): { text: string; imagePath?: string } | null {
  if (!o) return null;
  return { text: o.text ?? (o.imagePath ? "Picture" : "—"), imagePath: o.imagePath };
}

// Reconstruct the per-question review (child's choice vs the correct answer)
// from the frozen quiz snapshot + the child's stored selections.
function buildQuizReview(snapshotJson: string | null, answersJson: string | null) {
  const quiz = readQuiz(snapshotJson);
  if (!quiz.questions.length) return null;
  const byQ = new Map(readAnswers(answersJson).map((a) => [a.questionId, a.selectedOptionId]));
  return quiz.questions.map((q) => {
    const chosenId = byQ.get(q.id) ?? null;
    const chosen = q.options.find((o) => o.id === chosenId) ?? null;
    const correct = q.options.find((o) => o.id === q.correctOptionId) ?? null;
    return {
      prompt: q.prompt,
      chosen: optionLabel(chosen),
      correct: optionLabel(correct),
      isCorrect: chosenId != null && chosenId === q.correctOptionId,
    };
  });
}

export default async function ApprovalQueue() {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;

  const [items, skills] = await Promise.all([
    db.journalItem.findMany({
      where: { status: "PENDING", class: { teacherId: user.teacher.id } },
      orderBy: { createdAt: "asc" },
      include: {
        student: { select: { name: true, avatarColor: true } },
        assignment: { select: { title: true, quizSnapshotJson: true } },
      },
    }),
    db.skill.findMany({ orderBy: { name: "asc" } }),
  ]);

  const mapped = items.map((it) => ({
    id: it.id,
    child: it.student.name,
    color: it.student.avatarColor,
    type: it.type,
    mediaPath: it.mediaPath,
    text: it.textContent,
    // Only assigned drawings have a saved activity a child can reopen, so only
    // those offer the "carry on / start again" choice when sent back.
    isActivity: Boolean(it.assignmentId) && it.type === "DRAWING",
    activity: it.assignment?.title ?? "Free choice",
    when: formatWhen(it.createdAt),
    quizScore: it.quizTotal != null ? it.quizScore : null,
    quizTotal: it.quizTotal,
    quizReview: it.quizTotal != null ? buildQuizReview(it.assignment?.quizSnapshotJson ?? null, it.quizAnswersJson) : null,
  }));

  return (
    <div className="sj" style={{ fontFamily: "var(--font-atkinson)", color: "var(--ink)", background: "var(--paper)", minHeight: "100vh", width: "100%", display: "flex", flexDirection: "column" }}>
      <TopBar links={teacherNav(items.length)} />
      <main style={{ maxWidth: 1060, margin: "0 auto", width: "100%", boxSizing: "border-box", padding: "28px 32px 60px", flex: 1 }}>
        <QueueBoard items={mapped} skills={skills} />
      </main>
    </div>
  );
}
