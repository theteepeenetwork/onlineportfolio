import type { NextConfig } from "next";

// Content-Security-Policy. Kept as tight as the app allows:
//  - 'unsafe-inline' is needed for scripts/styles because the UI uses inline
//    styles throughout and Next injects inline bootstrap scripts (no nonce yet).
//  - data:/blob: cover the drawing canvas, camera capture and the PDF worker.
//  - No external origins are allowed (fonts are self-hosted by next/font); there
//    are deliberately no analytics/ad/tracker domains.
// React uses eval() only in development (for debugging); it never does in
// production, so 'unsafe-eval' is added for dev only and the production CSP
// stays strict.
const isDev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
].join("; ");

// Security headers applied to every response.
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Children capture photos and voice notes on the classroom device, so camera
  // and microphone are allowed for same-origin only; everything else is denied.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), browsing-topics=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  // Where the build output goes. `.next` everywhere except a parallel test run,
  // which sets NEXT_DIST_DIR per lane: Next refuses to start a second dev server
  // for the same output directory, and the local battery runner
  // (scripts/run-suites.mjs) wants three at once, each on its own port with its
  // own database. Unset in development, in CI and in production, where it is
  // `.next` exactly as before.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // Hide Next's dev-tools indicator, and ONLY in a Playwright lane.
  //
  // The lanes run `next dev` rather than `next build`, deliberately and
  // permanently: a production build is a different application here, because
  // signInLinkMayBeShown() withholds a parent's magic-link URL under production
  // NODE_ENV (the fix for F19), so family.spec.ts fails against `next start`
  // *because the gate is working*. See AGENTS.md.
  //
  // The dev overlay is the price of that decision, and it is not free. Next
  // renders the indicator in a <nextjs-portal> at bottom-left, above the page,
  // and its subtree intercepts pointer events. On 2026-08-23 it sat directly on
  // top of the teacher rail's "expand the menu" button and swallowed 227 click
  // retries before the test timed out at 120s — on a control that is present,
  // visible and enabled, and that no teacher could ever fail to reach, because
  // in production there is no indicator. Any test touching the bottom-left of
  // any screen can meet this, so it is fixed here rather than worked around in
  // the one spec that found it.
  //
  // Gated rather than switched off outright: the indicator is useful when
  // developing and `npm run dev` keeps it. Only the Playwright configs set this,
  // in their webServer.env. Exactly "1", the OPS_ENABLED convention, so a typo
  // fails closed and leaves the indicator on rather than half-hiding it.
  //
  // Do not "fix" a blocked click with force: true instead. A test that measures
  // whether a control is reachable must not pass while it is unreachable.
  //
  // devIndicators is `false` rather than an object: as of Next 16 the object
  // form takes only `position`, and buildActivity / buildActivityPosition /
  // appIsrStatus were removed (node_modules/next/dist/docs, devIndicators.md,
  // Version History v16.0.0).
  ...(process.env.PW_HIDE_DEV_INDICATOR === "1" ? { devIndicators: false as const } : {}),

  // Custom hostnames used to reach the dev server on the local network. Next 16
  // blocks its /_next dev resources from unknown origins by default, which makes
  // the page load forever when opened via a nice hostname rather than the raw IP.
  allowedDevOrigins: ["seesaw.home"],

  experimental: {
    serverActions: {
      // Server Actions cap the request body at 1MB by default. This app submits
      // rasterised canvas pages (drawings, imported PDF/worksheet pages, photos)
      // through Server Actions — createTemplate (multi-page templates) and
      // createJournalItem (a child's multi-page response). Each page is a
      // 1000×700 PNG (up to ~1MB for photographic content), so a multi-page
      // PDF/template quickly exceeds 1MB and the save fails with a 413. Raise the
      // limit to cover a generous multi-page template; the endpoints are
      // authenticated (teacher/pupil), so the DDoS surface stays bounded.
      bodySizeLimit: "16mb",
    },
  },

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The operator area, on top of the site-wide set above. There is no
      // middleware file in this project and one is not being invented for this:
      // these two headers are static, so they belong in the same place as every
      // other static header.
      //
      //   X-Robots-Tag  the area must not be indexed, followed or archived. It
      //                 is deliberately NOT named in robots.txt (there is no
      //                 robots.txt, and adding one to name this path would
      //                 publish it).
      //   Cache-Control an edge- or browser-cached authenticated operator page
      //                 is a cross-user disclosure. Every ops route is also
      //                 force-dynamic for the same reason.
      ...["/ops", "/ops/:path*"].map((source) => ({
        source,
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      })),
    ];
  },

  // Serve Stripe's Apple Pay domain-association file at the exact well-known path
  // Apple expects, backed by an env-driven route handler.
  async rewrites() {
    return [
      {
        source: "/.well-known/apple-developer-merchantid-domain-association",
        destination: "/api/apple-pay-domain-association",
      },
      // OAuth discovery, at the fixed paths RFC 8414 and RFC 9728 define. A
      // connector fetches these before it holds any credentials. Rewrites
      // rather than route files because a directory whose name begins with a
      // dot is not something to rely on the router noticing.
      //
      // Both the bare path and the path-suffixed form are mapped: a client that
      // knows the resource is /api/mcp asks for
      // /.well-known/oauth-protected-resource/api/mcp first and falls back to
      // the bare path, and answering only one of them is the difference between
      // a connector that adds itself and one that fails with nothing to act on.
      { source: "/.well-known/oauth-authorization-server", destination: "/api/oauth/metadata" },
      { source: "/.well-known/oauth-authorization-server/:path*", destination: "/api/oauth/metadata" },
      { source: "/.well-known/oauth-protected-resource", destination: "/api/oauth/resource" },
      { source: "/.well-known/oauth-protected-resource/:path*", destination: "/api/oauth/resource" },
    ];
  },
};

export default nextConfig;
