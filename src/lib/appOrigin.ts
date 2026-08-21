import "server-only";
import { headers } from "next/headers";

// Absolute base URL for this deployment. APP_URL wins where it is set (it is, in
// production); otherwise it is derived from the request so local development and
// preview deploys produce URLs that actually resolve.
//
// Two callers need this for different reasons and both need the SAME answer:
// links inside a parent's sign-in email, and the OAuth metadata a connector
// discovers. An issuer that disagrees with the URL the client actually reached
// is an OAuth failure that reads as "the connector just doesn't work", so this
// deliberately lives in one place rather than being written twice.
export async function originUrl(): Promise<string> {
  const explicit = process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
