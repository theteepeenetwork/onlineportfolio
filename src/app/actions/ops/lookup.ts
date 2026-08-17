"use server";

import { requireOperator } from "@/lib/ops/session";
import { lookupAdultByEmail } from "@/lib/ops/reads";
import {
  isLookupKind,
  reasonProblem,
  type AdultRecordDto,
  type LookupKind,
} from "@/lib/ops/dto";

// The exact-match adult lookup, as a form submission.
//
// WHY A FORM POST AND NOT A URL
//
// A search term in a query string ends up in the browser history, in any proxy
// log, and in a screenshot of the address bar. The term here is an adult's
// email address, so it goes in a request body and comes back in a response,
// and the only durable copy is the audit row that ruling R11 requires.
//
// WHAT THIS FUNCTION IS AUTHORITATIVE FOR
//
// All of it. The form does no validation the server does not repeat: the
// minimum reason length, the maximum, the choice of table and the address are
// all re-checked here, because the client half of a Server Action is a POST
// endpoint anybody can craft a request to.
//
// A rejected submission is NOT audited, because nothing was looked up. The
// audit row is written by src/lib/ops/reads.ts, in the same function that does
// the read, so a lookup cannot happen without one.

export type OpsLookupState = {
  error?: string;
  /** Which field the error belongs to, so focus can be moved to it. */
  field?: "email" | "reason";
  /** Present once a lookup has actually run. Null means nothing matched. */
  record?: AdultRecordDto | null;
  kind?: LookupKind;
  /** Echoed back so a rejected submission does not empty the form. */
  values?: { kind: string; email: string; reason: string };
};

export async function opsLookupAdult(
  _previous: OpsLookupState,
  formData: FormData,
): Promise<OpsLookupState> {
  await requireOperator();

  const kindRaw = String(formData.get("kind") ?? "");
  const email = String(formData.get("email") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const values = { kind: kindRaw, email, reason };

  if (!isLookupKind(kindRaw)) {
    return { error: "Choose whether you are looking for a member of staff or a parent.", values };
  }

  // Order matters for the person, not for the machine: tell them about the
  // reason before telling them about the address, because the reason is the
  // part people skip and having to retype an address twice is a small cruelty.
  const problem = reasonProblem(reason);
  if (problem) return { error: problem, field: "reason", values };

  if (!email.trim()) {
    return {
      error: "Type the whole email address. Part of an address will not find anybody.",
      field: "email",
      values,
    };
  }

  const outcome = await lookupAdultByEmail(kindRaw, email, reason);
  if (!outcome.ok) return { error: outcome.message, values };

  return { record: outcome.record, kind: kindRaw, values };
}
