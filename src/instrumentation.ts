// ---------------------------------------------------------------------------
// Next.js instrumentation hook (F31 — in-app mail suppression scheduler).
// ---------------------------------------------------------------------------
//
// `register` is called ONCE per server instance on startup, before the first
// request is handled, and Next.js calls it for BOTH the Node.js runtime and the
// Edge runtime.
//
// This file is therefore kept deliberately empty of real work. Everything the
// scheduler needs — the database client, Mailjet, node:crypto — is Node-only,
// so it lives in ./instrumentation-node and is imported from inside the
// NEXT_RUNTIME guard. That is the documented pattern
// (node_modules/next/dist/docs/01-app/02-guides/instrumentation.md,
// "Importing runtime-specific code") and it is what keeps those modules out of
// the Edge bundle: a guard around the *call* alone still lets the bundler trace
// the imports, which is what produced the "node:crypto is not supported in the
// Edge Runtime" / "Ecmascript file had an error" pair on every compile.
//
// Keep it that way. Anything added here that is not safe under Edge belongs in
// ./instrumentation-node instead.
// ---------------------------------------------------------------------------

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNode } = await import("./instrumentation-node");
    registerNode();
  }
}
