import { NextResponse } from "next/server";
import { authenticate, readJson, requireWritable, apiError } from "@/lib/api/http";
import { ActivityInputError, getActivity, updateActivity } from "@/lib/api/activities";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const activity = await getActivity(auth.auth.teacher, id);
  // Not found and not yours are the same answer, deliberately (rule 8): a
  // refusal must not confirm that another teacher's activity exists.
  if (!activity) return apiError("not_found", "There is no activity with that id in this library.");
  return NextResponse.json({ activity });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const frozen = await requireWritable(auth.auth.teacher);
  if (frozen) return frozen;

  const { id } = await params;
  const body = await readJson(req);
  if (!body) return apiError("invalid_request", "The request body wasn't JSON.");

  try {
    const updated = await updateActivity(auth.auth.teacher, id, {
      title: body.title,
      instructions: body.instructions,
      tags: body.tags,
      folderId: body.folder_id,
      pages: body.pages,
      pageContent: body.page_content,
      questions: body.questions,
      archived: body.archived,
    });
    if (!updated) return apiError("not_found", "There is no activity with that id in this library.");
    return NextResponse.json({ activity: updated });
  } catch (err) {
    if (err instanceof ActivityInputError) return apiError("invalid_request", err.message);
    console.error("[api] update activity failed", err instanceof Error ? err.name : typeof err);
    return apiError("server_error", "StoryJar couldn't save that just now. Please try again in a moment.");
  }
}
