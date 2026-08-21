"use client";

import { useActionState, useEffect } from "react";
import { decideConnector } from "@/app/actions/oauth";

// Allow / don't allow.
//
// The redirect is done here rather than by redirect() in the action, because the
// destination is another origin: the site's Content-Security-Policy sets
// `form-action 'self'`, and a form POST that redirects off-site is refused by
// the browser under that rule. Setting location after the action has returned is
// an ordinary navigation, so the connector actually completes.
export function ConsentForm({ query, appName }: { query: string; appName: string }) {
  const [state, action, pending] = useActionState(decideConnector, {});

  useEffect(() => {
    if (state?.redirectTo) window.location.href = state.redirectTo;
  }, [state?.redirectTo]);

  return (
    <form action={action} style={{ marginTop: 22 }}>
      <input type="hidden" name="query" value={query} />
      {state?.error ? (
        <p role="alert" style={{ margin: "0 0 12px", font: "700 15px var(--font-atkinson)", color: "var(--jam)" }}>
          {state.error}
        </p>
      ) : null}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button
          className="sj-btn-jam"
          type="submit"
          name="decision"
          value="allow"
          disabled={pending || Boolean(state?.redirectTo)}
        >
          {pending || state?.redirectTo ? "Connecting…" : `Allow ${appName}`}
        </button>
        <button className="sj-btn-outline" type="submit" name="decision" value="deny" disabled={pending}>
          Don&apos;t allow
        </button>
      </div>
    </form>
  );
}
