"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { createFamilyCode, rotateFamilyCode, removeFamilyAccess } from "@/app/actions/familyAccess";

// One family's way in to this child's jar, as the teacher sees it.
//
// Deliberately thin. It carries the code (they have to print it), whether it has
// been used yet (they have to know if the letter arrived), and the three things
// they can do to it. It does NOT carry the parent's name or email, even when the
// parent has since typed one in: those are the parent's own details, given to
// StoryJar so it can send them a sign-in link, not given to the school. The
// school already knows who it posted the letter to, and that record is the
// honest one. See the note the section prints under the list.
export type FamilyLink = {
  id: string;
  code: string;
  inUse: boolean;
};

export function FamilyAccess({
  studentId,
  studentName,
  families,
}: {
  studentId: string;
  studentName: string;
  families: FamilyLink[];
}) {
  const [created, createAction, creating] = useActionState(createFamilyCode, {});

  // A code that has just been made is shown big, once, with the letter one tap
  // away, because the code is worthless to a family until it is on paper.
  const freshCode = created.code;

  return (
    <section className="card mt-8 p-5" aria-labelledby="family-access-heading">
      <h2 id="family-access-heading" className="text-xl font-bold">
        Family access
      </h2>
      <p className="mt-1 text-sm text-muted">
        Give {studentName}&rsquo;s family a code so they can see the work you have approved. Print the
        letter and send it home. You never need their email address.
      </p>

      {families.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No family can see this jar yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {families.map((family) => (
            <FamilyRow
              key={family.id}
              family={family}
              studentId={studentId}
              studentName={studentName}
              highlight={family.id === created.parentId}
            />
          ))}
        </ul>
      )}

      {freshCode && (
        <p className="mt-4 text-sm font-bold" style={{ color: "var(--glass-ink)" }}>
          New code ready. Print the letter below and send it home.
        </p>
      )}
      {created.error && (
        <p role="alert" className="mt-4 text-sm font-bold" style={{ color: "var(--jam)" }}>
          {created.error}
        </p>
      )}

      <form action={createAction} className="mt-4">
        {/* Uncontrolled (defaultValue), like the rotate/remove forms below and
            the class-code dialog: the pupil id never changes while this page is
            open, and a controlled value would be reset by useActionState's
            pending re-render at submit time, which silently defeats the
            cross-tenant tamper test. */}
        <input type="hidden" name="studentId" defaultValue={studentId} />
        <button type="submit" disabled={creating} className="btn-ghost text-sm">
          {creating ? "Making a code…" : families.length === 0 ? "＋ Add family access" : "＋ Add another family"}
        </button>
      </form>

      <p className="mt-4 text-xs text-muted">
        A code works for whoever has the letter, so StoryJar cannot tell you who is using one. The
        school&rsquo;s record of where each letter went is the record of who has access. If a letter goes
        astray, choose <strong>New code</strong> and send a fresh one.
      </p>
    </section>
  );
}

function FamilyRow({
  family,
  studentId,
  studentName,
  highlight,
}: {
  family: FamilyLink;
  studentId: string;
  studentName: string;
  highlight: boolean;
}) {
  const [rotated, rotateAction, rotating] = useActionState(rotateFamilyCode, {});
  const [removed, removeAction, removing] = useActionState(removeFamilyAccess, {});
  const [confirming, setConfirming] = useState<"rotate" | "remove" | null>(null);

  // The row disappears on the next server render; until then, say what happened
  // rather than leaving a stale code sitting on screen.
  if (removed.removed) {
    return (
      <li className="rounded-xl border-2 p-3 text-sm" style={{ borderColor: "var(--calm-border)" }}>
        Access removed. That code no longer opens {studentName}&rsquo;s jar.
      </li>
    );
  }

  const code = rotated.code ?? family.code;

  return (
    <li
      className="rounded-xl border-2 p-3"
      style={{ borderColor: highlight || rotated.code ? "var(--ink)" : "var(--calm-border)" }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg font-bold tracking-[0.18em]">{code}</span>
        <span className="text-xs text-muted">{family.inUse ? "In use" : "Not used yet"}</span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link href={`/teacher/students/${studentId}/letter?family=${family.id}`} className="btn-ghost text-sm">
            <Icon name="print" size={16} decorative /> Print letter
          </Link>
          <button
            type="button"
            onClick={() => setConfirming(confirming === "rotate" ? null : "rotate")}
            className="text-sm font-bold text-muted underline"
            aria-expanded={confirming === "rotate"}
          >
            New code
          </button>
          <button
            type="button"
            onClick={() => setConfirming(confirming === "remove" ? null : "remove")}
            className="text-sm font-bold underline"
            style={{ color: "var(--jam)" }}
            aria-expanded={confirming === "remove"}
          >
            Remove
          </button>
        </div>
      </div>

      {confirming === "rotate" && (
        <form action={rotateAction} className="mt-3 text-sm">
          <input type="hidden" name="studentId" defaultValue={studentId} />
          <input type="hidden" name="parentId" defaultValue={family.id} />
          <p className="mb-2">
            Give this family a brand-new code? The one on the letter you already sent stops working
            straight away, so you will need to print and send the new one.
          </p>
          <div className="flex gap-3">
            <button type="submit" disabled={rotating} className="btn-brand text-sm">
              {rotating ? "Making a new code…" : "Yes, new code"}
            </button>
            <button type="button" onClick={() => setConfirming(null)} className="btn-ghost text-sm">
              Cancel
            </button>
          </div>
          {rotated.error && (
            <p role="alert" className="mt-2 font-bold" style={{ color: "var(--jam)" }}>
              {rotated.error}
            </p>
          )}
        </form>
      )}

      {confirming === "remove" && (
        <form action={removeAction} className="mt-3 text-sm">
          <input type="hidden" name="studentId" defaultValue={studentId} />
          <input type="hidden" name="parentId" defaultValue={family.id} />
          <p className="mb-2">
            Take this family&rsquo;s access to {studentName}&rsquo;s jar away? It stops at once, even if
            somebody is looking at it right now. Nothing in the jar is deleted.
          </p>
          <div className="flex gap-3">
            <button type="submit" disabled={removing} className="btn-brand text-sm">
              {removing ? "Removing…" : "Yes, remove access"}
            </button>
            <button type="button" onClick={() => setConfirming(null)} className="btn-ghost text-sm">
              Cancel
            </button>
          </div>
          {removed.error && (
            <p role="alert" className="mt-2 font-bold" style={{ color: "var(--jam)" }}>
              {removed.error}
            </p>
          )}
        </form>
      )}
    </li>
  );
}
