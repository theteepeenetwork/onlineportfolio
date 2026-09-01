# Exceptional access to a child's data

**Status: in force.** Approved by the owner and merged on 2026-08-17 with
SAFEGUARDING rule 20, which points here and is dated in that document's
Amendments table.

Rule 20 says the operator of StoryJar cannot read a child's work **through the
product**, and a blocking gate enforces it. This document covers the thing rule
20 deliberately does not: the operator holds the hosting account, so they can
reach the database file and the media volume directly, and no amount of static
analysis changes that.

Undefined access is worse than governed access. If something happened tonight
there would be no trigger, no limit, no record and no notification, and the
decisions would be made at speed by one tired person. This is that person's
instructions to themselves, written calmly in advance.

---

## What this governs

**In scope:** any access to a child's data that does not come through a StoryJar
screen. Opening the SQLite database on the volume, reading files in the media
directory, restoring a backup and reading it, running a query against the
production database from a shell inside the container (`railway ssh`).

**Out of scope:** everything the product does. Teachers and linked parents see
children's work through StoryJar under rules 4 to 7, which is ordinary operation
and not exceptional access. The operator console is blind by rule 20 and stays
that way.

---

## The only circumstances that permit it

| # | Circumstance | Who decides | First call |
| --- | --- | --- | --- |
| 1 | A court order, police request, or a regulator exercising a statutory power | Legal obligation. Verify the request is genuine before acting on it. | A solicitor, before disclosing anything |
| 2 | The school, as data controller, instructs it in writing (for example a subject access request, or a restore they have asked for) | The school | The school's named contact, in writing |
| 3 | Reported illegal content, in particular child sexual abuse material | Legal obligation | **Do not open it.** Preserve, do not browse. Report to the police and the Internet Watch Foundation. Viewing suspected material to "check" is itself hazardous and is not required of you |
| 4 | A safeguarding concern where the school itself, or a member of its staff, is the subject | The operator, because every other route in this product terminates at the school | The local authority's designated officer (LADO), **not** the person concerned |
| 5 | Data corruption or loss where recovery cannot be done blind | The operator | Nobody, but the record below is still required |

Circumstance 4 is the reason this document exists. Everywhere else in StoryJar,
a concern about a child is routed to the school's DSL under rule 17. If the
concern is about the school, that loop closes on itself, and the only person
standing outside it is the operator.

## What is never a trigger

Curiosity. Debugging that could be done on synthetic data. Checking whether a
feature "looks right". A teacher asking informally. A parent asking. Wanting to
see whether a bug report is real. Marketing, screenshots, demos, or testimonials.
Improving the product. None of these are exceptional circumstances, and the
existence of a genuine list above does not soften any of them.

If the reason is not on the list, the answer is no. Add a named, audited,
aggregate-only operation to the product instead, which is what rule 20 requires.

---

## The procedure

**Before.** Write down, before opening anything: the date and time, which
circumstance above applies, what specifically is being looked for, and the
narrowest thing that answers it. If you cannot name the narrowest thing, you are
not ready to look.

**Then send the notification, before you look.** Not after. This is the step
that makes the rest of the procedure real, and it is the one that will feel
easiest to defer. Send it to whoever the table below names, saying what you are
about to open and why. If the circumstance forbids telling a particular party,
tell the one it does not forbid.

**During.** Open only that. One child's record, not a table. One file, not a
directory. Do not take copies. Do not screenshot. If the answer arrives before
you have seen everything you opened, stop there.

**After.** Complete the record below within the same day, and tell the same
people what was actually found and done.

## The record

Every invocation records: the date and time, the circumstance number, who
authorised it, what was accessed at the narrowest description that is still
true, why that was the minimum, who was notified and when, and what was done
with anything retained.

**The record must live where the operator cannot quietly remove it.** An audit
trail that its subject can edit is not accountability, it is a diary. Every audit
row StoryJar writes is stored in the same database file, on the same volume, held
in the same account as the thing it records, so it cannot serve as evidence
against the operator.

**Which is why the notification below is the record, and why its timing is the
whole control.** Notify before you look, or as you look. Never afterwards.
Telling somebody afterwards leaves you free to decide, once you have seen what
you found, whether to tell them at all. Telling them first takes that choice away
from you at the moment you are least able to make it well. An email in a school's
inbox cannot be edited, deleted or backdated by the person who sent it, which is
the property no amount of logging on our own infrastructure can provide.

The point is not the paperwork. It is that somebody outside your control knows
this happened, before you know what you will find.

## Notification

The default is **before you look**. The column below says what to do when a
circumstance makes that impossible, and those are the only exceptions.

| Circumstance | Who is told | First notice |
| --- | --- | --- |
| 1, court or police | The school, unless the order forbids telling them | Before, unless the order forbids it, then as soon as it permits |
| 2, school instruction | The school instructed it, so they already know. Confirm scope back to them in writing | Before, by confirming what you are about to open |
| 3, illegal content | Police and IWF. The school, on police advice | Before. And do not open the material at all |
| 4, concern about the school | LADO. **Not** the individual concerned, and not the school if it would prejudice the matter | Before |
| 5, recovery | The school, if any child's data was read | Before, unless the service is down and recovery cannot wait, then within one working day |

Circumstance 5 is the only routine exception, and it is narrow: it applies when
the service is actually broken, not when it is merely inconvenient to wait.

---

## Known weaknesses of this procedure, stated rather than hidden

**One person authorises their own access.** StoryJar is operated by one person,
so circumstances 4 and 5 have the operator deciding, acting and recording. That
is not separation of duties and no wording makes it so. It is mitigated only by
the record being external and by review; it would be properly fixed by a second
named person who must countersign.

**The application does not log infrastructure access.** Reading the volume
directly leaves no trace inside StoryJar. The record above is written by hand,
which means it depends on the honesty of the person it constrains. This is the
single biggest gap here.

**There is no tamper-proof copy of the audit log, and this procedure does not
try to build one.** A cryptographic audit chain was considered and rejected as
disproportionate for a one-person service where this procedure should fire
approximately never. The notification above does the same job in one email: a
message already sitting in a school's inbox cannot be edited, deleted or
backdated by its sender. Revisit that judgement if a second person joins, when
the log starts constraining somebody other than its keeper, or if a school asks
for more.

**This is not legal advice.** The routes above, in particular the LADO route and
the handling of illegal content, follow the ordinary shape of safeguarding
practice in England, and the specifics deserve an hour of a solicitor's time
before anyone relies on them.

---

## Review

Every invocation is reviewed after the fact, even when the reviewer is the same
person who invoked it, and the review is written next to the record. If a year
passes with no invocation, that is recorded too, so that silence is a finding
rather than an absence of paperwork.

---

## Removing a file from the shared library directory (added 2026-09-01)

`SHARED_MEDIA_DIR` (`/data/media-shared` on Railway) holds StoryJar's own
published teaching art. **Withdrawing a library activity sets `published: false`
and stops the file being served — it does not delete it**, and there is no screen
anywhere that deletes one.

That is fine while nothing personal is in there, which is enforced rather than
assumed: `publishRefusal()` in `src/lib/libraryPermission.ts` refuses to publish a
template that references any pupil's work, any pupil's draft, or another
teacher's template, and it refuses *before* a byte is copied.

**If a file ever does need erasing from that directory** — a mistake, or a gap in
that check — withdrawing the activity is the immediate containment step and takes
seconds: the `/uploads` route answers a shared path only where a published row
references it, so the bytes stop being served the moment the flag flips. Erasing
them then needs volume access, which is this document's subject and is logged
accordingly. Do the withdrawal first; it is the part that stops disclosure.
