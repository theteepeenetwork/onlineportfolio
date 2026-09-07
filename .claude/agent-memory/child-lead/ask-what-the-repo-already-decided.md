---
name: ask-what-the-repo-already-decided
description: Safeguarding triage question is not "what does this touch" but "has this codebase already answered this class of hazard" — the checklist cannot find a rule written in a comment
metadata:
  type: feedback
---

Before adding anything that stores, sends or speaks a child's content, search
for the hazard, not for the subsystem. Grep for the thing the codebase already
does about it and match that, then triage.

**Why:** the capture-draft work passed an honest triage — no auth, no access
control, no approval queue, no media path — and still missed
`src/components/LogoutForm.tsx`, which already clears the IndexedDB drafts on
sign-out with a comment saying it exists *"so on a shared classroom device the
next child can never be offered the previous child's in-progress work"*. A
second device-side store of children's words was added and was not in that path.
The checklist question could not have found it **by construction**: the rule was
in a comment on a component that the change did not touch.

The same shape appeared twice more in one evening: `draftStore.ts:107` had
already decided that an owner is re-checked on *read* rather than trusted from
the key, and `SAFEGUARDING.md`'s amendments table had already decided what
read-aloud may say. Both were answers to questions I was about to answer again.

**How to apply:** for a new store — where is it cleared, and by what? For new
speech — what is `readAloud` allowed to say, per the amendments table? For a new
id-taking route — where is the cross-tenant test? Then, and only then, ask
whether it needs review. And when in doubt escalate: being told "this was
already inside the scope note" costs a message, and inferring it wrongly is a
quiet widening of a safeguarding rule. See [[verify-a-gate-by-breaking-it]].
