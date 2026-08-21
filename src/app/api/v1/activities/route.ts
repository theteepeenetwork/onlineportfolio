import { NextResponse } from "next/server";
import { authenticate, readJson, requireWritable, apiError } from "@/lib/api/http";
import { ActivityInputError, createActivity, listActivities } from "@/lib/api/activities";

// The REST shape of the same operations the MCP tools expose. It exists so the
// connector is testable without an MCP client, and so a school with its own
// tooling has something ordinary to call. Both surfaces go through the same
// functions in src/lib/api/activities.ts — there is no second permission model.

export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  return NextResponse.json({
    activities: await listActivities(auth.auth.teacher, {
      search: url.searchParams.get("search") ?? undefined,
      limit: Number(url.searchParams.get("limit")) || undefined,
    }),
  });
}

export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const frozen = await requireWritable(auth.auth.teacher);
  if (frozen) return frozen;

  const body = await readJson(req);
  if (!body) return apiError("invalid_request", "The request body wasn't JSON.");

  try {
    const created = await createActivity(auth.auth.teacher, {
      title: body.title,
      instructions: body.instructions,
      tags: body.tags,
      folderId: body.folder_id,
      pages: body.pages,
      questions: body.questions,
    });
    return NextResponse.json({ activity: created }, { status: 201 });
  } catch (err) {
    if (err instanceof ActivityInputError) return apiError("invalid_request", err.message);
    console.error("[api] create activity failed", err instanceof Error ? err.name : typeof err);
    return apiError("server_error", "StoryJar couldn't save that just now. Please try again in a moment.");
  }
}
