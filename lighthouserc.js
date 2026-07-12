// B5 — Performance budgets (Lighthouse CI).
//
// School wifi is bad, so we budget for a throttled connection on the two pages
// that matter most in a lesson: the journal feed and the add-work/upload page.
// LCP < 2.5s and a cap on image payload. Run with: npm run test:perf
//
// This is REPORT-ONLY on PRs by default (perf is flakier than correctness); the
// CI job publishes the numbers without blocking. Flip `assert` failures to
// blocking once the budgets are comfortably met.
module.exports = {
  ci: {
    collect: {
      // Reuse the running dev server if present; otherwise start it.
      startServerCommand: "npm run dev -- --port 3000",
      startServerReadyPattern: "Ready in|started server|Local:",
      url: [
        "http://localhost:3000/login/teacher",
        "http://localhost:3000/family",
      ],
      numberOfRuns: 3,
      settings: {
        // Emulate a mid-tier device on a throttled connection (bad school wifi).
        preset: "desktop",
        throttlingMethod: "simulate",
        throttling: {
          rttMs: 150,
          throughputKbps: 1600, // ~slow 3G/poor wifi
          cpuSlowdownMultiplier: 4,
        },
      },
    },
    assert: {
      assertions: {
        // Core budget: Largest Contentful Paint under 2.5s.
        "largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
        // Keep image payloads small (bytes) — poor connections can't afford heavy media.
        "resource-summary:image:size": ["warn", { maxNumericValue: 400000 }],
        "total-byte-weight": ["warn", { maxNumericValue: 1600000 }],
        // A11y score floor as a coarse backstop to the axe suite.
        "categories:accessibility": ["warn", { minScore: 0.9 }],
      },
    },
    upload: { target: "temporary-public-storage" },
  },
};
