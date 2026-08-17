# Exceptional access to a child's data

**Status: draft for the owner's approval. Not in force until approved and dated
in the Amendments table of [`SAFEGUARDING.md`](../SAFEGUARDING.md).**

Rule 20 says the operator of Storyjar cannot read a child's work **through the
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

**In scope:** any access to a child's data that does not come through a Storyjar
screen. Opening the SQLite database on the volume, reading files in the media
directory, restoring a backup and reading it, running a query with `railway run`.

**Out of scope:** everything the product does. Teachers and linked parents see
children's work through Storyjar under rules 4 to 7, which is ordinary operation
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

Circumstance 4 is the reason this document exists. Everywhere else in Storyjar,
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

**During.** Open only that. One child's record, not a table. One file, not a
directory. Do not take copies. Do not screenshot. If the answer arrives before
you have seen everything you opened, stop there.

**After.** Complete the record below within the same day, and make the
notification the circumstance calls for.

## The record

Every invocation records: the date and time, the circumstance number, who
authorised it, what was accessed at the narrowest description that is still
true, why that was the minimum, who was notified and when, and what was done
with anything retained.

**The record must live where the operator cannot quietly remove it.** An audit
trail that its subject can edit is not accountability, it is a diary. Until the
off-box copy exists (see the weaknesses below), the record goes in a medium
outside the operator's own infrastructure, and the school is told it exists.

## Notification

| Circumstance | Who is told | When |
| --- | --- | --- |
| 1, court or police | The school, unless the order forbids it | As soon as permitted |
| 2, school instruction | The school already knows. Confirm what was done | Within one working day |
| 3, illegal content | Police and IWF. The school, on police advice | Immediately |
| 4, concern about the school | LADO. **Not** the individual concerned, and not the school if it would prejudice the matter | Immediately |
| 5, recovery | The school, if any child's data was read | Within one working day |

---

## Known weaknesses of this procedure, stated rather than hidden

**One person authorises their own access.** Storyjar is operated by one person,
so circumstances 4 and 5 have the operator deciding, acting and recording. That
is not separation of duties and no wording makes it so. It is mitigated only by
the record being external and by review; it would be properly fixed by a second
named person who must countersign.

**The application does not log infrastructure access.** Reading the volume
directly leaves no trace inside Storyjar. The record above is written by hand,
which means it depends on the honesty of the person it constrains. This is the
single biggest gap here.

**The off-box audit copy does not exist yet.** It is the highest-value
improvement available and is recorded in `FINDINGS.md` rather than assumed.

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
