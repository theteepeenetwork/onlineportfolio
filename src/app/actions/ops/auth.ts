"use server";

import { redirect } from "next/navigation";
import {
  completeOperatorSignIn,
  confirmOperatorEnrolment,
  requireOpsDoor,
  startOperatorSignIn,
} from "@/lib/ops/session";

// The operator's door: the only three actions that run before an operator is
// authenticated, and therefore the only three that cannot call
// requireOperator(). They call requireOpsDoor() instead, which enforces the
// OPS_ENABLED kill switch and nothing else, and the blindness gate holds the
// two-file list that may do that (OPS_DOOR_FILES). Everything else under the
// ops roots still begins with `await requireOperator(`.
//
// In the App Router a Server Action is a POST endpoint reachable with a crafted
// request, so the guard is the first statement of each function rather than
// something an ancestor did. When the kill switch is off these actions do not
// return an error, they 404: an error message would confirm the area exists.

export type OpsFormState = { error?: string };

const SIGN_IN = "/ops/sign-in";
const CONSOLE = "/ops";

export async function opsSignIn(_prev: OpsFormState, formData: FormData): Promise<OpsFormState> {
  await requireOpsDoor();
  const result = await startOperatorSignIn(
    String(formData.get("email") ?? ""),
    String(formData.get("password") ?? ""),
  );
  if (!result.ok) return { error: result.message };
  // Back to the same screen, which now renders the next stage: enrolment the
  // first time, code entry thereafter.
  redirect(SIGN_IN);
}

export async function opsSubmitCode(_prev: OpsFormState, formData: FormData): Promise<OpsFormState> {
  await requireOpsDoor();
  const result = await completeOperatorSignIn(String(formData.get("code") ?? ""));
  if (!result.ok) return { error: result.message };
  redirect(CONSOLE);
}

export async function opsConfirmEnrolment(
  _prev: OpsFormState,
  formData: FormData,
): Promise<OpsFormState> {
  await requireOpsDoor();
  const result = await confirmOperatorEnrolment(String(formData.get("code") ?? ""));
  if (!result.ok) return { error: result.message };
  redirect(CONSOLE);
}
