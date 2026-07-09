"use client";

import { useState } from "react";
import { JournalItemCard, type JournalItemView } from "@/components/JournalItemCard";
import { Avatar } from "@/components/Avatar";
import { approveItem, returnItem } from "@/app/actions/journal";

type Skill = { id: string; name: string };

// One pending submission in the approval queue, with controls to publish it
// (tagging skills as you go) or send it back with a note.
export function QueueItem({
  item,
  student,
  skills,
}: {
  item: JournalItemView;
  student: { name: string; avatarColor: string };
  skills: Skill[];
}) {
  const [returning, setReturning] = useState(false);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Avatar name={student.name} color={student.avatarColor} size={36} />
        <span className="font-semibold">{student.name}</span>
      </div>

      <div className="p-4">
        <JournalItemCard item={item} />
      </div>

      {!returning ? (
        <div className="border-t border-border bg-background/50 p-4">
          <form action={approveItem} className="space-y-3">
            <input type="hidden" name="itemId" value={item.id} />
            {skills.length > 0 && (
              <div>
                <p className="label">Tag against skills (optional)</p>
                <div className="flex flex-wrap gap-2">
                  {skills.map((s) => (
                    <label
                      key={s.id}
                      className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand/10 has-[:checked]:text-brand"
                    >
                      <input
                        type="checkbox"
                        name="skillIds"
                        value={s.id}
                        className="accent-brand"
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn-green">
                ✓ Approve &amp; publish
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setReturning(true)}
              >
                Send back
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="border-t border-border bg-rose-50/50 p-4">
          <form action={returnItem} className="space-y-3">
            <input type="hidden" name="itemId" value={item.id} />
            <div>
              <label className="label" htmlFor={`note-${item.id}`}>
                Note for the child (optional)
              </label>
              <input
                id={`note-${item.id}`}
                name="teacherNote"
                className="input"
                placeholder="Can you add a label to your drawing?"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn bg-rose-500 text-white hover:bg-rose-600">
                Send back
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setReturning(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
