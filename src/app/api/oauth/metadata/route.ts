import { NextResponse } from "next/server";
import { originUrl } from "@/lib/appOrigin";
import { OAUTH_SCOPE } from "@/lib/api/oauth";

// RFC 8414 authorization-server metadata, served at
// /.well-known/oauth-authorization-server (see the rewrites in next.config.ts).
//
// Every "supported" list here is exactly one item long, and that is the design:
// authorization code with PKCE S256, public clients, one scope. A metadata
// document that advertises alternatives is a metadata document a client can be
// talked into downgrading.
export async function GET() {
  const origin = await originUrl();
  return NextResponse.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/api/oauth/token`,
      registration_endpoint: `${origin}/api/oauth/register`,
      scopes_supported: [OAUTH_SCOPE],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      service_documentation: `${origin}/teacher/account`,
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
