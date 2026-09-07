---
name: teacher-authored-is-now-teacher-adopted
description: "Teacher-authored" is no longer true of activity content — the MCP connector's create_activity can write prompts and answers, so it is teacher-ADOPTED; do not assert authorship in safeguarding records
metadata:
  type: project
---

Anywhere a comment, a finding or a `SAFEGUARDING.md` entry describes activity
content as **teacher-authored**, that is an assumption rather than a guarantee.
The Storyjar MCP connector's `create_activity` takes `questions` and
`page_content`, so a model can write a quiz prompt, a passage or an answer
option.

The human gate that *is* real: nothing the connector makes reaches a child on its
own. A teacher opens the activity in Storyjar and chooses to set it for a class.
So the accurate word is **teacher-adopted**.

**Why:** it surfaced in the safeguarding review of read-aloud on the quiz
question (2026-08-23). The proposed amendment said "teacher-authored", which
would have written a false provenance into the document a school's DPO reads.
The protection was unaffected — the on-device voice gate does not care who wrote
the string — but the record would have been wrong.

**How to apply:** when writing a safeguarding record, a finding, or a code
comment about activity content, say what is actually guaranteed (a teacher chose
to set it) rather than who typed it. The connector is templates-only by owner
decision, so this applies to activity content and not to a teacher's note on
returned work, which is still genuinely written by the teacher.
See [[ask-what-the-repo-already-decided]].
