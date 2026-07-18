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
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  // Serve Stripe's Apple Pay domain-association file at the exact well-known path
  // Apple expects, backed by an env-driven route handler.
  async rewrites() {
    return [
      {
        source: "/.well-known/apple-developer-merchantid-domain-association",
        destination: "/api/apple-pay-domain-association",
      },
    ];
  },
};

export default nextConfig;
