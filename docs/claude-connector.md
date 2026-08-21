# Connecting Claude to StoryJar

*Written 21 August 2026.*

A teacher can point Claude at their StoryJar library and ask it to build an
activity — most usefully, *"take this worksheet and turn it into a four-page
quiz"*. This is how that works, what it can and cannot touch, and what to say to
a school that asks.

---

## What a teacher actually does

**On claude.ai.** Add a custom connector and paste the address from the
**Connect Claude** box on their account page (it is `https://storyjar.co.uk/api/mcp`).
Claude sends them to StoryJar, they sign in as themselves, and they see a screen
saying what the app will be able to do. They press **Allow Claude**. That is it —
there is no token to copy, and they can disconnect it from the same box later.

**In Claude Code or Claude Desktop.** Those take a token instead. On the same
account page they press **Make a token**, and StoryJar hands back a ready-made
command to paste. The token is shown **once** — StoryJar keeps only a
fingerprint of it, so there is nothing to show a second time. If it is lost, make
another and revoke the old one.

Then, in Claude: *"Here's Tuesday's number-bond worksheet. Make it a quiz for my
Year 2s, four questions a page."* Claude reads the worksheet, writes the
questions, and puts a new activity in the library. It finishes by giving them a
link straight to it.

---

## What it can reach, and what it can't

It can read the teacher's activities, make new ones, and change existing ones.

It **cannot** see a class, a pupil, a pupil's work, a draft, or anything waiting
in the approval queue. Not with a setting changed, not with a different token, not
with a cleverer prompt. The reason is worth being precise about, because "it's
not allowed to" and "it can't" are different promises: the code behind the
connector queries two database tables — activity templates and folders — and
never touches any other. There is no permission to widen. A connector that could
see a child's work would have to be a different piece of software, written and
reviewed as one.

It also **cannot set an activity for a class.** Everything Claude makes waits in
the library until the teacher opens it, looks at it, and assigns it themselves.
That is deliberate: the approval queue exists so an adult sees things before
children do, and a chat window is not an adult.

One more thing it deliberately does not do. If a teacher asks Claude to change an
activity a class is working on **right now**, the change lands on the library
copy and the class keeps the version they were given. A child halfway through a
quiz never has the questions move. Claude is told this, and says so.

---

## What the teacher sees afterwards

A new activity in the library with the pages and questions Claude wrote. Opening
it in the canvas shows the question boxes laid out four to a page, with the right
answer already ticked, exactly as if a teacher had placed them.

**One rough edge, so it isn't a surprise.** The little picture on the library
card is drawn by the canvas, not the server, so an activity Claude has just made
shows a plain card rather than a preview until the teacher opens it in the editor
and saves once. Everything else about it works immediately.

**And two things Claude cannot do for them.** If the answers to a question are
**pictures** rather than words — a photograph of a leaf, four shapes to choose
between — Claude cannot rewrite that quiz, and will say so. It has no way to
express "this picture", so rewriting would replace the pictures with the words
used to stand in for them. Renaming it, retagging it and changing the
instructions all still work; the questions have to be edited in StoryJar.

**The other** is that it cannot upload a picture of the worksheet itself. If a teacher wants the actual worksheet as the background —
their own layout, their own images — they should import the PDF or photo in
StoryJar first (the ＋ menu in the activity editor), and then ask Claude to add
the questions to that activity. Otherwise Claude writes the questions onto blank
pages, which is usually what people want anyway.

---

## If a school asks

- **Does Claude see our children's work?** No, and not by policy — by
  construction. The connector cannot query the tables children's work lives in.
- **Who decided to connect it?** The teacher, on their own account, with a
  consent screen naming the app. It is written to the school's audit log.
- **Can we turn it off?** The teacher revokes it in one click on their account
  page. Revoking takes effect on the next request; there is no cached copy.
- **What is Anthropic given?** Whatever the teacher types into Claude, plus the
  activities the connector returns — teaching material, no child data. StoryJar
  sends nothing to Anthropic on its own; the traffic is Claude calling StoryJar.
- **Where is this assessed?** `docs/DPIA.md` R17, and `RETENTION.md` under
  "Connector tokens" and "Connector grants and registered apps".

---

## For whoever maintains this

| Piece | Where |
| --- | --- |
| What a token can do — the whole permission model | `src/lib/api/activities.ts` |
| Tool definitions and the JSON-RPC dispatch | `src/lib/api/mcp.ts` |
| The endpoint Claude talks to | `src/app/api/mcp/route.ts` |
| Token minting, hashing, resolution | `src/lib/api/tokens.ts` |
| OAuth for claude.ai (PKCE, rotation, replay defence) | `src/lib/api/oauth.ts` |
| Question layout — four to a page, 2 × 2 | `src/lib/api/quizLayout.ts` |
| Blank page images, because page count *is* the page list | `src/lib/api/blankPage.ts` |
| The blocking tests | `tests/battery/security/connector-api.spec.ts` |

The REST API under `/api/v1` is the same operations without MCP, and exists so
the connector is testable without an MCP client. Both surfaces call the same
functions; there is no second permission model to keep in step.

**If you add a tool, the checklist is short and it is not optional.** Does it
query a model other than `ActivityTemplate` or `Folder`? Then it is not a
connector change, it is a safeguarding change, and it needs `SAFEGUARDING.md`'s
review checklist, a DPIA amendment, and a conversation — not a pull request.
