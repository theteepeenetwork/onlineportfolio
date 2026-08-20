import { NextResponse } from "next/server";
import { originUrl } from "@/lib/appOrigin";
import { authenticate, readJson, requireWritable, apiError } from "@/lib/api/http";
import { FROZEN_TEACHER_MESSAGE } from "@/lib/billing";
import { handleMcpMessage, toolWrites } from "@/lib/api/mcp";

// The MCP endpoint. One URL, Streamable HTTP, JSON-RPC in the body.
//
// A teacher points Claude here:
//   claude mcp add --transport http storyjar https://storyjar.co.uk/api/mcp \
//     --header "Authorization: Bearer sj_live_…"
// or adds it as a connector on claude.ai, which finds its way here through the
// OAuth metadata advertised by the 401 below.

// Browsers are not the client here — claude.ai and Claude Desktop both call from
// a server — so there is no CORS by default and nothing to allow. These two
// origins are named anyway, and only these two, because a client that DOES call
// from the page otherwise fails with a browser error that looks nothing like the
// cause. Auth is a bearer token and never a cookie, so allowing an origin here
// grants nothing to a page that does not already hold the teacher's token.
const ALLOWED_ORIGINS = new Set(["https://claude.ai", "https://www.claude.ai"]);

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version, mcp-session-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Expose-Headers": "WWW-Authenticate",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function POST(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));

  const auth = await authenticate(req);
  if (!auth.ok) {
    for (const [k, v] of Object.entries(cors)) auth.response.headers.set(k, v);
    return auth.response;
  }

  const body = await readJson(req);
  if (!body) return withHeaders(apiError("invalid_request", "The request body wasn't JSON."), cors);

  // Batches are legal JSON-RPC and this server does not accept them. A batch is
  // only worth supporting if some of it can succeed while the rest fails, and
  // every failure mode here (a frozen account, a bad token) applies to the whole
  // request anyway — so one message per request keeps the error handling honest.
  if (Array.isArray(body)) {
    return withHeaders(apiError("invalid_request", "Send one JSON-RPC message per request."), cors);
  }

  // Writes are gated on the same billing state as the teacher's own screens,
  // checked once here rather than inside each tool so a new tool cannot be added
  // without it: `tools/call` is the only method that changes anything.
  //
  // READ-ONLY, NOT BLIND. The gate consults toolWrites() rather than firing on
  // every tool call, because a paused plan keeps viewing and downloading (see
  // RETENTION.md, account states). Gating the reads too would lock a teacher out
  // of their own library over a lapsed invoice, which is a worse failure than
  // the one being prevented.
  //
  // The refusal is returned IN BAND — a JSON-RPC result marked isError, not an
  // HTTP 403 — and that is a deliberate choice about who reads it. An MCP client
  // renders a 4xx as "the connector failed", which tells a teacher nothing they
  // can do something about. As a tool result it reaches the model, which relays
  // the actual sentence: the plan has paused and the account is read-only until
  // it is sorted. The write is refused identically either way.
  if (body.method === "tools/call" && toolWrites((body.params as { name?: unknown } | undefined)?.name)) {
    const frozen = await requireWritable(auth.auth.teacher);
    if (frozen) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: (body as { id?: string | number | null }).id ?? null,
          result: { content: [{ type: "text", text: FROZEN_TEACHER_MESSAGE }], isError: true },
        },
        { status: 200, headers: cors },
      );
    }
  }

  const origin = await originUrl();
  const outcome = await handleMcpMessage(body, auth.auth.teacher, origin);
  if (outcome.body === undefined) return new NextResponse(null, { status: outcome.status, headers: cors });
  return NextResponse.json(outcome.body, { status: outcome.status, headers: cors });
}

// A GET on an MCP endpoint is a client asking to open a server-to-client event
// stream. This server is stateless and has nothing to push, so it declines —
// which the spec allows, and which clients handle by simply not opening one.
// The 401 still comes first, so an unauthenticated GET is where a connector
// discovers the OAuth metadata.
export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  return NextResponse.json(
    { error: { type: "invalid_request", message: "This server doesn't open an event stream. Send JSON-RPC with POST." } },
    { status: 405, headers: { Allow: "POST, OPTIONS" } },
  );
}

function withHeaders(res: NextResponse, headers: Record<string, string>) {
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}
