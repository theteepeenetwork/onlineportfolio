"use server";

import { redirect } from "next/navigation";
import { requireOperator, signOutOperator } from "@/lib/ops/session";

// Signing out is an authenticated action, so unlike the door actions it begins
// with the full guard. It ends every session belonging to the acting operator,
// which with one account is what "sign out" honestly means and is the right
// answer to a laptop left on a train.
export async function opsSignOut(): Promise<void> {
  await requireOperator();
  await signOutOperator();
  redirect("/ops/sign-in");
}
