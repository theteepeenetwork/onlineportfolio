import Image from "next/image";
import { StatusBadge } from "./StatusBadge";

export type JournalItemView = {
  id: string;
  type: string;
  caption: string | null;
  textContent: string | null;
  mediaPath: string | null;
  mediaPathsJson: string | null;
  status: string;
  authorRole: string;
  teacherNote: string | null;
  createdAt: Date;
  skills: { id: string; name: string }[];
  quizScore?: number | null;
  quizTotal?: number | null;
};

// All image paths for an item: the multi-page list if present, else the single
// cover image, else nothing.
function mediaPaths(item: JournalItemView): string[] {
  if (item.mediaPathsJson) {
    try {
      const paths = JSON.parse(item.mediaPathsJson) as string[];
      if (Array.isArray(paths) && paths.length) return paths;
    } catch {
      // fall through to the single path
    }
  }
  return item.mediaPath ? [item.mediaPath] : [];
}

const TYPE_ICON: Record<string, string> = {
  PHOTO: "📷",
  TEXT: "✏️",
  DRAWING: "🎨",
};

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

// Renders one piece of work in a journal. Used on both the student timeline
// and the teacher's view of a student.
export function JournalItemCard({
  item,
  showStatus = false,
  showQuizScore = false,
}: {
  item: JournalItemView;
  showStatus?: boolean;
  // Teacher-only: the child never sees their quiz score (silent capture).
  showQuizScore?: boolean;
}) {
  return (
    <article className="card overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 pt-3 text-sm text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden>{TYPE_ICON[item.type] ?? "📌"}</span>
          <span>{formatDate(item.createdAt)}</span>
          {item.authorRole === "TEACHER" && (
            <span className="rounded bg-brand/10 px-1.5 py-0.5 text-xs font-semibold text-brand">
              Added by teacher
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          {showQuizScore && item.quizTotal != null && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              ❓ Quiz {item.quizScore}/{item.quizTotal}
            </span>
          )}
          {showStatus && <StatusBadge status={item.status} />}
        </span>
      </div>

      {(() => {
        const paths = mediaPaths(item);
        if (paths.length === 0) return null;
        return (
          <div className="mt-3 space-y-1">
            {paths.map((src, i) => (
              <div key={src} className="relative bg-black/5">
                <Image
                  src={src}
                  alt={item.caption ?? "A piece of work"}
                  width={800}
                  height={600}
                  className="mx-auto h-auto w-full max-h-[70vh] object-contain"
                  unoptimized
                />
                {paths.length > 1 && (
                  <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
                    {i + 1} / {paths.length}
                  </span>
                )}
              </div>
            ))}
          </div>
        );
      })()}

      {item.textContent && (
        <p className="whitespace-pre-wrap px-4 py-3 text-lg leading-relaxed">
          {item.textContent}
        </p>
      )}

      {item.caption && (
        <p className="px-4 pt-3 text-base font-medium">{item.caption}</p>
      )}

      {item.teacherNote && item.status === "RETURNED" && (
        <p className="mx-4 mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <span className="font-semibold">Teacher: </span>
          {item.teacherNote}
        </p>
      )}

      {item.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-4 pt-3">
          {item.skills.map((s) => (
            <span
              key={s.id}
              className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700"
            >
              {s.name}
            </span>
          ))}
        </div>
      )}

      {/* Bottom padding when there's nothing but media/caption above. */}
      {!item.skills.length && <div className="pb-4" />}
    </article>
  );
}
