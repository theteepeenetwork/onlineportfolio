import { redirect } from "next/navigation";
import {
  CODE_LIFETIME_SECONDS,
  DOOR_LIFETIME_MINUTES,
  doorView,
  requireOpsDoor,
} from "@/lib/ops/session";
import { CodeForm, EnrolmentForm, PasswordForm } from "./forms";

// The door. The only screen under this part of the site that renders for
// somebody who is not signed in, which is why it is one of the two files the
// blindness gate allows to guard with requireOpsDoor() rather than
// requireOperator() (see OPS_DOOR_FILES in scripts/check-ops-blindness.mjs).
//
// The copy names nothing. Ruling R17 says an unauthorised request for an
// operator route gets the standard not-found response, "never a login page that
// names the area", so this page says "Sign in" and stops: no product area, no
// role, no explanation of what is behind it, and no link to or from anywhere
// else in the app (ruling R18). Path secrecy is not a control and is not being
// relied on; the controls are the password, the mandatory code, the persisted
// lockout, the throttle and the audit trail. The point of the plain copy is
// only that a scanner or a passer-by learns nothing from the response.

export const dynamic = "force-dynamic";

// See the note in src/app/ops/page.tsx: no `Metadata` type import, because the
// bare package "next" is not on the ops import allowlist and a type annotation
// is not a good enough reason to put it there.
export const metadata = {
  title: "Sign in",
  robots: { index: false, follow: false, nocache: true },
};

export default async function OpsSignInPage() {
  await requireOpsDoor();
  const view = await doorView();
  if (view.stage === "SIGNED_IN") redirect("/ops");

  return (
    <main className="mx-auto w-full max-w-md px-4 py-12">
      <div className="card p-6">
        <h1 className="font-display text-2xl" style={{ color: "var(--ink)" }}>
          Sign in
        </h1>
        {view.stage === "PASSWORD" && <PasswordForm />}
        {view.stage === "CODE" && (
          <CodeForm
            codeSeconds={CODE_LIFETIME_SECONDS}
            doorMinutes={DOOR_LIFETIME_MINUTES}
            recoveryCodesLeft={view.recoveryCodesLeft}
          />
        )}
        {view.stage === "ENROL" && (
          <EnrolmentForm
            email={view.email}
            secretForTyping={view.secretForTyping}
            enrolmentUri={view.enrolmentUri}
            codeSeconds={CODE_LIFETIME_SECONDS}
            doorMinutes={DOOR_LIFETIME_MINUTES}
          />
        )}
      </div>
    </main>
  );
}
