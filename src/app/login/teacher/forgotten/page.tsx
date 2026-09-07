import Link from "next/link";
import { ForgottenPasswordForm } from "./form";

// "Forgotten your password?" — the request step.
//
// A plainer page than /login/teacher on purpose. That page has floating work
// tiles and a jar peeking over the card, which is right for the welcome; this
// one is reached by somebody who is already stuck and slightly cross, and
// decoration is not what they need. Same card, same register, no confetti.

export const metadata = {
  title: "Forgotten your password? — StoryJar",
  robots: { index: false, follow: false },
};

export default function ForgottenPasswordPage() {
  return (
    <main className="relative flex flex-1 flex-col p-6">
      <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col justify-center">
        <div className="card relative px-8 pb-8 pt-12 text-center">
          <Link
            href="/login/teacher"
            className="absolute left-3 top-1 inline-flex min-h-[44px] min-w-[44px] items-center px-2 text-[13px] font-bold text-muted hover:text-foreground"
          >
            ← Back
          </Link>
          <h1 className="text-[32px] font-semibold leading-tight">Forgotten your password?</h1>
          <p className="mt-2 text-[15px] text-muted">
            Pop your school email in and we&rsquo;ll send you a link to set a new one.
          </p>
          <ForgottenPasswordForm />
        </div>
      </div>
    </main>
  );
}
