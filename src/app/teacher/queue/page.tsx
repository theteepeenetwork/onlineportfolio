import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
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
        class: { select: { name: true } },
        assignment: { select: { title: true, quizSnapshotJson: true } },
      },
    }),
    db.skill.findMany({ orderBy: { name: "asc" } }),
  ]);

  // Whether this person holds any class at all. An empty queue means two very
  // different things — "you are up to date" and "nothing here is yours" — and a
  // teaching assistant with no class was reading the first as the second and
  // concluding the screen was broken or that she was not allowed. Access in
  // StoryJar comes from the classes you hold, not from your job title, so this
  // is the fact that answers her.
  const classCount = await db.class.count({ where: { teacherId: user.teacher.id } });

  const mapped = items.map((it) => ({
    id: it.id,
    child: it.student.name,
    color: it.student.avatarColor,
    classId: it.classId,
    className: it.class.name,
    type: it.type,
    mediaPath: it.mediaPath,
    // The whole thing, not just its cover: a drawing can run to several pages,
    // and the queue is where a teacher decides whether to publish it.
    mediaPathsJson: it.mediaPathsJson,
    previewPathsJson: it.previewPathsJson,
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
    <div style={{ maxWidth: 1000 }}>
      <QueueBoard items={mapped} skills={skills} hasClasses={classCount > 0} />
    </div>
  );
}
