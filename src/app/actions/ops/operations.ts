"use server";

import { requireOperator } from "@/lib/ops/session";
import { rotateFamilyCode, revealParentEmail } from "@/lib/ops/operations";
import { reasonProblem } from "@/lib/ops/dto";
import { OPS_OPERATIONS, type OpsOperationId } from "@/lib/ops/registry";

// The two named operations, as form submissions.
//
// WHAT THIS LAYER IS AND IS NOT
//
// It is the person's half: it reads the form, refuses a reason that is too
// short with a message about the reason rather than about a validation, and
// hands the result back in a shape the screen can render. It decides nothing.
// Every rule it applies is applied again in src/lib/ops/operations.ts, which is
// the half an attacker cannot skip, because a Server Action is a POST endpoint
// anybody can craft a request to.
//
// The subject id comes from the form, and that is safe here for the reason
// ruling R11 relies on everywhere else in this area: the id is a cuid the
// operator can only have got from a lookup they already made and which was
// already audited. There is no list to walk and no way to guess one. The id is
// re-read on the server before anything happens to it, and a row that is not
// there is refused without saying anything else about it.
//
// A refused submission is NOT audited, because nothing happened: no row was
// changed and no address was shown. The audit row is written inside the same
// transaction as the work itself, so an operation cannot happen without one.

export type OpsOperationState = {
  /** Which operation this state belongs to, so two panels never read each other's. */
  operation?: OpsOperationId;
  ok?: boolean;
  message?: string;
  /** Set when the reason was the problem, so focus can be moved to it. */
  field?: "reason";
  /** The disclosed value, for a disclosure that succeeded. Never a code. */
  shown?: string;
  /** Echoed back so a refused submission does not empty the box. */
  reason?: string;
  /**
   * When this answer was produced. Never rendered, and never compared with the
   * clock: the screen only checks whether it has already shown this particular
   * answer, so that closing a finished panel and opening it again offers a
   * fresh form rather than the previous outcome.
   */
  at?: number;
};

async function submit(
  operation: OpsOperationId,
  formData: FormData,
): Promise<OpsOperationState> {
  const subjectId = String(formData.get("subjectId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const at = Date.now();

  const problem = reasonProblem(reason);
  if (problem) return { operation, ok: false, message: problem, field: "reason", reason, at };

  const outcome =
    operation === "OPS_FAMILY_CODE_ROTATED"
      ? await rotateFamilyCode(subjectId, reason)
      : await revealParentEmail(subjectId, reason);

  if (!outcome.ok) return { operation, ok: false, message: outcome.message, reason, at };
  return { operation, ok: true, message: outcome.message, shown: outcome.shown, reason, at };
}

export async function opsRotateFamilyCode(
  _previous: OpsOperationState,
  formData: FormData,
): Promise<OpsOperationState> {
  await requireOperator();
  return submit(OPS_OPERATIONS.OPS_FAMILY_CODE_ROTATED.id, formData);
}

export async function opsRevealParentEmail(
  _previous: OpsOperationState,
  formData: FormData,
): Promise<OpsOperationState> {
  await requireOperator();
  return submit(OPS_OPERATIONS.OPS_PARENT_EMAIL_REVEALED.id, formData);
}
