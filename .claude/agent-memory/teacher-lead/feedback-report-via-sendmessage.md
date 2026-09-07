---
name: feedback-report-via-sendmessage
description: A finished report written as plain text output never reaches the lead — every report must go through SendMessage, and going idle twice unanswered gets an agent replaced
metadata:
  type: feedback
---

Finishing the work is not reporting it. Plain text output is **not visible to
the lead session** — a report has to go through `SendMessage`. Send it as the
last act of the task, before the turn ends.

**Why:** on 2026-08-27 I completed the whole F59 access map, wrote it out as my
final assistant message, and the lead recorded it as *going idle without
reporting*. FINDINGS F63 sets the rule: an agent that goes idle twice without
answering is replaced rather than chased. The work being correct and complete
counted for nothing, because from the lead's side it was silence.

**A partial answer beats silence.** If a chase arrives, send whatever exists in
whatever state — a partial map that names what was not reached is useful, an
empty "I did not get to it" is usable. Never spend the chase turn finishing the
work first.

**How to apply:** any task received as a teammate message ends with a
`SendMessage` back to the sender, whether the outcome is a landing, a blocker,
or a read-only finding. Lead with the specific questions the lead said would
decide their next move, then the full map. Keep the file:line discipline from
[[feedback-investigate-then-stop]] — the send is the delivery mechanism, not a
reason to summarise more loosely. See [[project-shared-tree-git]] for the other
half of working alongside the leads.
