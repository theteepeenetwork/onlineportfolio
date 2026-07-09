"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { createJournalItem } from "@/app/actions/journal";
import { DrawingCanvas } from "@/components/DrawingCanvas";

// A child responds to an activity by working on top of its template, on the
// full-screen canvas.
export function ActivityResponseForm({
  activityId,
  title,
  instructions,
  template,
}: {
  activityId: string;
  title: string;
  instructions?: string;
  template: string[];
}) {
  const [state, action] = useActionState(createJournalItem, {});
  const router = useRouter();

  return (
    <form action={action}>
      <input type="hidden" name="type" value="DRAWING" />
      <input type="hidden" name="activityId" value={activityId} />

      <DrawingCanvas
        name="drawingPages"
        fullScreen
        withCaption
        title={title}
        subtitle={instructions}
        background={template.length ? template : undefined}
        allowImport
        onClose={() => router.push("/student/activities")}
      />

      {state?.error && (
        <p className="fixed bottom-3 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-rose-600 px-3 py-2 text-sm text-white shadow-lg">
          {state.error}
        </p>
      )}
    </form>
  );
}
