import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { checkAuthorizeRequest } from "@/lib/api/oauth";
import { JarLogo } from "@/components/storyjar/JarLogo";
import { ConsentForm } from "./ConsentForm";

// The consent screen. A teacher lands here from claude.ai, having asked to add
// StoryJar as a connector.
export const metadata: Metadata = { robots: { index: false, follow: false } };

const card: React.CSSProperties = {
  maxWidth: 520,
  margin: "48px auto",
  padding: 28,
  borderRadius: 18,
  border: "3px solid var(--ink)",
  background: "var(--cream)",
};

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") params.set(k, v);

  const check = await checkAuthorizeRequest(params);

  // A request we cannot validate is answered HERE, on our own page. It is never
  // redirected — a redirect to an address we just refused to trust is an open
  // redirect with an apology attached.
  if (!check.ok) return <Refused message={check.message} />;

  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") {
    // Come back to exactly this request after signing in. teacherLogin only
    // honours a `next` that starts with this path, so this is not a general
    // redirect hook (see src/app/actions/auth.ts).
    redirect(`/login/teacher?next=${encodeURIComponent(`/oauth/authorize?${params.toString()}`)}`);
  }

  const { client, redirectUri } = check.request;
  const backTo = new URL(redirectUri).host;

  return (
    <main style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <JarLogo width={40} height={40} />
        <h1 style={{ margin: 0, font: "600 26px var(--font-fredoka)", color: "var(--ink)" }}>Connect to StoryJar</h1>
      </div>

      <p style={{ margin: "0 0 18px", font: "400 17px var(--font-atkinson)", color: "var(--ink)" }}>
        {/* Rendered as a text node: the name came from the app, and React escapes it. */}
        <b>{client.name}</b> is asking to connect to your activity library as{" "}
        <b>{user.teacher.displayName}</b>.
      </p>

      <div
        style={{
          borderRadius: 14,
          border: "2px solid var(--calm-border)",
          padding: "14px 16px",
          font: "400 16px var(--font-atkinson)",
          color: "var(--ink)",
        }}
      >
        <p style={{ margin: "0 0 8px", fontWeight: 700 }}>If you allow it, this app can:</p>
        <ul style={{ margin: "0 0 14px", paddingLeft: 20 }}>
          <li>read the activities in your library</li>
          <li>make new activities and change existing ones</li>
        </ul>
        <p style={{ margin: "0 0 8px", fontWeight: 700 }}>It cannot:</p>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>see your classes, your pupils, or any of their work</li>
          <li>see anything waiting in your approval queue</li>
          <li>set an activity for a class — only you can do that</li>
        </ul>
      </div>

      <p style={{ margin: "16px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
        You&apos;ll be sent back to <b>{backTo}</b>. You can disconnect it at any time on your{" "}
        {/* Underlined, not colour-only: axe's link-in-text-block rule is the
            tracked F11 debt elsewhere in the product, and a page written today
            has no reason to add to it. */}
        <Link href="/teacher/account" style={{ color: "var(--ink)", textDecoration: "underline" }}>
          account page
        </Link>
        .
      </p>

      <ConsentForm query={params.toString()} appName={client.name} />
    </main>
  );
}

function Refused({ message }: { message: string }) {
  return (
    <main style={card}>
      <h1 style={{ margin: "0 0 12px", font: "600 26px var(--font-fredoka)", color: "var(--ink)" }}>
        StoryJar didn&rsquo;t allow that
      </h1>
      <p style={{ margin: "0 0 18px", font: "400 17px var(--font-atkinson)", color: "var(--ink)" }}>{message}</p>
      <Link className="sj-btn-outline" href="/teacher/account">
        Back to your account
      </Link>
    </main>
  );
}
