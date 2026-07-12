"use client";

import type { ReactNode } from "react";
import { logout } from "@/app/actions/auth";
import { clearAllDrafts } from "@/lib/draftStore";

// The logout form, but it also wipes local drafts before signing out — so on a
// shared classroom device the next child can never be offered the previous
// child's in-progress work. (The ownerId re-check in draftStore is the real
// guarantee; this is defence-in-depth.) Keep the button as children so each
// call site keeps its own styling.
export function LogoutForm({ children }: { children: ReactNode }) {
  return (
    <form action={logout} onSubmit={() => void clearAllDrafts()}>
      {children}
    </form>
  );
}
