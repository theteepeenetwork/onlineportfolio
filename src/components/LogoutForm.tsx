"use client";

import type { ReactNode } from "react";
import { logout } from "@/app/actions/auth";
import { clearAllDrafts } from "@/lib/draftStore";
import { clearCaptureDrafts } from "@/lib/captureDraft";

// The logout form, but it also wipes local drafts before signing out — so on a
// shared classroom device the next child can never be offered the previous
// child's in-progress work. (The ownerId re-check in draftStore is the real
// guarantee; this is defence-in-depth.) Keep the button as children so each
// call site keeps its own styling.
//
// BOTH device-side stores are swept, and any third one must be added here too:
// the canvas drafts in IndexedDB, and the typed words a child leaves in a
// capture box (sessionStorage). The second was added later and was not in this
// path, which is the whole hazard this form exists for — a store of children's
// work that sign-out does not know about is a store that outlives the child.
export function LogoutForm({ children }: { children: ReactNode }) {
  return (
    <form
      action={logout}
      onSubmit={() => {
        void clearAllDrafts();
        clearCaptureDrafts();
      }}
    >
      {children}
    </form>
  );
}
