import { NextResponse } from "next/server";
import { authenticate } from "@/lib/api/http";
import { listFolders } from "@/lib/api/activities";

export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ folders: await listFolders(auth.auth.teacher) });
}
