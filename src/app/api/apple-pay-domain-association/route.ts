// Serves Stripe's Apple Pay domain-association file at
//   /.well-known/apple-developer-merchantid-domain-association
// (mapped there by a rewrite in next.config.ts). Apple fetches this to verify we
// own the domain before Apple Pay shows in Checkout. The file's contents come
// from the Stripe dashboard (Payment methods → Apple Pay → your domain) and are
// provided via env — not committed, and never secret. Returns 404 until set, so
// the path exists cleanly in every environment.
export const dynamic = "force-static";

export function GET(): Response {
  const body = process.env.STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION;
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
