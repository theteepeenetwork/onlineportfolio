import Link from "next/link";
import { SetPasswordForm } from "./form";

// Where a reset link and a staff invitation both land.
//
// NO DATABASE READ HERE, and that is deliberate. The obvious thing is to look
// the token up on the server and render "this link has expired" before showing
// the form — but a page that answers differently for a real token and an
// invented one is an oracle for anybody who wants to know whether a link they
// found is live. The token is checked once, in `setPassword`, at the moment it
// is spent, and every refusal returns the same sentence.
//
// It also means this page renders identically for an invite and a reset, which
// is right: the person is doing the same thing either way.

export const metadata = {
  title: "Set your password — StoryJar",
  robots: { index: false, follow: false },
};

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="relative flex flex-1 flex-col p-6">
      <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col justify-center">
        <div className="card relative px-8 pb-8 pt-12 text-center">
          <h1 className="text-[32px] font-semibold leading-tight">Set your password</h1>
          <p className="mt-2 text-[15px] text-muted">
            Choose a password and we&rsquo;ll sign you in.
          </p>
          {token ? (
            <SetPasswordForm token={token} />
          ) : (
            // Arriving with no token at all is somebody who typed the address or
            // followed a truncated link. Same sentence as every other refusal.
            <div className="mt-5 text-left">
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                That link has expired or has already been used. Ask for a new one and we&rsquo;ll
                send a fresh link.
              </p>
              <p className="mt-4 text-center text-sm">
                <Link
                  href="/login/teacher/forgotten"
                  className="font-bold text-brand hover:underline"
                >
                  Send me a new link
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
