"use client";

import { useEffect, useState } from "react";

// A fixture, not a feature: lets a test reach the student error boundary.
//
// There is no route that fails on purpose, and an error boundary only catches
// a throw during RENDER, so this throws from render once a query flag has been
// seen. It is compiled out of a production build: `process.env.NODE_ENV` is
// inlined at build time and the whole branch disappears, so no school will ever
// be handed a page that a URL can break. The battery runs `next dev`, where it
// is live. This weakens no guard — it sits inside the signed-in student layout,
// behind the same session check as everything else there.
export function DevThrow() {
  const [boom, setBoom] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" && window.location.search.includes("sj-throw=1")) {
      setBoom(true);
    }
  }, []);
  if (boom) throw new Error("test boundary");
  return null;
}
