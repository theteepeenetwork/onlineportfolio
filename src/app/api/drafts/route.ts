import { NextRequest, NextResponse } from "next/server";
import { saveDraftServer } from "@/lib/drafts";

// Cross-device draft SAVE. A route handler (not a Server Action) because the
// body carries the full composite pages (multi-MB) — Server Actions cap the
// body, and sendBeacon/keepalive can't call them. Auth + ownership are enforced
// inside saveDraftServer (deny-by-default); nothing here trusts the client.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad-json" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const surface = String(b.surface ?? "");
  const contextKey = String(b.contextKey ?? "");
  const pages = Array.isArray(b.pages) ? b.pages.map(String) : [];
  const fields =
    b.fields && typeof b.fields === "object"
      ? Object.fromEntries(
          Object.entries(b.fields as Record<string, unknown>)
            .filter(([, v]) => typeof v === "string")
            .map(([k, v]) => [k, v as string]),
        )
      : {};

  const result = await saveDraftServer(surface, contextKey, pages, fields);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.error === "frozen" ? 403 : 400 },
    );
  }
  return NextResponse.json({ ok: true, updatedAt: result.updatedAt });
}
