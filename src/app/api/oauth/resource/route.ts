import { NextResponse } from "next/server";
import { originUrl } from "@/lib/appOrigin";
import { OAUTH_SCOPE } from "@/lib/api/oauth";

// RFC 9728 protected-resource metadata, served at
// /.well-known/oauth-protected-resource (see the rewrites in next.config.ts).
// It is the first thing a connector fetches after the MCP endpoint's 401, and
// all it says is "the authorization server for this resource is over there".
export async function GET() {
  const origin = await originUrl();
  return NextResponse.json(
    {
      resource: `${origin}/api/mcp`,
      authorization_servers: [origin],
      scopes_supported: [OAUTH_SCOPE],
      bearer_methods_supported: ["header"],
      resource_name: "StoryJar activities",
      resource_documentation: `${origin}/teacher/account`,
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
