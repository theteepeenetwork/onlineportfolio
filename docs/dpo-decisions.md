# DPO decision log — Storyjar

Storyjar is a one-person operation; the founder is also its Data Protection
Officer. This file is the written record of data-protection decisions taken in
that capacity — what was decided, when, and why. It exists so a school's data
lead, an auditor, or a future colleague can see that these calls were made
deliberately, not by default.

> This is an internal record, not a substitute for professional legal advice.
> Items worth an outside check are flagged in the relevant entry.

---

## 2026-07-18 — Stated age range widened 3–7 → 3–11

**Decision:** Approved changing the stated age range of Storyjar's data subjects
from **3–7** to **3–11** across every customer-facing surface: the Privacy
policy, Terms, the Data Processing Agreement (data-subjects clause), the
Safeguarding statement, the Policies landing page, and the two marketing/metadata
mentions (landing hero, site description).

**Why:** the product was deliberately widened to serve the full primary phase
(Nursery–Year 6); the legal instruments must name the actual data subjects. The
engineering docs and product had already moved to 3–11; the legal copy was the
remaining inconsistency.

**Data-protection assessment:** widening the age band introduces **no new data
category** — the same data is held for an older child as a younger one (first
name; the moments they create; optional teacher-added skill tags and dates). No
new processing, no new third party, no change to retention. So no other legal
text required changing at the same time.

**Deliberately not changed:** the Policies page keeps its "Draft — under review"
status (the wider policy set is not yet finalised — see RETENTION.md, still
pending review); "first name only" stands (true at every age).

**Noted for later (not actioned):** if the optional KS2 PIN (SAFEGUARDING rule 1
amendment) is ever built, the Privacy policy will need a line describing it, as a
PIN hash is data held about the child. No action until that ships.

**Decided by:** the founder/DPO. **Recorded:** 2026-07-18.

---

## 2026-07-18 — Retention schedule reviewed and approved

**Decision:** Reviewed every period in `RETENTION.md` and approved the schedule
**as written** — no periods changed:

- **Frozen (lapsed) account: 12 months** before permanent deletion, kept. The
  data-minimisation pull toward a shorter window was weighed against the school
  being the data controller, the 6/9/11-month warning emails, and the parent
  download reminder; 12 months with those safeguards was judged proportionate.
- **Audit logs: 2 years rolling; the bare deletion record: 6 years**, kept.
- **In-progress drafts and returned/rejected moments: 30 days**, approved.
- **Child-PIN row:** retention treatment confirmed (hash deleted immediately when
  a teacher turns PINs off; never exported or shown). *The full PIN feature
  sign-off is still required before any PIN reaches a child* — this entry covers
  only its retention handling.
- The `ageMode` row (a teacher display setting, not child data) confirmed.

**Explicit caveat carried into the doc, not signed away:** the
frozen → deletion **automation** is not built yet (a tracked P2 gap). This review
approves the *schedule*; it does not claim the lapsed-account lifecycle is
enforced automatically today — it is carried out manually until the pipeline
ships. Erasure **on request** already works (deletion cascades exist). Recorded
so no one reads the approval as "the system does all this automatically."

**Still open after this review (not signed off here):** automating the
frozen→deletion pipeline; the full child-PIN feature review; and surfacing this
schedule in plain language in the customer-facing privacy notice / DPA
(Children's Code transparency).

**Decided by:** the founder/DPO. **Recorded:** 2026-07-18.
