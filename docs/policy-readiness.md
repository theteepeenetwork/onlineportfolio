# Policy readiness — what stands between the draft banner and publication

**As at 15 August 2026.** Every page under `/legal` carries a "Draft for review —
not legal advice" banner, and a test asserts it is there. This file is the list of
what has to be true before that banner comes off, and who can answer each item.

**The banner is not the work.** Removing it is a statement that a school can rely
on these pages. Six things below have to be real first.

---

## Blocking — nobody else can supply these

| # | What's needed | Where it appears | Notes |
|---|---|---|---|
| **B1** | **Your full legal name** | Privacy Policy §1, Safeguarding statement | You trade as a sole trader, so the notice names you personally. There is no company to hide behind and that is fine — but it must be your real name, not "StoryJar". |
| **B2** | **A business address you're willing to publish** | Privacy Policy §1 | A sole trader must give a contactable address. **Do not publish your home address.** Options: a virtual office (~£10–30/month), your accountant's address, or a PO Box. A school's business manager will look for it, and once it is in a signed DPA it is in their filing system. |
| **B3** | **ICO registration number** | Privacy Policy §1 | See below — you almost certainly need to register. |
| **B4** | **A working `hello@storyjar.co.uk` mailbox** | Every policy page | All four role addresses now point here. Every policy tells a school this is how to raise a rights request or a safeguarding concern; if it bounces, the policy is worse than no policy. |
| **B5** | **Stripe billing-data residency** | Sub-processors table | Still marked pending. Adult billing data only, so it is not a child-data question — but the table says "pending" in public. |
| **B6** | **Railway's DPA and onward-transfer terms** | Sub-processors, DPIA R6 | Railway is US-incorporated. Obtain its DPA, record it, and confirm what its support access means. |

## ICO registration

You are a sole trader processing personal data electronically, which means you are
a **controller** for your own processing — staff and billing data, and the
service's own operation — separately from the schools' controllership of children's
data. Most such controllers must pay the **data protection fee**.

- **Tier 1 (micro): £52/year**, or **£47 by direct debit** (£5 discount).
- Confirm with the ICO's own **data protection fee self-assessment** rather than
  taking this file's word for it — some controllers are exempt.
- The registration number then goes into Privacy Policy §1.

This is the cheapest credibility you will ever buy. A DPO who cannot find you on
the ICO register will ask why before they ask anything else.

## Needs a solicitor — do not publish these without review

| # | What | Where |
|---|---|---|
| **S1** | **Liability and indemnity provisions** | Terms §7 — currently an explicit placeholder saying a solicitor must draft it. Nothing in it may limit liability that cannot be limited in law. |
| **S2** | **A full, signable DPA** with the Art. 28(3) clauses and schedules | `/legal/data-processing` is a plain-English *summary*. A school's procurement will ask for a signable document. |
| **S3** | **Review of the whole set** | `SAFEGUARDING.md` has required this from the start. The DPIA makes this review much cheaper — the reviewer is checking work rather than starting from nothing. |

**Rough shape of the cost:** a couple of hours of an education-data-protection
solicitor's time. Against a £199–£649 annual price, one school that says no because
the paperwork looked amateur costs more.

## Decided and now written in — no longer blocking

| Item | Decision |
|---|---|
| Cancellation & refunds | Cancel any time, no further charge, full access to the end of the paid year, **no part-year refunds**. Nothing is deleted at cancellation; export stays available. *(Terms §4)* |
| Service levels | **No contractual SLA.** Stated plainly: a one-person business, aiming for one working day, prioritising anything that stops a class working. Better than a promise that breaks in half term. *(Terms §6)* |
| Contact addresses | One address, `hello@storyjar.co.uk`, everywhere. Four role addresses reaching one inbox implies a team that doesn't exist. |
| Data residency | EU — Amsterdam, Netherlands. Written into privacy, DPA, family notice, safeguarding statement, terms, landing page. |
| Known accessibility issues | Published rather than omitted: the residual adult-surface contrast shortfalls, and the absence of automatic transcripts on voice notes. |
| Pricing in the Terms | Free teacher plan; school bands £199/£299/£449/£649; not VAT registered so no VAT added. |

## Suggested order

1. **Today:** set up `hello@storyjar.co.uk` (B4). Nothing else can publish without it.
2. **Today:** ICO self-assessment and register (B3). £47 and twenty minutes.
3. **This week:** sort the published address (B2), and ask Railway and Stripe the
   residency questions (B5, B6) — both are just support tickets.
4. **This week:** brief a solicitor. Send them the DPIA, the Terms and the DPA
   summary. This is the long-lead item; start it before the copy is perfect.
5. **When B1–B4 are done:** the *operational* pages — Privacy, Privacy for
   families, Cookies, Accessibility, Safeguarding, Sub-processors — can lose the
   draft banner. **Terms and the DPA should keep it until S1 and S2 are done.**

That split matters: waiting for the solicitor before publishing any of them means
going to launch with a "Draft — not to be relied upon" notice on your privacy
policy, which is the single worst page for a DPO to find it on.

## When the banner comes off

`LegalShell.tsx` currently applies the banner to every page unconditionally, and
`tests/e2e/legal.spec.ts` asserts it is present on all of them. Publishing pages
individually means:

1. Give `LegalShell` a per-page status (draft / published) from one source of truth.
2. Update the test to assert the banner on exactly the pages still marked draft —
   **not** to delete the assertion. The test should keep proving that an
   unreviewed page cannot quietly go live.
