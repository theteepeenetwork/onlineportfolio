#!/usr/bin/env node
// PR0 - the ops blindness gate. SAFEGUARDING rule 1 ("when a choice is unclear,
// take the more protective option"), rule 4 ("access is need-to-know and
// enforced on the server"), rule 5 ("admins are not all-seeing"), rule 8 ("deny
// by default") and rule 11 ("children must never be profiled").
//
// WHAT THIS IS FOR
//
// One person will run a service holding the work of children aged 3 to 11. The
// promise made to a school's data protection lead is not "we will be careful".
// It is that they can be shown exactly what StoryJar staff can and cannot see
// through the product, and that the answer is enforced by a build failure
// rather than by a sentence in a document. This script is that enforcement.
//
// It exists BEFORE any operator screen is written, on purpose. A screen written
// first is a screen the gate never checked while it was being written, and the
// whole guarantee becomes retrospective.
//
// RULE ZERO
//
// weakening this gate is the failure, not the workaround.
//
// If this gate blocks something you genuinely need, the fix is a new named
// aggregate helper in the facade with a comment explaining what it counts and
// why the count cannot identify a child. It is never an entry in an exceptions
// array. Weakening this gate is the failure, not the workaround.
//
// THERE IS NO EXCEPTIONS ARRAY, AND THERE MUST NEVER BE ONE
//
// scripts/audit-static.mjs carries a reviewed-exception list for
// dangerouslySetInnerHTML, and that is right for a rule with genuinely safe
// uses. This gate is different: every rule below describes a path to a child's
// work or to a credential that opens one, and there is no safe instance of
// those. The only legitimate edits to this file are:
//
//   1. a stricter rule, or
//   2. a fix for a PROVEN false positive, shipped in the same commit as a new
//      fixture in tests/fixtures/ops-blindness/ that proves the true positive
//      still fires.
//
// Any other edit is the failure the gate exists to catch.
//
// CREDENTIAL VALUES ARE TREATED EXACTLY LIKE A CHILD'S NAME (owner amendment C1)
//
// This is the rule most likely to be missed, because no child-data field is
// involved. signInWithFamilyCode takes a family code, finds the parent and
// creates a parent session (src/app/actions/family.ts). The class-code path
// does the equivalent for a child. So an operator who can READ a family code
// can sign in as that family and see that child's jar, and an operator who can
// read a class code can do the same for a child. Displaying either is an
// all-seeing path in disguise, so familyCode, classCode, pinHash, magic token
// values and session token values are banned exactly as hard as a caption.
//
// Support is unaffected. Rotating a leaked code never requires displaying it:
// the operator triggers a rotation and the teacher sees the new code in their
// own interface.
//
// THE ONE RULE AWAITING AN OWNER CONFIRMATION
//
// Owner amendment C2 says a parent record may show HOW MANY children are
// linked, never which and never their names. Handbook ruling R11 bans
// parent-to-child linkage "including counts". The amendment outranks the
// handbook, so C2 is the higher authority and would permit the count.
//
// This gate implements R11's stricter position anyway: it REFUSES a child count
// on a parent (rule OPS-PARENT-CHILD-LINK below). The reasoning, which is the
// reason it is written here rather than decided quietly in code:
//
//   A gate that is too strict fails loudly and visibly the moment someone
//   needs the count, and the owner can then relax it deliberately, in a
//   reviewed commit, with a fixture proving the true positive still fires. A
//   gate that is too permissive fails silently and nobody ever learns.
//   SAFEGUARDING's own instruction is that where a choice is unclear, take the
//   more protective option.
//
// There is deliberately no flag and no second branch. If the owner confirms
// C2, the change is: remove "children" and "parents" from NEVER_LINK_RELATIONS,
// and add a fixture showing the permitted shape passing and a named child still
// failing.
//
// WHAT THIS GATE CANNOT SEE, STATED PLAINLY
//
//   1. It cannot follow dynamic property access. That is why db[name] and
//      prisma[name] are banned outright rather than analysed.
//   2. It cannot read the contents of a JSON blob. That is why every *Json
//      column is on the identifier denylist rather than trusted to be filtered
//      downstream.
//   3. It cannot evaluate a runtime where clause. A filter is a promise, not a
//      structure. That is why ops reads its own audit table (OpsAuditLog)
//      instead of filtering AuditLog by actorType, and why the model rules are
//      about call SHAPES rather than about arguments.
//
// It is a floor, not a proof. It is paired with the runtime security specs and
// with review, and no document should claim more for it than that. It
// constrains the PRODUCT, not the person: the operator has host access and can
// read the SQLite file and the media volume directly. That gap belongs in the
// DPIA, not in a sentence to a school.
//
// Usage:
//   node scripts/check-ops-blindness.mjs
//   node scripts/check-ops-blindness.mjs --self-test
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs)$/;

// ---------------------------------------------------------------------------
// Scan roots (handbook ruling R1: the code namespace is `ops`, never `admin`)
// ---------------------------------------------------------------------------
// src/app/admin/ and src/app/actions/admin.ts are the SCHOOL console. They are
// a different trust level, they are tenant scoped, and they are deliberately
// NOT scanned here. Nothing in the operator programme is ever called `admin`.
//
// scripts/ops/ is deliberately absent from this list. Handbook section 5 makes
// the interim one-off operator scripts "procedurally constrained, not
// structurally blind": they run on the server with full database access by
// design. Pretending this gate covers them would be the overstatement the
// programme is trying to avoid.
const OPS_ROOTS = [
  "src/app/ops",
  "src/app/actions/ops",
  "src/lib/ops",
];

// The only two modules permitted to touch the Prisma client, per the handbook's
// shared definition of done item 6 ("no Prisma client import under the ops
// roots except the two declared modules"). reads.ts is the read chokepoint;
// audit.ts is the write-only audit helper from ruling R4.
//
// If a third module genuinely needs the client (operator sessions are the
// obvious candidate), that is a widening of this gate and it lands in the SAME
// commit as the code it permits, with a comment naming the rule and a new
// fixture. It is not a quiet edit at 11pm.
//
// WIDENING (PR1, ruling R2). The third module is src/lib/ops/session.ts, and
// the gate refused it as OPS-PRISMA-IMPORT until this line was added, which is
// the rule working. Operator identity needs the client for a reason no facade
// helper can absorb: it reads and writes the operator's OWN account and session
// rows on every request, inside a transaction when it rotates a session, and it
// is the one place in the programme that must be able to do so before anybody
// is authenticated. Routing that through reads.ts would put unauthenticated
// writes into the read chokepoint, which is worse than naming a third module.
//
// The true positive still fires for a fourth module, proved by the fixture
// tests/fixtures/ops-blindness/bad-prisma-import-in-ops-totp.txt, and the clean
// shape is proved by good-operator-session-store.txt.
//
// WIDENING (PR4, ruling R2). The fourth module is src/lib/ops/operations.ts,
// and the gate refused it as OPS-PRISMA-IMPORT until this line was added. It is
// the implementation of the frozen operation registry, and it is the only place
// under the ops roots that changes anything (see OPS-MUTATION-MODULE below,
// which is a NEW and STRICTER rule landing in the same commit and is the reason
// this widening does not widen much).
//
// Why it cannot be one of the three that already exist: a write routed through
// reads.ts would make the read chokepoint a write path and its name a lie;
// audit.ts writes exactly one row and must keep doing only that, or "the audit
// helper" stops meaning anything; session.ts is the door and handles nobody's
// record but the operator's own.
//
// The true positive still fires for a fifth module, proved by
// bad-prisma-import-in-ops-operations-helper.txt (a near-miss filename, which
// is the shape this widening invites), and the clean shape by
// good-family-code-rotation.txt.
const DECLARED_DB_MODULES = [
  "src/lib/ops/reads.ts",
  "src/lib/ops/audit.ts",
  "src/lib/ops/session.ts",
  "src/lib/ops/operations.ts",
];

// ---------------------------------------------------------------------------
// The door (PR1 WIDENING of OPS-REQUIRE-OPERATOR, ruling R2)
// ---------------------------------------------------------------------------
// Every exported callable under the ops roots must begin with
// `await requireOperator(`. Two files cannot: the sign-in screen and the
// sign-in actions are HOW an operator session is obtained, so there is no
// session yet when they run. Before PR1 this was invisible, because there was
// no door.
//
// The wrong fixes, both rejected:
//   - no guard at all on the door, which would leave the kill switch
//     unenforced on the only publicly reachable ops surface;
//   - an argument that turns requireOperator off (`requireOperator({ door:
//     true })`), which is ruling R6's shape exactly: a guard that sometimes
//     does not guard, decided by a parameter somebody can copy.
//
// The fix taken: a SECOND, narrower, differently named guard,
// `requireOpsDoor()`, which enforces OPS_ENABLED (ruling R17) and nothing else,
// permitted in exactly the files named here and nowhere else. Every other ops
// file still needs the full guard, a door file with no guard fails just as
// loudly, and adding a file to this list is a reviewed edit in a diff rather
// than a quiet call-site change.
//
// True positive still fires, proved by two fixtures:
//   bad-door-page-unguarded.txt        a door file with no guard      -> fails
//   bad-door-guard-on-console-page.txt the weak guard on a normal ops page,
//                                      which is the exact leak this widening
//                                      could have introduced             -> fails
// and the clean shape by good-door-page-guarded.txt.
//
// There is deliberately no "this listed file must exist" drift check, unlike
// the model and denylist lists, because this list rots SAFE in both directions:
// an entry pointing at a file that no longer exists permits nothing, and a door
// file that is renamed out of the list immediately fails for wanting the FULL
// guard. The failure of neglect here is a red build, not a silent hole.
const OPS_DOOR_FILES =["src/app/ops/sign-in/page.tsx", "src/app/actions/ops/auth.ts"];
const DOOR_GUARD_CALL = "await requireOpsDoor(";
const FULL_GUARD_CALL = "await requireOperator(";

// The single file allowed to write an AuditLog row (ruling R4: ops READS
// OpsAuditLog; the one permitted auditLog call shape is db.auditLog.create from
// a single write-only helper, so a platform action can appear in the affected
// school's own transparency feed).
const AUDIT_WRITE_MODULE = "src/lib/ops/audit.ts";

// The import walk stops here. src/lib/db.ts IS the Prisma client: it imports
// @prisma/client and constructs one, which is its entire job. Following the
// declared chokepoint into it and then reporting it for being the client is a
// false positive that no clean ops tree could ever avoid, and a gate that
// cannot go green is a gate somebody deletes.
//
// This loses nothing, which is why it is a legitimate narrowing rather than a
// weakening: any file that reaches the client is caught by OPS-PRISMA-IMPORT at
// the point of the import, on the importing file, before the walk gets here.
// The true positive still fires, proved by bad-prisma-import-in-action.txt and
// bad-helper-outside-ops-roots.txt.
const TERMINAL_MODULES = new Set(["src/lib/db.ts"]);

// ---------------------------------------------------------------------------
// Model classification, deny by default (SAFEGUARDING rule 8)
// ---------------------------------------------------------------------------
// Model names are PARSED from prisma/schema.prisma rather than hardcoded. A
// model in the schema that appears in none of these sets fails the build, so
// adding a model next spring cannot silently widen what ops may read. An entry
// here that no longer exists in the schema also fails, so a rename cannot
// silently empty a class.
//
// When PR1 lands Operator, OperatorSession and OpsAuditLog they go in
// OPS_OWNED, which is empty today because none of them exist yet.

// Adult and billing records. Full reads, plus the mutations the billing and
// adult-account operations need. Deletes are excluded: ruling R12 keeps school
// deletion out of v1 until a restore has been rehearsed, and when it ships the
// gate changes in the same PR.
const ADULT_READABLE = ["Teacher", "School", "Subscription", "BillingEvent"];

// Children and everything hanging off them. Counts and school-level groupBy
// only. Never a row, never a field, never a per-child figure (amendment C3:
// "no per-child activity counts", and the jarSeenAt comment in schema.prisma
// already refuses exactly this shape of metric for exactly the right reason).
const AGGREGATE_ONLY = [
  "Class",
  "Student",
  "JournalItem",
  "Draft",
  "AssignmentStudent",
  "Assignment",
  "ActivityTemplate",
  "Folder",
  "Skill",
];

// Ruling R11's fifth class. A parent record is reachable by exact-match lookup
// only: no browse, no substring, no list. The gate can enforce the call shape;
// it cannot enforce "exact match on an email the operator already had", so the
// DTO and the audited named operation carry the rest.
const LOOKUP_ONLY = [
  "Parent",
  // MailSuppression is the one of PR5's three tables that is ABOUT somebody: a
  // keyed label for an adult the provider is refusing to deliver to. It is
  // LOOKUP_ONLY rather than OPS_OWNED precisely because this class refuses
  // findMany, and findMany here is the screen nobody should build: a list of
  // every adult currently locked out of their own child's work. Answering "is
  // this one address being refused" is support. Listing them is a register.
  "MailSuppression",
];

// StoryJar's OWN published teaching content, and the least sensitive model in
// the schema.
//
// WIDENING (PR-shared-library, ruling R2: a widening lands in the same commit as
// the code it permits, with a comment naming the rule and a fixture proving the
// true positive still fires). SharedActivity was refused as OPS-MODEL-UNKNOWN
// until this class existed, which is the drift check working.
//
// Why a new class rather than ADULT_READABLE. Two reasons, both about what the
// class NAME will mean to the next reader. ADULT_READABLE is about records of
// people, and permits create, update, updateMany and upsert; SharedActivity is
// not a person and must never be written from here at all. Publishing is
// scripts/ops/publish-shared-activities.mjs, in the repository, reviewable in a
// pull request. An operator screen that could publish would be the moment this
// feature became user-generated content by accident, which the owner
// explicitly deferred.
//
// So the methods below are read-only, and deliberately do not include create,
// update, upsert or any delete. This is STRICTER than the class the task
// suggested, not looser.
//
// What it does NOT do:
//   - it does not make the content reachable through a relation. SharedActivity
//     is deliberately absent from `adultTargets` below, so both relation names
//     it participates in (`copies` on SharedActivity, `sourceShared` on
//     ActivityTemplate) are treated as child relations: an ops file may count
//     copies and may never read one. That is the direction the owner warned
//     about, since a template is a teacher's own work.
//   - it does not exempt the model from the banned-identifier rule. Its payload
//     columns carry the same names as the teacher's (templatePathsJson,
//     quizJson, objectsJson, tagsJson), all of which are on DENY_FIELDS, so an
//     ops file naming one still fails even though the content behind it here is
//     ours. The gate cannot tell the two apart from an identifier, and should
//     not try.
const PLATFORM_CONTENT = ["SharedActivity"];

// No read of any shape, not even a count that could confirm a specific row.
// Session and MagicToken hold live sign-in credentials. AuditLog.detail is free
// text written by teacher-facing actions and routinely contains a child's first
// name ("Approved Amara's moment"), so reading it is a child-data read wearing
// an operations hat (ruling R4).
const CREDENTIAL_NEVER = [
  "Session",
  "MagicToken",
  "AuditLog",
  // The connector tables (PR-connector). A teacher's API token, and the OAuth
  // client and grant behind a claude.ai connector, are live credentials for a
  // teacher's account: anyone holding one can read and rewrite that teacher's
  // activity library. They are classified exactly like Session and MagicToken,
  // which is the strictest class in this gate — an ops file may not read them,
  // may not count them, and may not confirm that a particular row exists.
  //
  // This is a TIGHTENING, not a widening (ruling R2): the drift check refused
  // all three as OPS-MODEL-UNKNOWN until they were classified, and the class
  // they landed in permits nothing. Support never needs one of these rows:
  // a teacher revokes and re-mints a token on their own account page, and the
  // operator is told a token was revoked by the teacher telling them.
  "ApiToken",
  "OAuthClient",
  "OAuthGrant",
];

// The operator's own records.
//
// WIDENING (PR1, ruling R2: a widening lands in the same commit as the code it
// permits, with a comment naming the rule and a fixture proving the true
// positive still fires). This list was empty until PR1 added the three models
// below, and the gate refused all three as OPS-MODEL-UNKNOWN until they were
// classified here, which is the drift check working exactly as intended.
//
// Why OPS_OWNED rather than a narrower class: these are the operator's OWN
// account, the operator's own browser sessions and the operator's own audit
// trail. There is no child, no parent and no teacher in any of them, so the
// "what may an operator read about somebody else" question that shapes every
// other class does not arise. Ops must be able to create, read, update and
// delete its own session rows or it cannot sign anybody in or out.
//
// What this widening does NOT do:
//   - it does not let any ops file reach these tables directly. Only the three
//     DECLARED_DB_MODULES may import the client at all
//     (bad-prisma-import-in-ops-totp.txt proves a fourth still fails).
//   - it does not exempt them from every other rule: an OPS_OWNED row read is
//     still subject to the banned-identifier, impersonation, media, filesystem
//     and guard rules, which is why the operator's columns are `pwHash` and
//     `tokenHash` rather than the banned `passwordHash` and `token`.
//   - it does not silence the drift check for anything else: a model that is in
//     the schema and in none of these lists still fails, proved against a
//     throwaway tree by tests/battery/security/ops-blindness-gate.spec.ts (A15).
const OPS_OWNED = [
  "Operator",
  "OperatorSession",
  "OpsAuditLog",
  // JobRun and MailCounter describe the system, not its users: no recipient, no
  // domain, no foreign key to any person. A MailCounter row says "eleven
  // sign-in emails were attempted on this day and two failed", and there is no
  // route from it back to a family.
  //
  // Not AGGREGATE_ONLY, and the reason is worth stating so nobody "tightens" it
  // later and breaks the screen: that class permits only count and groupBy,
  // neither of which can sum a tally COLUMN. count() returns a row count, and
  // groupBy on templateKey is correctly refused by SAFE_GROUP_KEYS. The read is
  // findMany with an explicit five-column select, summed in process.
  "JobRun",
  "MailCounter",
];

const PRISMA_METHODS = [
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
];

// Methods that hand back whole rows, and therefore every scalar column unless
// a `select:` narrows them. updateMany, createMany, count, aggregate and
// groupBy are absent because they return numbers, not rows.
const ROW_RETURNING_METHODS = [
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "create",
  "createManyAndReturn",
  "update",
  "upsert",
];

const METHODS_BY_CLASS = {
  ADULT_READABLE: [
    "findUnique",
    "findUniqueOrThrow",
    "findFirst",
    "findFirstOrThrow",
    "findMany",
    "count",
    "aggregate",
    "groupBy",
    "create",
    "update",
    "updateMany",
    "upsert",
  ],
  AGGREGATE_ONLY: ["count", "groupBy"],
  LOOKUP_ONLY: ["findUnique", "findUniqueOrThrow", "count"],
  CREDENTIAL_NEVER: [],
  OPS_OWNED: PRISMA_METHODS,
  // Read-only, and no write of any shape. See the comment on PLATFORM_CONTENT.
  PLATFORM_CONTENT: ["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count"],
};

// ---------------------------------------------------------------------------
// Aggregate constraints (ruling R10: strictest of briefs 04 and 06)
// ---------------------------------------------------------------------------
// School granularity only. A per-class count in a class of one identifies that
// child; a yearGroup or ageMode key narrows a cohort to the point of
// re-identification; having: is how you binary-search a single row; _max and
// _min return a value belonging to one individual.
const SAFE_GROUP_KEYS = [
  "schoolId",
  "kind", // Subscription.kind: FREE | SCHOOL
  "status", // Subscription.status / Teacher.status
  "role", // Teacher.role: ADMIN | TEACHER | TA
  "country", // Teacher.country
  "foundingMember", // Teacher.foundingMember
  "type", // BillingEvent.type
];

// Named so the failure message can say WHY, rather than only "not on the list".
const BANNED_GROUP_KEYS = {
  classId: "a per-class figure; in a class of one it names that child (R10)",
  yearGroup: "a cohort narrow enough to re-identify (R10)",
  ageMode: "a cohort narrow enough to re-identify (R10)",
  studentId: "a per-child figure is a profile of that child (rule 11, C3)",
  parentId: "parent-to-child linkage (R11)",
  teacherId: "narrows below school granularity (R10)",
  assignmentId: "narrows below school granularity (R10)",
  id: "one row is not an aggregate",
  name: "returns a list of names",
  email: "returns a list of addresses",
};

// ---------------------------------------------------------------------------
// Banned identifiers
// ---------------------------------------------------------------------------
// Matched as whole words, with comments stripped first, so the word "caption"
// in prose does not fire and parentId does not match grandparentIdentifier.
// String literals are deliberately NOT stripped: a banned field name inside a
// string is very likely a dynamic property access and should fail.
//
// Every entry except those in PENDING_FIELDS must exist as a field name in
// prisma/schema.prisma. If one does not, the gate fails: a renamed field leaves
// a denylist entry protecting nothing, and one rename should not be able to
// quietly empty this list.
const DENY_FIELDS = [
  // Child work and per-child state
  "caption",
  "textContent",
  "mediaPath",
  "mediaPathsJson",
  "quizAnswersJson",
  "quizScore",
  "quizTotal",
  "teacherNote",
  "praiseNote",
  "stickerReply",
  "stickersJson",
  "returnMode",
  "jarSeenAt",
  "avatarColor",
  "pagesJson",
  "fieldsJson",
  "ownerKey",
  "contextKey",
  // Teacher-authored activity content, which reaches children and can quote them
  "templatePathsJson",
  // The rendered picture of that same content — the worksheet, its movable
  // pieces and its questions, drawn into one image. Strictly more revealing than
  // the background it is made from, so it is classified with it.
  "previewPathsJson",
  "quizJson",
  "objectsJson",
  "tagsJson",
  "templateSnapshotJson",
  // The same picture, frozen onto the run a child was set. Classified with the
  // snapshot it mirrors.
  "previewSnapshotJson",
  "quizSnapshotJson",
  "objectsSnapshotJson",
  // Credential VALUES (amendment C1). An operator who reads one of these can
  // sign in as that family or that child.
  "familyCode",
  "classCode",
  "token",
  "passwordHash",
];

// Documented pending entries: named in the SAFEGUARDING amendments table but
// not in the schema yet. The gate reminds rather than fails on these, so the
// entry is live the day the column lands instead of being dead on arrival.
const PENDING_FIELDS = ["pinHash"];

// The operator's own credential columns must NOT reuse a banned name. This is a
// naming constraint with a zero cost remedy, and it is the correct direction:
// the operator's own session secret is a different thing from a child's, and
// the code should say so.
//   Session.token       is banned -> OperatorSession stores `tokenHash`
//   Teacher.passwordHash is banned -> Operator stores `pwHash`
// Word-boundary matching means tokenHash and pwHash pass cleanly.

// Impersonation. Ruling: forbidden permanently. Impersonation would make every
// promise in this repo untrue at once, and the audit log would record a teacher
// doing it. Matched as identifiers only, after comment stripping, so the
// documentation of this rule does not trip it. The prose lives in
// docs/ops-README.md, outside the scan roots, for the same reason.
//
// QA note (R3, corpus pass): the original six patterns named the words this
// gate's author thought of. An agent under deadline pressure writing a support
// tool does not reach for "assumeIdentity"; it reaches for "loginAs",
// "masqueradeAs" or "viewAsTeacher", and every one of those passed. The list
// below is the union. Checked against the whole of src/, scripts/ and tests/
// before it was added: zero matches, so it is born green.
const IMPERSONATION_PATTERNS = [
  /\b\w*[Ii]mpersonat\w*\b/,
  /\bsignInAs\b/,
  /\bactAs\b/,
  /\bbecomeUser\b/,
  /\bassumeIdentity\b/,
  /\bsuAs\b/,
  /\b[Ll]og[Ii]?n?As\b/, // loginAs, logInAs, logAs
  /\b\w*[Mm]asquerad\w*\b/,
  /\bswitchUser\b/,
  /\bonBehalfOf\w*\b/,
  /\b\w*[Gg]hostSession\b/,
  /\b\w*[Ss]hadowSession\b/,
  /\brunAs[A-Z]\w*\b/,
  /\bviewAs[A-Z]\w*\b/,
  /\bsudo\w*\b/,
];

// The existing session machinery. An ops file that can mint, destroy or resolve
// a portfolio_session is an impersonation path whatever it is called.
const SESSION_IDENTIFIERS = [
  /\bcreateSession\s*\(/,
  /\bdestroySession\s*\(/,
  /\bgetCurrentUser\s*\(/,
  /\bgetCurrentParent\s*\(/,
  /\bCOOKIE_NAME\b/,
];

// Filesystem access near the media volume. A screen that never touches Prisma
// can still read a child's photograph with fs.readFile.
const FS_IMPORT_SPECS = [
  "fs",
  "node:fs",
  "fs/promises",
  "node:fs/promises",
  "child_process",
  "node:child_process",
];
const FS_IDENTIFIERS = [/\bMEDIA_DIR\b/, /\bUPLOADS_PREFIX\b/, /\bUPLOAD_DIR\b/, /\bDATABASE_URL\b/];

// Media elements, ops roots only. Handbook section 6 item 9: "No img,
// next/image, video, audio, source, picture, object, embed, iframe, CSS url()
// or data: media anywhere under ops." That line had no gate behind it, and an
// <img src={dto.path} /> renders a child's photograph while satisfying every
// data rule in this file, because the path arrived as an innocent-looking
// string. next/image was doubly invisible: "next/" is on the package prefix
// allowlist.
const MEDIA_ELEMENTS = [
  /<\s*(img|video|audio|source|picture|object|embed|iframe)\b/,
  /\bcreateElement\s*\(\s*["'](?:img|video|audio|source|picture|object|embed|iframe)["']/,
  /["']next\/image["']/,
  /\burl\s*\(/,
  /["'`]data:(?:image|audio|video)\//,
];

// Keys that scope a figure to exactly one class or exactly one child. R10 bans
// per-class figures because a class of one names that child; amendment C3 bans
// per-child figures outright. BANNED_GROUP_KEYS already refuses them as groupBy
// keys, but `db.student.count({ where: { classId } })` is the same number by a
// different route and it passed. There is no ops operation on a class or on a
// child, so these two identifiers have no legitimate use anywhere under ops.
//
// parentId is deliberately NOT here: ops does legitimately handle parent
// records (amendment C2, exact-match lookup), so the identifier has a plausible
// honest use, and it is already refused as a groupBy key by BANNED_GROUP_KEYS.
const CHILD_SCOPE_KEYS = ["classId", "studentId"];

// ---------------------------------------------------------------------------
// The one permitted traversal from a child row to its school
// ---------------------------------------------------------------------------
// WIDENING (PR2, ruling R2: a widening lands in the same commit as the code it
// permits, with a comment naming the rule and a fixture proving the true
// positive still fires). This is case 2 of the three legitimate edits named in
// the header: a fix for a PROVEN false positive.
//
// Ruling R10 requires ops to render "the price band computed server-side from
// bandForPupils", and bandForPupils takes a number of pupils on roll. So a
// whole-school child headcount is not an optional nicety, it is the figure the
// billing screen exists to show, and R10 names it explicitly while banning
// every finer cut of it.
//
// There is exactly one way to express it in Prisma. `Class` carries no
// schoolId column (verified in prisma/schema.prisma and in docs/ops-facts.md
// row 4.15), so a child reaches a school only through its class's teacher:
//
//     db.student.count({ where: { class: { teacher: { schoolId } } } })
//
// Every alternative was tried against this gate first and every one is refused,
// correctly: `where: { classId: { in: ids } }` is OPS-CHILD-SCOPE-KEY,
// `groupBy({ by: ["classId"] })` is OPS-GROUP-KEY, and Prisma cannot count a
// relation two hops away, so `_count: { select: { classes: true } }` on a
// teacher counts classes and can never count children. The gate was refusing
// the one shape the ruling above requires, which is a false positive rather
// than the rule doing its job.
//
// The permission is written as narrowly as the false positive is:
//
//   - only in the read chokepoint, src/lib/ops/reads.ts, not in a screen, an
//     action, or a second helper module;
//   - only as the argument of `db.student.count(`, so the permission is the
//     headcount itself rather than the traversal in general. Without this, the
//     same filter on db.journalItem.count or db.draft.count would have become
//     expressible, and while a whole-school item count is not a per-child
//     figure, it is not something R10 asks for and nobody reviewed it;
//   - only inside a `where:` block, so the relation still cannot appear in a
//     select, an include or an orderBy, where it would return child rows;
//   - only when the value is EXACTLY the traversal to a school id. A sibling
//     key alongside it, such as a class name, would produce the per-class
//     figure R10 bans because a class of one names that child, so the whole
//     object must match and not merely start with it.
//
// The true positive still fires, proved by five fixtures:
//   bad-per-class-headcount.txt        the same relation filtered by class name
//   bad-school-scope-extra-filter.txt  the traversal plus a class-name sibling
//   bad-school-scope-in-select.txt     the traversal in a select, not a where
//   bad-school-scope-outside-reads.txt the traversal in another ops module
//   bad-school-scope-other-model.txt   the traversal counting journal items
// and the clean shape by good-school-headcount-traversal.txt.
const SCHOOL_SCOPE_MODULE = "src/lib/ops/reads.ts";
const SCHOOL_SCOPE_CALL = "student.count";
const SCHOOL_SCOPE_INNER = /^\s*teacher\s*:\s*\{\s*schoolId\s*(?::\s*[A-Za-z_$][\w$]*\s*)?\}\s*,?\s*$/;

// ---------------------------------------------------------------------------
// Mutations: one module, one shape (PR4)
// ---------------------------------------------------------------------------
// Two rules live here, and they are deliberately written together because one
// is a STRICTENING and the other is the narrow widening it pays for.
//
// OPS-MUTATION-MODULE (new, stricter). Under the ops roots, a Prisma write on
// anything that is not the operator's OWN record may appear only in
// src/lib/ops/operations.ts. That file implements the frozen operation registry
// (src/lib/ops/registry.ts), so the rule is the structural half of the
// handbook's "every mutating action is named and in the frozen registry": an
// operation added as a helper in a screen, an action or a second library module
// is now a failing build rather than a code review somebody might miss. Before
// this, ADULT_READABLE permitted create, update, updateMany and upsert anywhere
// under the ops roots, which meant the registry was a convention.
//
// OPS-ROTATION-WRITE (the widening). Exactly one write shape is permitted on a
// record belonging to somebody else:
//
//     tx.parent.update({ where: { … }, data: { familyCode: makeFamilyCode() }, select: { … } })
//
// only in the operations module, only inside a `data:` block, and only with the
// value minted INLINE. It exists because rotating a leaked family code is the
// one platform mutation that is purely a revocation: it takes access away, it
// hands nothing over, and owner amendment C1 names it as the reason an operator
// never needs to READ a code ("the operator triggers a rotation and the teacher
// sees the new code in their own interface").
//
// Why it is written this narrowly, key by key:
//
//   - a BOUND value is refused (`data: { familyCode: fresh }`). That is not
//     pedantry, it is the entire point: a value with a name is a value a later
//     line can return, and amendment C1's failure mode is the new code reaching
//     the operator's screen. Minted inline, nothing holds it.
//   - `select:` and `where:` occurrences of the identifier still fail, so this
//     permits writing a code and never reading one.
//   - `parent.update` remains refused for every other `data:` block, which is
//     what keeps owner decision D9 structural rather than aspirational:
//     `data: { email: … }` is a failing build, and changing an adult's address
//     is the route into their account that D9 refuses to build.
//   - it is confined to the operations module, so the shape cannot be copied
//     into a screen or a shared helper.
//
// The true positives still fire, proved by five fixtures:
//   bad-write-outside-operations-module.txt   a write in the read chokepoint
//   bad-rotation-outside-operations-module.txt the permitted shape, elsewhere
//   bad-rotation-code-bound-to-a-variable.txt  the C1 near miss this invites
//   bad-rotation-reads-the-code.txt            the same identifier in a select
//   bad-parent-email-write.txt                 the D9 near miss
// and the clean shape by good-family-code-rotation.txt.
const OPERATIONS_MODULE = "src/lib/ops/operations.ts";
const ROTATION_CALL = /\b(?:db|prisma|tx|client)\s*\.\s*parent\s*\.\s*update\s*\(/g;
const ROTATION_DATA = /^\s*familyCode\s*:\s*makeFamilyCode\s*\(\s*\)\s*,?\s*$/;
const MUTATING_METHODS = [
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
];

// Raw SQL defeats model-name scanning entirely, so it is banned outright here,
// stricter than audit-static.mjs which permits parameterised tagged templates.
const RAW_SQL = [
  /\$queryRawUnsafe\b/,
  /\$executeRawUnsafe\b/,
  /\$queryRaw\b/,
  /\$executeRaw\b/,
  /\bnew\s+PrismaClient\b/,
];

// Dynamic model access makes every other detector in this file blind.
//
// QA note (R3, corpus pass): `db["journalItem"]` was caught and `db?.["…"]` was
// not, which is a one-character difference and a full bypass of every model
// rule. `Reflect.get(db, name)` was not caught either. Both are covered now.
const DYNAMIC_MODEL_ACCESS = /\b(db|prisma|tx|client)\s*(?:\?\.)?\s*\[/;
const REFLECTIVE_MODEL_ACCESS = /\bReflect\s*\.\s*(?:get|has|ownKeys)\s*\(\s*(?:db|prisma|tx|client)\b/;

// Handing the client, or one of its delegates, to a variable. The model rules
// match the SHAPE `<client>.<delegate>.<method>(`, so anything that breaks that
// shape into two statements is invisible to them:
//
//   const { journalItem } = db;   journalItem.findMany()
//   const items = db.journalItem; items.findMany()
//
// Both passed the gate before this rule. There is no legitimate reason for ops
// code to hold a delegate handle: every read goes through a named helper in
// src/lib/ops/reads.ts that calls the delegate inline.
const CLIENT_DESTRUCTURE = /\b(?:const|let|var)\s*\{[^}]*\}\s*=\s*(?:await\s+)?(?:db|prisma|tx|client)\b/;

// Import allowlist for files physically under the ops roots. Deny by default:
// a denylist of child-data modules is allow-by-default wearing a costume, and
// it rots (src/lib currently holds 39 modules).
const ALLOWED_PACKAGES = [
  "react",
  "react-dom",
  "server-only",
  "node:crypto",
  "bcryptjs",
  "qrcode",
  // WIDENING (PR1, ruling R2). TOTP, on owner decision D4: otplib 13.4.1, MIT,
  // maintained, crypto plugins are @noble / @scure, installed as a production
  // dependency so `npm run audit:prod` covers it in the blocking chain. The
  // alternative was hand-rolled RFC 6238, which nobody else would review.
  // It reads a secret and emits six digits; it touches no database, no
  // filesystem and no request. The true positive still fires for any other
  // package, proved by tests/fixtures/ops-blindness/bad-unlisted-otp-package.txt
  // (an unlisted TOTP library, which is the near miss this widening invites),
  // and the clean shape by good-totp-via-otplib.txt.
  "otplib",
];
const ALLOWED_PACKAGE_PREFIXES = ["next/"];
// Local imports permitted from ops files. @/lib/billing-plans holds the price
// bands and no child data (checked: SCHOOL_BANDS, bandFor, bandForPupils,
// PLAN_LABELS, PLAN_PRICE_ENV, priceIdFor). @/lib/rateLimit is the shared
// throttle. Everything else local, including every shared data helper, is
// denied and must be reached through src/lib/ops/.
//
// WIDENING (PR3, ruling R2: a widening lands in the SAME commit as the code it
// permits, with a comment naming the rule and a fixture proving the true
// positive still fires). The third entry is @/lib/stripeMode, and the gate
// refused src/lib/ops/stripeLinks.ts as OPS-IMPORT-ALLOWLIST until it was
// added, which is the rule working.
//
// Why it is needed at all. Owner decision D6 (docs/ops-architecture.md,
// 2026-08-17) makes the billing screen read-only with a link out to the Stripe
// dashboard. A dashboard URL carries the mode in its path (`/test/` for a
// sandbox, omitted for live), so ops has to know which data set this deployment
// is pointed at, and it has to know whether Stripe is configured here at all so
// a screen can say so instead of offering a link to nothing.
//
// Why this module rather than the obvious one. The obvious import is
// @/lib/stripe, and permitting THAT would be a genuine widening of what ops can
// do: it constructs the Stripe SDK client from the secret key, so `getStripe()`
// would become reachable from every operator screen and the "ops links out and
// never calls out" property would rest on nobody typing it. @/lib/stripeMode
// exists so that does not happen. It holds two functions over one environment
// variable, imports nothing, returns only booleans, and never returns, logs or
// formats the key. The secret stays outside the ops path, which is the rule
// this widening upholds rather than relaxes.
//
// The true positive still fires, proved by two fixtures:
//   bad-ops-imports-stripe-client.txt  an ops file importing @/lib/stripe, the
//                                      near miss this widening invites -> fails
//   bad-ops-imports-billing-lib.txt    another plausible shared billing helper,
//                                      to show one entry did not open the door
//                                      to the rest of src/lib          -> fails
// and the clean shape by good-ops-stripe-mode-import.txt.
//
// WIDENING (PR4, ruling R2). The fourth entry is @/lib/familyCodeMint, and the
// gate refused src/lib/ops/operations.ts as OPS-IMPORT-ALLOWLIST until it was
// added.
//
// Why it is needed. Rotating a family code means minting one, and the operator
// area must mint it exactly the way the teacher's own rotation does: one
// alphabet, one length, one crypto RNG. Two generators that agreed on the day
// they were written and drifted afterwards is a worse outcome than any import.
//
// Why this module rather than the obvious one. The obvious import is
// @/lib/familyCode, and permitting THAT would drag the Prisma client into the
// ops import walk: it asks the database whether a candidate code is already in
// use, so it is `server-only`, it reads Parent rows, and the word `familyCode`
// appears in a `where:` clause in it. The pure minting half was split out into
// @/lib/familyCodeMint in the same commit. It imports node:crypto and one
// alphabet, touches no database, and returns a string.
//
// The true positive still fires, proved by
// bad-ops-imports-family-code-module.txt (an ops file importing
// @/lib/familyCode, the near miss this widening invites), and the clean shape
// by good-ops-family-code-mint-import.txt.
const ALLOWED_LOCAL_IMPORTS = [
  "@/lib/billing-plans",
  "@/lib/rateLimit",
  "@/lib/stripeMode",
  "@/lib/familyCodeMint",
  // The mail status vocabulary: closed string unions and two pure helpers, no
  // Prisma, no credentials, no address. It lives outside the ops tree for a
  // reason PR5 discovered the hard way. It was first written at
  // src/lib/ops/mail.ts, which is the name ruling R1 would suggest, and the
  // gate refused it correctly: any file that imports an ops module is walked
  // and scanned AS ops code, so the mailer importing the vocabulary dragged
  // src/lib/mailer.ts and src/lib/mailCounters.ts into the operator scan, and
  // the latter failed at once for importing Prisma. The vocabulary belongs to
  // mail; ops reads it. Bounded by bad-ops-imports-mailer.txt and
  // bad-ops-imports-mail-counters.txt, which prove the two halves that must
  // stay out reachable are still refused.
  "@/lib/mailStatus",
];
const ALLOWED_LOCAL_PREFIXES = ["@/lib/ops/"];

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

// Replace comment bodies with spaces so every index and line number in the
// stripped text still matches the original file.
function stripComments(src) {
  const out = src.split("");
  let i = 0;
  let state = "code";
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (state === "code") {
      if (c === "/" && d === "/") {
        out[i] = " ";
        out[i + 1] = " ";
        state = "line";
        i += 2;
        continue;
      }
      if (c === "/" && d === "*") {
        out[i] = " ";
        out[i + 1] = " ";
        state = "block";
        i += 2;
        continue;
      }
      if (c === "'") state = "sq";
      else if (c === '"') state = "dq";
      else if (c === "`") state = "tpl";
      i += 1;
      continue;
    }
    if (state === "line") {
      if (c === "\n") state = "code";
      else out[i] = " ";
      i += 1;
      continue;
    }
    if (state === "block") {
      if (c === "*" && d === "/") {
        out[i] = " ";
        out[i + 1] = " ";
        state = "code";
        i += 2;
        continue;
      }
      if (c !== "\n") out[i] = " ";
      i += 1;
      continue;
    }
    // inside a string literal
    if (c === "\\") {
      i += 2;
      continue;
    }
    if ((state === "sq" && c === "'") || (state === "dq" && c === '"') || (state === "tpl" && c === "`")) {
      state = "code";
    }
    i += 1;
  }
  return out.join("");
}

// Same length again, with string CONTENTS blanked. Used only for structural
// scanning (brace matching), so a brace inside a string cannot desynchronise
// the block ranges. Identifier matching still runs against the string-bearing
// text.
function blankStrings(src) {
  const out = src.split("");
  let i = 0;
  let state = "code";
  while (i < src.length) {
    const c = src[i];
    if (state === "code") {
      if (c === "'") state = "sq";
      else if (c === '"') state = "dq";
      else if (c === "`") state = "tpl";
      i += 1;
      continue;
    }
    if (c === "\\") {
      out[i] = " ";
      if (i + 1 < src.length && src[i + 1] !== "\n") out[i + 1] = " ";
      i += 2;
      continue;
    }
    if ((state === "sq" && c === "'") || (state === "dq" && c === '"') || (state === "tpl" && c === "`")) {
      state = "code";
      i += 1;
      continue;
    }
    if (c !== "\n") out[i] = " ";
    i += 1;
  }
  return out.join("");
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

function matchParen(struct, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < struct.length; i += 1) {
    if (struct[i] === "(") depth += 1;
    else if (struct[i] === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// Lowercased, with everything that is not a letter or a digit removed. Used
// ONLY on identifiers assembled from string literals, never on prose: it
// deliberately erases the difference between familyCode, family_code,
// FAMILY_CODE and "family" + "Code", and applying it to arbitrary copy would
// flag the legitimate label "Family code" on a rotation button.
function normaliseIdentifier(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Chains of two or more adjacent string literals joined by `+`. Splitting a
// name across a concatenation is not something anyone does by accident; it is
// what you do when a scanner is matching whole words and you want a build to go
// green. `select: { ["family" + "Code"]: true }` is valid Prisma and passed
// every rule in this file before this was added.
const STRING_CONCAT_CHAIN = /(?:["'][^"'\n]*["']\s*\+\s*)+["'][^"'\n]*["']/g;

// A template literal whose interpolations are themselves string literals, which
// is the same trick with backticks: `family${"Code"}`. Only pure-literal
// interpolations count. A template holding a real expression is left alone,
// because erasing `${x}` from `Family code: ${x}` would produce "familycode"
// and flag an honest label.
const TEMPLATE_LITERAL_ASSEMBLY = /`[^`\n]*\$\{\s*["'][^"'\n]*["']\s*\}[^`\n]*`/g;

function assembledLiterals(code) {
  const out = [];
  for (const m of code.matchAll(STRING_CONCAT_CHAIN)) {
    const parts = [...m[0].matchAll(/["']([^"'\n]*)["']/g)].map((p) => p[1]);
    out.push({ index: m.index, text: m[0], joined: parts.join("") });
  }
  for (const m of code.matchAll(TEMPLATE_LITERAL_ASSEMBLY)) {
    const body = m[0].slice(1, -1);
    // Only fold when EVERY interpolation is a plain string literal.
    if (/\$\{(?!\s*["'][^"'\n]*["']\s*\})/.test(body)) continue;
    out.push({
      index: m.index,
      text: m[0],
      joined: body.replace(/\$\{\s*["']([^"'\n]*)["']\s*\}/g, "$1"),
    });
  }
  return out;
}

function matchBrace(struct, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < struct.length; i += 1) {
    if (struct[i] === "{") depth += 1;
    else if (struct[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// Ranges of the `{ ... }` that follows each occurrence of `key:`.
function blockRangesFor(struct, keyRe) {
  const ranges = [];
  const re = new RegExp(keyRe.source, "g");
  let m;
  while ((m = re.exec(struct))) {
    const brace = struct.indexOf("{", m.index + m[0].length - 1);
    if (brace === -1) continue;
    // Only accept a brace that is the immediate value, not one further on.
    const between = struct.slice(m.index + m[0].length, brace);
    if (between.trim() !== "") continue;
    const close = matchBrace(struct, brace);
    if (close === -1) continue;
    ranges.push([brace, close]);
  }
  return ranges;
}

function inAnyRange(ranges, index) {
  return ranges.some(([a, b]) => index > a && index < b);
}

// ---------------------------------------------------------------------------
// Schema parsing
// ---------------------------------------------------------------------------

function parseSchema(text) {
  const models = new Map();
  const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m;
  while ((m = re.exec(text))) {
    const fields = [];
    for (const rawLine of m[2].split("\n")) {
      const line = rawLine.replace(/\/\/.*$/, "").trim();
      if (!line || line.startsWith("@@")) continue;
      const fm = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?/);
      if (!fm) continue;
      fields.push({ name: fm[1], type: fm[2], isList: Boolean(fm[3]) });
    }
    models.set(m[1], { fields });
  }
  return models;
}

// A field name that LOOKS like child data or a credential. If the schema gains
// one of these and the denylist has not been updated, the build fails. This is
// the drift check: without it, one migration quietly widens what ops may read.
const SENSITIVE_NAME_PATTERNS = [
  /hash$/i,
  /secret/i,
  /token/i,
  /code$/i,
  /password/i,
  /Json$/,
  /^caption$/i,
  /^media/i,
  /note$/i,
  /sticker/i,
  /^pin[A-Z]?/,
];

// ---------------------------------------------------------------------------
// Per-file rules
// ---------------------------------------------------------------------------

function importSpecsOf(code) {
  const specs = [];
  const patterns = [
    /\bimport\s+type\s[\s\S]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s+(?!type\s)[\s\S]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bexport\s+type\s[\s\S]*?\bfrom\s*["']([^"']+)["']/g,
    /\bexport\s+(?!type\s)[\s\S]*?\bfrom\s*["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  const typeOnly = new Set();
  let m;
  const typeRe = /\b(?:import|export)\s+type\s[\s\S]*?\bfrom\s*["']([^"']+)["']/g;
  while ((m = typeRe.exec(code))) typeOnly.add(m[1]);
  for (const re of patterns) {
    re.lastIndex = 0;
    while ((m = re.exec(code))) {
      specs.push({ spec: m[1], index: m.index, typeOnly: typeOnly.has(m[1]) });
    }
  }
  // De-duplicate on spec + index so overlapping patterns do not double-report.
  const seen = new Set();
  return specs.filter((s) => {
    const key = `${s.spec}@${s.index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const PRISMA_SPECS = new Set(["@/lib/db", "@prisma/client", ".prisma/client"]);

function isPrismaSpec(spec, relFile) {
  if (PRISMA_SPECS.has(spec)) return true;
  if (spec.startsWith(".")) {
    const resolved = path
      .normalize(path.join(path.dirname(relFile), spec))
      .split(path.sep)
      .join("/");
    return resolved === "src/lib/db" || resolved === "src/lib/db.ts";
  }
  return false;
}

function isUnderRoots(rel) {
  return OPS_ROOTS.some((r) => rel === r || rel.startsWith(`${r}/`));
}

// Canonical "@/..." form of a local import specifier, resolved textually rather
// than against the filesystem so a fixture judged as a path that does not exist
// on disk is analysed exactly like real code.
//
// QA note (R3, corpus pass): the import allowlist used to skip every specifier
// beginning with a dot, on the reasoning that the walk resolves and scans it
// anyway. The walk does, but the allowlist is a SEPARATE and stronger control:
// it says ops may not depend on shared modules at all, not merely that the
// shared module must itself be clean. So `import { teacherNav } from
// "@/lib/teacherNav"` failed and `import { teacherNav } from
// "../../lib/teacherNav"` passed, which made a deny-by-default allowlist
// bypassable by typing a different path separator. The same hole silenced the
// "@/lib/auth" and "@/lib/parentAuth" session rules, which compared specifier
// strings by equality.
function canonicalLocalSpec(spec, fromRel) {
  let base;
  if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
  else if (spec.startsWith("."))
    base = path
      .normalize(path.join(path.dirname(fromRel), spec))
      .split(path.sep)
      .join("/");
  else return null;
  if (!base.startsWith("src/")) return { rel: base, spec: null, outsideSrc: true };
  return { rel: base, spec: `@/${base.slice(4)}`, outsideSrc: false };
}

// The core rule engine. `rel` is the repository-relative path the file should
// be judged as. `underRoot` says whether the file sits physically inside an ops
// root (root-only rules: the import allowlist and the requireOperator first
// statement) or was pulled in transitively (all the data rules still apply,
// which is the whole point of the walk).
function checkFile(rel, raw, ctx) {
  const v = [];
  const code = stripComments(raw);
  const struct = blankStrings(code);
  const underRoot = isUnderRoots(rel);
  const add = (index, rule, reason) => {
    v.push({ rel, line: lineOf(raw, index), rule, reason });
  };

  // The permitted family-code rotation writes in this file, as [dataOpen,
  // dataClose, callIndex] triples. Computed up front because two separate rules
  // consult it: the banned-identifier scan (may `familyCode` appear here?) and
  // the model-method scan (may `parent.update` be called here?). See
  // OPS-ROTATION-WRITE above for why each clause is as narrow as it is.
  const rotationWrites = [];
  if (rel === OPERATIONS_MODULE) {
    const callRe = new RegExp(ROTATION_CALL.source, "g");
    let cm;
    while ((cm = callRe.exec(code))) {
      const open = struct.indexOf("(", cm.index + cm[0].length - 1);
      const close = open === -1 ? -1 : matchParen(struct, open);
      if (close === -1) continue;
      for (const [a, b] of blockRangesFor(struct, /\bdata\s*:\s*/)) {
        if (a < open || b > close) continue;
        if (ROTATION_DATA.test(code.slice(a + 1, b))) rotationWrites.push([a, b, open]);
      }
    }
  }
  const isRotationData = (index) => rotationWrites.some(([a, b]) => index > a && index < b);
  // Identified by the position of the call's opening parenthesis, which is the
  // one index both this scan and the model-method scan can agree on: they match
  // different starting points ("tx.parent.update(" against ".parent.update(").
  const isRotationCall = (openIndex) => rotationWrites.some(([, , at]) => at === openIndex);

  // -- Imports -------------------------------------------------------------
  for (const { spec, index, typeOnly } of importSpecsOf(code)) {
    if (isPrismaSpec(spec, rel)) {
      // A type import of a Prisma-generated type is not a read path; the
      // runtime client is. @/lib/db exports the client itself, so it is banned
      // in every form.
      const typeAllowed = typeOnly && spec === "@prisma/client";
      if (!typeAllowed && !DECLARED_DB_MODULES.includes(rel)) {
        add(
          index,
          "OPS-PRISMA-IMPORT",
          `imports the Prisma client ("${spec}"). Only ${DECLARED_DB_MODULES.join(" and ")} may. Reach the data through src/lib/ops/reads.ts.`,
        );
      }
    }
    if (FS_IMPORT_SPECS.includes(spec)) {
      add(
        index,
        "OPS-FILESYSTEM",
        `imports "${spec}". Ops never touches the filesystem: the media volume holds children's photographs, drawings and voice notes (rule 7).`,
      );
    }
    // Resolved, not string-compared, so a relative spelling cannot dodge it.
    const local = canonicalLocalSpec(spec, rel);
    if (local && (local.spec === "@/lib/auth" || local.spec === "@/lib/parentAuth")) {
      add(
        index,
        "OPS-SESSION-REUSE",
        `imports "${spec}" (${local.spec}). The one portfolio_session cookie carries teacher, student AND parent sessions; an ops file that can reach it is an impersonation path.`,
      );
    }
    if (!underRoot) continue;
    // Deny-by-default import allowlist, ops roots only.
    // The Prisma client has its own dedicated rule above, which already knows
    // about the declared modules. Reporting it twice only adds noise.
    if (isPrismaSpec(spec, rel)) continue;
    const pkgOk =
      ALLOWED_PACKAGES.includes(spec) || ALLOWED_PACKAGE_PREFIXES.some((p) => spec.startsWith(p));
    if (local) {
      if (local.outsideSrc) {
        add(
          index,
          "OPS-IMPORT-ALLOWLIST",
          `imports "${spec}", which resolves to "${local.rel}", outside src/. An ops file reaching out of the source tree is not something the allowlist can reason about.`,
        );
        continue;
      }
      // Ops may import ops, by any spelling. Everything else local is denied.
      if (isUnderRoots(local.rel)) continue;
      const localOk =
        ALLOWED_LOCAL_IMPORTS.includes(local.spec) ||
        ALLOWED_LOCAL_PREFIXES.some((p) => local.spec.startsWith(p));
      if (!localOk) {
        add(
          index,
          "OPS-IMPORT-ALLOWLIST",
          `imports "${spec}"${spec === local.spec ? "" : ` (which resolves to "${local.spec}")`}, which is not on the ops import allowlist. Shared data helpers are exactly how a banned read gets laundered one file away.`,
        );
      }
    } else if (!pkgOk && !isPrismaSpec(spec, rel) && !FS_IMPORT_SPECS.includes(spec)) {
      add(
        index,
        "OPS-IMPORT-ALLOWLIST",
        `imports the package "${spec}", which is not on the ops import allowlist. Adding one is a reviewed decision with a comment.`,
      );
    }
  }

  // -- Re-exporting the client would launder it to every other ops file ----
  if (DECLARED_DB_MODULES.includes(rel)) {
    // QA note (R3, corpus pass): the original three forms covered
    // `export { db }`, `export * from "@/lib/db"` and `export const db`. They
    // did not cover `export default db` or `export const client = db`, which
    // are the two spellings you reach for when the named one is blocked.
    const reexport =
      /\bexport\s*\{[^}]*\bdb\b[^}]*\}/.exec(code) ||
      /\bexport\s+\*\s+from\s*["']@\/lib\/db["']/.exec(code) ||
      /\bexport\s+(?:const|let|var)\s+db\b/.exec(code) ||
      /\bexport\s+default\s+(?:db|prisma)\s*[;\n]/.exec(code) ||
      /\bexport\s+(?:const|let|var)\s+\w+\s*(?::[^=\n]*)?=\s*(?:db|prisma)\s*[;\n]/.exec(code);
    if (reexport) {
      add(
        reexport.index,
        "OPS-DB-REEXPORT",
        "re-exports the Prisma client. The chokepoint is only a chokepoint if it does not hand the client on.",
      );
    }
  }

  // -- Raw SQL, dynamic access, same-origin fetch --------------------------
  for (const re of RAW_SQL) {
    const m = re.exec(code);
    if (m) {
      add(
        m.index,
        "OPS-RAW-SQL",
        `raw SQL or a fresh Prisma client (${m[0]}). Raw SQL defeats model-name scanning entirely, so it is banned outright in ops.`,
      );
    }
  }
  for (const re of [DYNAMIC_MODEL_ACCESS, REFLECTIVE_MODEL_ACCESS]) {
    const dyn = re.exec(code);
    if (dyn) {
      add(
        dyn.index,
        "OPS-DYNAMIC-MODEL",
        `computed or reflective member access on the database client (${dyn[0].trim()}). Dynamic model access makes every other detector in this gate blind.`,
      );
    }
  }
  const handle = CLIENT_DESTRUCTURE.exec(code);
  if (handle) {
    add(
      handle.index,
      "OPS-DB-HANDLE",
      "destructures the database client. The model rules match the shape `<client>.<delegate>.<method>(`, so a delegate lifted into a local binding is invisible to every one of them. Call the delegate inline inside a named helper in src/lib/ops/reads.ts.",
    );
  }
  // A same-origin fetch was banned only when the URL began with a literal
  // slash, so `fetch(`${process.env.APP_URL}/api/drafts`)` read child data
  // through the front door and passed. Under the ops roots there is no
  // legitimate outbound call at all: R19 requires the health pane to render the
  // internal result rather than fetch the public endpoint, the Stripe surface
  // is a link-out rather than an API call, and every read goes through
  // src/lib/ops/reads.ts. So the ban is the whole call, not one URL shape.
  const anyFetch = /\bfetch\s*\(/.exec(code);
  if (underRoot && anyFetch) {
    add(
      anyFetch.index,
      "OPS-SAME-ORIGIN-FETCH",
      "calls fetch(). An ops page or action calling /uploads/... or /api/... server side reads child data through the front door while satisfying every import rule, and a template literal hides the URL from this gate entirely. Ops reads the database through src/lib/ops/reads.ts and links out rather than calling out.",
    );
  } else {
    const originFetch = /\bfetch\s*\(\s*["'`]\//.exec(code);
    if (originFetch) {
      add(
        originFetch.index,
        "OPS-SAME-ORIGIN-FETCH",
        "same-origin fetch of an app route. An ops page calling /uploads/... or /api/... server side reads child data through the front door while satisfying every import rule.",
      );
    }
  }
  if (underRoot) {
    for (const re of MEDIA_ELEMENTS) {
      const m = re.exec(code);
      if (m) {
        add(
          m.index,
          "OPS-MEDIA-ELEMENT",
          `renders or references media (${m[0].trim()}). Shared definition of done item 9: no img, next/image, video, audio, source, picture, object, embed, iframe, CSS url() or data: media anywhere under ops. Every byte of media in this product is a child's photograph, drawing or voice note, and a media element renders one while satisfying every data rule in this gate.`,
        );
      }
    }
  }

  // -- Filesystem and media identifiers ------------------------------------
  for (const re of FS_IDENTIFIERS) {
    const m = re.exec(code);
    if (m) add(m.index, "OPS-FILESYSTEM", `references ${m[0]}. Ops has no business near the media volume or the database URL.`);
  }
  const uploadsLiteral = /["'`][^"'`\n]*\/uploads\//.exec(code);
  if (uploadsLiteral) {
    add(uploadsLiteral.index, "OPS-FILESYSTEM", "contains an /uploads/ path literal. Every byte behind that prefix is a child's work.");
  }

  // -- Impersonation and session reuse -------------------------------------
  for (const re of IMPERSONATION_PATTERNS) {
    const m = re.exec(code);
    if (m) {
      add(
        m.index,
        "OPS-IMPERSONATION",
        `impersonation identifier "${m[0]}". Rule 4 says a child's moment is visible only to the teachers who teach that class and the linked parent. A support tool that borrows a teacher's identity is exactly a path to that child's work, and the audit log would record a teacher doing it. Build "explain access" instead: which classes, what a role can do, never content.`,
      );
    }
  }
  for (const re of SESSION_IDENTIFIERS) {
    const m = re.exec(code);
    if (m) {
      add(m.index, "OPS-SESSION-REUSE", `references ${m[0].trim()}. Ops has its own identity and its own cookie; it never touches the app's session machinery.`);
    }
  }

  // -- Banned identifiers ---------------------------------------------------
  // Case-insensitive since the QA corpus pass: `\bfamilyCode\b` is a
  // case-sensitive match, so a DTO field spelled `familycode` or a constant
  // spelled `FAMILYCODE` passed. Whole-word matching keeps this safe: `token`
  // case-insensitively still does not match `tokenHash` or `csrfToken`, because
  // there is no word boundary inside either.
  for (const field of [...DENY_FIELDS, ...PENDING_FIELDS]) {
    const re = new RegExp(`\\b${field}\\b`, "gi");
    let m;
    while ((m = re.exec(code))) {
      // The one permitted occurrence anywhere under the ops roots: minting a
      // replacement family code, inline, as the value of a `data:` key, in the
      // operations module. Writing a fresh random value is not reading one, and
      // amendment C1 bans reading. Every other occurrence, including this
      // identifier in a `select:` or a `where:` in the same file, still fails.
      if (field === "familyCode" && isRotationData(m.index)) continue;
      const credential = ["familyCode", "classCode", "token", "passwordHash", "pinHash"].includes(field);
      add(
        m.index,
        "OPS-BANNED-IDENTIFIER",
        credential
          ? `credential value "${field}" (amendment C1). Reading one of these lets an operator sign in as that family or child. Rotation never requires displaying a code: the teacher sees the new one in their own interface.${
              field === "token" ? ' The operator\'s own session column is `tokenHash`, not `token`.' : ""
            }${field === "passwordHash" ? " The operator's own column is `pwHash`, not `passwordHash`." : ""}`
          : `child-data field "${field}". Ops sees registered schools, teachers and which school they work at, and parents. Not children's data.`,
      );
      break; // one report per field per file is enough to fail and to fix
    }
  }

  for (const key of CHILD_SCOPE_KEYS) {
    const m = new RegExp(`\\b${key}\\b`).exec(code);
    if (m) {
      add(
        m.index,
        "OPS-CHILD-SCOPE-KEY",
        `"${key}" scopes a figure to one class or one child. R10 refuses it as a groupBy key, but \`db.student.count({ where: { ${key} } })\` is the same number by a different route and a class of one names that child (amendment C3, and the jarSeenAt comment in schema.prisma). There is no ops operation on a class or on a child, so this identifier has no honest use here. School-level figures use schoolId.`,
      );
    }
  }

  // Identifiers assembled from string literals, normalised so case and
  // separators do not matter. `["family" + "Code"]` is valid Prisma and passed
  // every whole-word rule above.
  for (const { index, text, joined } of assembledLiterals(code)) {
    const hit = ctx.assembledTargets.get(normaliseIdentifier(joined));
    if (hit) {
      add(
        index,
        "OPS-ASSEMBLED-IDENTIFIER",
        `${text.trim()} assembles "${joined}", which is ${hit}. Splitting a name across a concatenation is not something anyone does by accident; it is what you do when a scanner matches whole words and you want the build to go green. Weakening this gate is the failure, not the workaround.`,
      );
    }
  }

  // -- Aggregate shapes ------------------------------------------------------
  for (const re of [/\bhaving\s*:/, /\b_max\b/, /\b_min\b/]) {
    const m = re.exec(code);
    if (m) {
      add(
        m.index,
        "OPS-AGGREGATE-SHAPE",
        `${m[0].trim()} is banned (R10). having: is how you binary-search a single row; _max and _min return a value belonging to one individual.`,
      );
    }
  }
  // Group keys, read out of the argument of each .groupBy( call.
  //
  // Two changes from the original, both from the QA corpus pass. It matched
  // only `by: [ ... ]`, so `groupBy({ by: "classId" })` (Prisma accepts a bare
  // string) and `groupBy({ by: KEYS })` (a constant one import away) both
  // passed clean. Unreadable now means DENIED. And it matched `by:` anywhere in
  // the file, which would have fired on any DTO field called `by`; scoping the
  // search to the groupBy argument removes that false positive before anyone
  // meets it and is tempted to delete the rule.
  const groupByRe = /\.\s*groupBy\s*\(/g;
  let gm;
  while ((gm = groupByRe.exec(code))) {
    const open = struct.indexOf("(", gm.index + gm[0].length - 1);
    const close = open === -1 ? -1 : matchParen(struct, open);
    const args = close === -1 ? "" : code.slice(open, close);
    const byPos = args.search(/\bby\s*:\s*/);
    let keys = null;
    if (byPos !== -1) {
      const after = args.slice(byPos).replace(/^\bby\s*:\s*/, "");
      if (after.startsWith("[")) {
        const end = after.indexOf("]");
        if (end !== -1) {
          const inner = after.slice(1, end);
          keys = [...inner.matchAll(/["'](\w+)["']/g)].map((k) => k[1]);
          // A element that is not an inline string literal (a spread, a
          // constant, a template) leaves the key set unknowable.
          if (inner.replace(/["'](\w+)["']/g, "").replace(/[\s,]/g, "") !== "") keys = null;
        }
      } else if (after[0] === '"' || after[0] === "'") {
        const lit = after.match(/^["'](\w+)["']/);
        if (lit) keys = [lit[1]];
      }
    }
    if (keys === null) {
      add(
        gm.index,
        "OPS-GROUP-KEY",
        "groupBy `by:` is missing, or is not an inline string literal or an array of them, so the gate cannot read the keys. A key list behind a constant, a spread or a template literal is a key list nobody reviews. Write the keys inline.",
      );
      continue;
    }
    for (const key of keys) {
      if (SAFE_GROUP_KEYS.includes(key)) continue;
      const why = BANNED_GROUP_KEYS[key] || "not on SAFE_GROUP_KEYS, and group keys are deny by default";
      add(
        gm.index,
        "OPS-GROUP-KEY",
        `groupBy key "${key}": ${why}. Permitted keys are schoolId and adult or billing attributes only.`,
      );
    }
  }

  // -- Model access shapes ---------------------------------------------------
  for (const [model, klass] of ctx.modelClass) {
    const delegate = model.charAt(0).toLowerCase() + model.slice(1);
    // A delegate lifted out of the client and into a binding, rather than
    // called inline. Rooted at the client on purpose: `teacher.school.name` on
    // a DTO must not fire, `const s = db.school` must.
    const aliasRe = new RegExp(
      `\\b(?:db|prisma|tx|client)\\s*\\.\\s*${delegate}\\b(?!\\s*\\.)`,
      "g",
    );
    const alias = aliasRe.exec(code);
    if (alias) {
      add(
        alias.index,
        "OPS-DB-HANDLE",
        `${alias[0].trim()} is a delegate handle, not a call. Every model rule in this gate matches \`<client>.<delegate>.<method>(\`, so a delegate assigned to a variable or passed to a helper is invisible to all of them. Call it inline.`,
      );
    }
    const re = new RegExp(`\\.\\s*${delegate}\\s*\\.\\s*(${PRISMA_METHODS.join("|")})\\s*\\(`, "g");
    let m;
    while ((m = re.exec(code))) {
      const method = m[1];
      if (model === "AuditLog") {
        // R4: ops reads OpsAuditLog. The one permitted auditLog call shape is
        // db.auditLog.create, from the single write-only helper, so a platform
        // action can appear in the affected school's own audit feed.
        if (method === "create" && rel === AUDIT_WRITE_MODULE) continue;
        add(
          m.index,
          "OPS-AUDITLOG",
          `db.auditLog.${method}(). AuditLog.detail is free text written by teacher-facing actions and routinely contains a child's first name. Ops reads OpsAuditLog; the only permitted auditLog shape is create, from ${AUDIT_WRITE_MODULE}.`,
        );
        continue;
      }
      // One module writes, and it is the one that implements the registry.
      // Checked before the per-class permission, because ADULT_READABLE
      // permits create/update/updateMany/upsert and the point of this rule is
      // that WHERE a write lives is a separate question from whether that model
      // may be written at all.
      if (
        MUTATING_METHODS.includes(method) &&
        klass !== "OPS_OWNED" &&
        rel !== OPERATIONS_MODULE
      ) {
        add(
          m.index,
          "OPS-MUTATION-MODULE",
          `${delegate}.${method}() writes to a record that is not the operator's own, in a file that is not ${OPERATIONS_MODULE}. Every mutating action is named, listed in the frozen registry (src/lib/ops/registry.ts) and implemented in that one module, with its audit row in the same transaction. A write anywhere else is an operation nobody put on the list.`,
        );
        continue;
      }
      const permitted = METHODS_BY_CLASS[klass];
      if (
        permitted.includes(method) ||
        (model === "Parent" && isRotationCall(m.index + m[0].length - 1))
      ) {
        // A permitted call shape can still hand over a credential, because a
        // Prisma read with no `select:` returns EVERY scalar column. Before
        // this rule `db.teacher.findMany({ take: 50 })` was a clean pass and
        // returned fifty password hashes, and
        // `db.parent.findUnique({ where: { email } })` returned the family code
        // that signs the operator in as that family (amendment C1). Both are
        // permitted call shapes on permitted models.
        const projection = ctx.projectionRequired.get(delegate);
        if (projection && ROW_RETURNING_METHODS.includes(method)) {
          const open = struct.indexOf("(", m.index + m[0].length - 1);
          const close = open === -1 ? -1 : matchParen(struct, open);
          const args = close === -1 ? "" : code.slice(open, close);
          if (!/\bselect\s*:/.test(args)) {
            add(
              m.index,
              "OPS-UNPROJECTED-READ",
              `${delegate}.${method}() has no \`select:\`, so it returns every scalar column of ${projection.model}, including ${projection.denied.join(", ")}. A read with no projection is a read of the denylist. Name the columns; \`include:\` is not a projection.`,
            );
          }
        }
        continue;
      }
      add(
        m.index,
        "OPS-MODEL-METHOD",
        `${delegate}.${method}() is not permitted: ${model} is classified ${klass}, whose permitted call shapes are ${
          permitted.length ? permitted.join(", ") : "none at all"
        }.`,
      );
    }
  }

  // -- Relations inside select / include / _count ----------------------------
  // A _count on a permitted relation is not automatically fine, and a child
  // relation is not automatically banned. The precise form: a child relation
  // name may appear ONLY as a direct key inside a `_count: { select: { ... } }`
  // block, with the value `true`. Anywhere else it is a read of a child row.
  const countSelectRanges = [];
  for (const [open, close] of blockRangesFor(struct, /\b_count\s*:\s*/)) {
    const inner = struct.slice(open, close);
    const selRe = /\bselect\s*:\s*/g;
    let sm;
    while ((sm = selRe.exec(inner))) {
      const brace = inner.indexOf("{", sm.index + sm[0].length - 1);
      if (brace === -1) continue;
      if (inner.slice(sm.index + sm[0].length, brace).trim() !== "") continue;
      const closeInner = matchBrace(inner, brace);
      if (closeInner === -1) continue;
      countSelectRanges.push([open + brace, open + closeInner]);
    }
  }

  // `_count: true` inside a select or include is a count of EVERY relation on
  // the row, which on a Parent is the children count that R11 refuses and on
  // anything else is a set of relation counts nobody named or reviewed. It
  // passed before this rule because it mentions no relation by name. Inside a
  // groupBy, `_count: true` means "rows in this group" and is fine, which is
  // why membership of a select/include block is the test.
  const projectionRanges = blockRangesFor(struct, /\b(?:select|include)\s*:\s*/);
  const queryRanges = blockRangesFor(struct, /\b(?:select|include|where|data|orderBy|_count)\s*:\s*/);
  const whereRanges = blockRangesFor(struct, /\bwhere\s*:\s*/);

  // The PR2 widening, kept in one function so the whole of it is readable at
  // once. See SCHOOL_SCOPE_INNER above for why it exists and how narrow it is.
  // Returns true only for `class: { teacher: { schoolId } }`, inside a where
  // block, in the read chokepoint, with nothing else in the object.
  const isSchoolScopeTraversal = (keyIndex) => {
    if (rel !== SCHOOL_SCOPE_MODULE) return false;
    if (!inAnyRange(whereRanges, keyIndex)) return false;
    // The nearest client call before this key. Anything other than the
    // headcount, and this is not the false positive the permission is for.
    const before = [
      ...code.slice(0, keyIndex).matchAll(/\b(?:db|prisma|tx|client)\s*\.\s*(\w+)\s*\.\s*(\w+)\s*\(/g),
    ];
    const nearest = before[before.length - 1];
    if (!nearest || `${nearest[1]}.${nearest[2]}` !== SCHOOL_SCOPE_CALL) return false;
    const colon = code.indexOf(":", keyIndex);
    if (colon === -1) return false;
    const open = struct.indexOf("{", colon);
    if (open === -1) return false;
    if (code.slice(colon + 1, open).trim() !== "") return false; // not the immediate value
    const close = matchBrace(struct, open);
    if (close === -1) return false;
    return SCHOOL_SCOPE_INNER.test(code.slice(open + 1, close));
  };

  // A computed property key inside a query object. This is the general answer
  // to every string-assembly trick the corpus pass found and to the ones it did
  // not: `["family" + "Code"]`, `` [`family${"Code"}`] `` and
  // `[["family","Code"].join("")]` all reduce to a key the gate cannot read,
  // and a key nobody can read is a key nobody reviewed. Unreadable means
  // DENIED, the same ruling as groupBy `by:`. A plain string literal key is
  // still allowed, because the identifier rules above can read it.
  for (const km of code.matchAll(/\[([^\]\n]*)\]\s*:/g)) {
    if (!inAnyRange(queryRanges, km.index)) continue;
    if (/^\s*["'][^"'\n]*["']\s*$/.test(km[1])) continue;
    add(
      km.index,
      "OPS-COMPUTED-SELECTION",
      `computed key "[${km[1].trim()}]" inside a query object. The gate cannot read which column this selects, and a column nobody can read from the source is a column nobody reviewed. Write the field name as a plain key. Ops never builds a projection at runtime.`,
    );
    break;
  }

  for (const cm of code.matchAll(/\b_count\s*:\s*true\b/g)) {
    if (!inAnyRange(projectionRanges, cm.index)) continue;
    add(
      cm.index,
      "OPS-COUNT-WILDCARD",
      "`_count: true` inside a select or include counts every relation on the row, including the child relations this gate refuses by name. On a Parent that is the linked-children count (R11). Name the relation you are counting: _count: { select: { <relation>: true } }.",
    );
    break;
  }

  for (const relation of ctx.childRelations) {
    const re = new RegExp(`\\b${relation}\\b["']?\\s*:`, "g");
    let m;
    while ((m = re.exec(code))) {
      if (ctx.neverLink.has(relation)) {
        add(
          m.index,
          "OPS-PARENT-CHILD-LINK",
          `"${relation}" links a parent to a child. Ruling R11 bans parent-to-child linkage in either direction, INCLUDING counts. This is the one rule in this gate awaiting an owner confirmation: amendment C2 outranks R11 and would permit a bare count. It is implemented strictly on purpose, because a gate that is too strict fails here, visibly, and can be relaxed deliberately with a fixture, while a gate that is too permissive fails silently and nobody ever learns.`,
        );
        break;
      }
      const afterColon = code.slice(m.index + m[0].length, m.index + m[0].length + 12).trim();
      const permitted = inAnyRange(countSelectRanges, m.index) && afterColon.startsWith("true");
      if (permitted) continue;
      if (relation === "class" && isSchoolScopeTraversal(m.index)) continue;
      add(
        m.index,
        "OPS-CHILD-RELATION",
        `"${relation}" is a relation to a non-adult model. It may appear only as a direct key inside _count: { select: { ${relation}: true } }. Anywhere else it selects child rows. If this is a DTO field holding a number, name it for the number (pupilCount), not for the relation.`,
      );
      break;
    }
  }

  // A relation selected with `true` returns whole rows of the RELATED model,
  // and OPS-UNPROJECTED-READ above only inspects the top level of the call. So
  // `db.school.findMany({ select: { id: true, staff: true } })` passed every
  // rule and returned every teacher's password hash, because `staff` points at
  // an adult model and adult models are not child relations. The relation names
  // are derived from the schema, so a new relation onto Teacher or Parent joins
  // this the day it lands.
  for (const [relation, projection] of ctx.unprojectedRelations) {
    const re = new RegExp(`\\b${relation}\\b["']?\\s*:\\s*true\\b`, "g");
    let m;
    while ((m = re.exec(code))) {
      if (!inAnyRange(projectionRanges, m.index)) continue;
      if (inAnyRange(countSelectRanges, m.index)) continue; // a count is not a row read
      add(
        m.index,
        "OPS-UNPROJECTED-READ",
        `"${relation}: true" pulls whole ${projection.model} rows through the relation, including ${projection.denied.join(", ")}. A nested relation needs its own select: exactly as much as the outer call does.`,
      );
      break;
    }
  }

  // -- requireOperator as the first statement (ops roots only) ---------------
  // In the App Router a Server Action is a POST endpoint that can be invoked
  // directly with a crafted request. A guard in a layout does not protect it,
  // and a convention that is not gated is not a control.
  //
  // QA note (R3, corpus pass): the file test named src/app/actions/ops/ and the
  // route-file basenames, so a server action module at src/app/ops/mutations.ts
  // carrying "use server" was never guard-checked at all. Any file under the
  // ops roots that declares "use server" is now guardable, wherever it sits.
  const guardable =
    underRoot &&
    (rel.startsWith("src/app/actions/ops/") ||
      /\/(page|layout|route|default|template)\.(tsx?|jsx?)$/.test(rel) ||
      /^\s*(["'])use server\1/m.test(code));
  if (guardable) {
    // Every exported callable, in every spelling. The original pattern covered
    // `export function` and `export const NAME = () => {}` and missed three
    // shapes that all passed clean:
    //   export default async (props) => { ... }        anonymous default arrow
    //   export const f = async function () { ... }     function expression
    //   async function h() { ... } export { h as GET } exported by list
    const candidates = [];
    const seenBody = new Set();
    const pushCandidate = (index, name, searchFrom) => {
      const bodyStart = code.indexOf("{", searchFrom);
      if (bodyStart === -1 || seenBody.has(bodyStart)) return;
      seenBody.add(bodyStart);
      candidates.push({ index, name, bodyStart });
    };
    const fnRe =
      /\bexport\s+(?:default\s+)?(?:async\s+)?function\s*(\*?)\s*(\w*)\s*\([^)]*\)\s*(?::[^{]*)?\{|\bexport\s+(?:default\s+)?const\s+(\w+)\s*(?::[^=]*)?=\s*(?:async\s*)?\([^)]*\)\s*(?::[^=]*)?=>\s*\{/g;
    let fm;
    while ((fm = fnRe.exec(code))) {
      pushCandidate(fm.index, fm[2] || fm[3] || "default export", fm.index + fm[0].length - 1);
    }
    const anonDefaultRe =
      /\bexport\s+default\s+(?:async\s*)?\([^)]*\)\s*(?::[^=]*)?=>\s*\{/g;
    while ((fm = anonDefaultRe.exec(code))) {
      pushCandidate(fm.index, "default export", fm.index + fm[0].length - 1);
    }
    const fnExprRe =
      /\bexport\s+(?:default\s+)?(?:const|let|var)\s+(\w+)\s*(?::[^=]*)?=\s*(?:async\s+)?function\s*\*?\s*\w*\s*\([^)]*\)\s*(?::[^{]*)?\{/g;
    while ((fm = fnExprRe.exec(code))) {
      pushCandidate(fm.index, fm[1], fm.index + fm[0].length - 1);
    }
    // Locals exported by an export list. `export { handler as GET }` makes
    // handler a route entry point just as surely as `export function GET`.
    const listed = new Set();
    for (const lm of code.matchAll(/\bexport\s*\{([^}]*)\}\s*(?!from)/g)) {
      for (const part of lm[1].split(",")) {
        const localName = part.trim().split(/\s+as\s+/)[0].trim();
        if (/^\w+$/.test(localName)) listed.add(localName);
      }
    }
    // `export const GET = handler;` is the same aliasing move with different
    // punctuation: the exported entry point is a local function declared above.
    for (const am of code.matchAll(
      /\bexport\s+(?:default\s+)?(?:const|let|var)\s+\w+\s*(?::[^=\n]*)?=\s*(\w+)\s*[;\n]/g,
    )) {
      listed.add(am[1]);
    }
    for (const name of listed) {
      const declRe = new RegExp(
        `(?:async\\s+)?function\\s*\\*?\\s*${name}\\s*\\([^)]*\\)\\s*(?::[^{]*)?\\{` +
          `|(?:const|let|var)\\s+${name}\\s*(?::[^=]*)?=\\s*(?:async\\s*)?(?:\\([^)]*\\)\\s*(?::[^=]*)?=>|function\\s*\\*?\\s*\\w*\\s*\\([^)]*\\)\\s*(?::[^{]*)?)\\s*\\{`,
        "g",
      );
      let dm;
      while ((dm = declRe.exec(code))) {
        pushCandidate(dm.index, name, dm.index + dm[0].length - 1);
      }
    }
    // Inline Server Actions. A function declared inside a component with
    // "use server" as its first statement is compiled to its own POST endpoint
    // with its own action id, reachable with a crafted request exactly like a
    // module-level action, and it is not exported so none of the patterns above
    // sees it. The guard belongs immediately after the directive.
    for (const im of code.matchAll(/\{\s*(["'])use server\1\s*;?\s*/g)) {
      const brace = code.indexOf("{", im.index);
      if (seenBody.has(brace)) continue;
      seenBody.add(brace);
      candidates.push({
        index: im.index,
        name: "an inline Server Action",
        bodyStart: brace,
      });
    }
    candidates.sort((a, b) => a.index - b.index);
    // The door files get the narrower guard and NOTHING ELSE gets it: a normal
    // ops page that opens with requireOpsDoor() is a page reachable by anyone
    // with the kill switch on, so it fails as a missing requireOperator.
    const isDoor = OPS_DOOR_FILES.includes(rel);
    const required = isDoor ? DOOR_GUARD_CALL : FULL_GUARD_CALL;
    for (const { index, name, bodyStart } of candidates) {
      const body = code.slice(bodyStart + 1);
      const firstStatement = body.replace(/^\s*(["'])use \w+\1\s*;?\s*/, "").trimStart();
      if (!firstStatement.startsWith(required)) {
        add(
          index,
          isDoor ? "OPS-REQUIRE-DOOR-GUARD" : "OPS-REQUIRE-OPERATOR",
          isDoor
            ? `exported "${name}" does not begin with \`${DOOR_GUARD_CALL}\`. This file is on OPS_DOOR_FILES, which means it runs before anybody is authenticated, so it must still enforce the OPS_ENABLED kill switch as its first statement. If this file no longer needs to run unauthenticated, take it off that list and use requireOperator instead.`
            : `exported "${name}" does not begin with \`${FULL_GUARD_CALL}\`. A Server Action is a POST endpoint reachable with a crafted request; the guard must be the first statement of the function, not of an ancestor. requireOpsDoor() is NOT a substitute: it checks the kill switch and proves nothing about who is asking.`,
        );
      }
    }
  }

  return v;
}

// ---------------------------------------------------------------------------
// Import walk
// ---------------------------------------------------------------------------

function resolveLocal(spec, fromRel) {
  let base;
  if (spec.startsWith("@/")) base = path.join("src", spec.slice(2));
  else if (spec.startsWith(".")) base = path.normalize(path.join(path.dirname(fromRel), spec));
  else return null;
  base = base.split(path.sep).join("/");
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
  ];
  for (const c of candidates) {
    const abs = path.join(ROOT, c);
    if (existsSync(abs) && statSync(abs).isFile() && CODE_EXT.test(c)) return c;
  }
  return null;
}

function walkDir(relDir, out) {
  const abs = path.join(ROOT, relDir);
  if (!existsSync(abs)) return;
  for (const entry of readdirSync(abs)) {
    const relPath = `${relDir}/${entry}`;
    const s = statSync(path.join(ROOT, relPath));
    if (s.isDirectory()) walkDir(relPath, out);
    else if (CODE_EXT.test(entry)) out.push(relPath);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const schemaPath = path.join(ROOT, "prisma/schema.prisma");
if (!existsSync(schemaPath)) {
  console.error("✖ Ops blindness gate: prisma/schema.prisma not found. The model list is derived from it, so the gate cannot run.");
  process.exit(1);
}
const schema = parseSchema(readFileSync(schemaPath, "utf8"));

const violations = [];
const notes = [];

// -- Classification drift, both directions -----------------------------------
const modelClass = new Map();
const classified = [
  [ADULT_READABLE, "ADULT_READABLE"],
  [AGGREGATE_ONLY, "AGGREGATE_ONLY"],
  [LOOKUP_ONLY, "LOOKUP_ONLY"],
  [CREDENTIAL_NEVER, "CREDENTIAL_NEVER"],
  [OPS_OWNED, "OPS_OWNED"],
  [PLATFORM_CONTENT, "PLATFORM_CONTENT"],
];
for (const [list, klass] of classified) {
  for (const model of list) {
    if (!schema.has(model)) {
      violations.push({
        rel: "scripts/check-ops-blindness.mjs",
        line: 0,
        rule: "OPS-CLASS-STALE",
        reason: `${klass} names "${model}", which no longer exists in prisma/schema.prisma. The model was renamed or removed, so this entry is now protecting nothing.`,
      });
      continue;
    }
    if (modelClass.has(model)) {
      violations.push({
        rel: "scripts/check-ops-blindness.mjs",
        line: 0,
        rule: "OPS-CLASS-DUPLICATE",
        reason: `"${model}" is in more than one class. The classes are disjoint by design.`,
      });
    }
    modelClass.set(model, klass);
  }
}
for (const model of schema.keys()) {
  if (!modelClass.has(model)) {
    violations.push({
      rel: "prisma/schema.prisma",
      line: 0,
      rule: "OPS-MODEL-UNKNOWN",
      reason: `model "${model}" is in the schema but is classified nowhere in scripts/check-ops-blindness.mjs. Unknown means DENIED, and the build fails until a human classifies it against SAFEGUARDING rules 4 and 5. Adding a model must never silently widen what ops may read.`,
    });
  }
}

// -- Denylist drift, both directions -----------------------------------------
const schemaFieldNames = new Set();
const fieldOwners = new Map();
for (const [model, def] of schema) {
  for (const f of def.fields) {
    if (schema.has(f.type)) continue; // relation field, not a scalar column
    schemaFieldNames.add(f.name);
    if (!fieldOwners.has(f.name)) fieldOwners.set(f.name, []);
    fieldOwners.get(f.name).push(model);
  }
}
for (const field of DENY_FIELDS) {
  if (!schemaFieldNames.has(field)) {
    violations.push({
      rel: "scripts/check-ops-blindness.mjs",
      line: 0,
      rule: "OPS-DENYLIST-STALE",
      reason: `denylist entry "${field}" no longer exists in prisma/schema.prisma; the field was renamed or removed, so this entry is now protecting nothing.`,
    });
  }
}
for (const field of PENDING_FIELDS) {
  if (schemaFieldNames.has(field)) {
    notes.push(`"${field}" has landed in the schema. Move it from PENDING_FIELDS to DENY_FIELDS.`);
  } else {
    notes.push(`"${field}" is still pending (named in the SAFEGUARDING rule 1 amendment, not yet a column). Listed so the entry is live the day it lands.`);
  }
}
const denySet = new Set([...DENY_FIELDS, ...PENDING_FIELDS]);
for (const [field, owners] of fieldOwners) {
  if (denySet.has(field)) continue;
  // Fields on the operator's own models are ops's own business, not a read of
  // somebody else's data, so they are not denylist candidates.
  if (owners.every((m) => OPS_OWNED.includes(m))) continue;
  if (!SENSITIVE_NAME_PATTERNS.some((re) => re.test(field))) continue;
  violations.push({
    rel: "prisma/schema.prisma",
    line: 0,
    rule: "OPS-DENYLIST-DRIFT",
    reason: `field "${field}" on ${owners.join(", ")} looks like child data or a credential and is not on the ops denylist. Classify it: either add it to DENY_FIELDS, or say in a comment why an operator may read it.`,
  });
}

// -- Child relation names, derived from the schema ---------------------------
const adultTargets = new Set([...ADULT_READABLE, ...OPS_OWNED]);
const childRelations = new Set();
for (const [, def] of schema) {
  for (const f of def.fields) {
    if (!schema.has(f.type)) continue;
    if (adultTargets.has(f.type)) continue;
    childRelations.add(f.name);
  }
}
// The C2 / R11 conflict, implemented strictly. See the header.
const neverLink = new Set(["children", "parents"]);
for (const r of neverLink) childRelations.add(r);

// Models the gate permits row reads on that still own a denylisted scalar
// column. A read of one of these with no `select:` returns the denied column,
// so a projection is mandatory. Derived from the schema, so a new credential
// column on Teacher or Parent joins this set the day it lands.
const projectionRequired = new Map();
for (const [model, klass] of modelClass) {
  // PLATFORM_CONTENT joins these two: it permits row reads, and it owns the
  // denylisted payload column names, so a bare findMany would return them.
  if (klass !== "ADULT_READABLE" && klass !== "LOOKUP_ONLY" && klass !== "PLATFORM_CONTENT") continue;
  const denied = (schema.get(model)?.fields ?? [])
    .filter((f) => !schema.has(f.type) && denySet.has(f.name))
    .map((f) => f.name);
  if (!denied.length) continue;
  projectionRequired.set(model.charAt(0).toLowerCase() + model.slice(1), { model, denied });
}

// Normalised names an assembled string literal must not spell: every denied
// field, every child-scoping key, and every model delegate (so `db["journal" +
// "Item"]` is caught by name as well as by shape).
const assembledTargets = new Map();
for (const f of denySet) assembledTargets.set(normaliseIdentifier(f), `a denied identifier ("${f}")`);
for (const k of CHILD_SCOPE_KEYS) assembledTargets.set(normaliseIdentifier(k), `a child-scoping key ("${k}")`);
for (const model of schema.keys()) {
  const delegate = model.charAt(0).toLowerCase() + model.slice(1);
  if (assembledTargets.has(normaliseIdentifier(delegate))) continue;
  assembledTargets.set(normaliseIdentifier(delegate), `the Prisma delegate for model ${model}`);
}

// Relation field names that point AT one of those models, so that selecting the
// relation with `true` is caught as the unprojected read it is.
const unprojectedRelations = new Map();
for (const [, def] of schema) {
  for (const f of def.fields) {
    if (!schema.has(f.type)) continue;
    const target = projectionRequired.get(f.type.charAt(0).toLowerCase() + f.type.slice(1));
    if (!target || unprojectedRelations.has(f.name)) continue;
    unprojectedRelations.set(f.name, target);
  }
}

const ctx = {
  modelClass,
  childRelations: [...childRelations],
  neverLink,
  projectionRequired,
  assembledTargets,
  unprojectedRelations,
};

// -- Self-test ---------------------------------------------------------------
//
// A gate nobody has seen fail is a decoration, and a gate that fails on
// everything passes a naive self-test while being useless. So the corpus needs
// both kinds and the run asserts both.
//
// Corpus convention, for whoever extends it (ruling R3 puts that with QA, not
// with this gate's author):
//
//   tests/fixtures/ops-blindness/*.txt   .txt so the real run never sees them
//                                        and no other gate's walker does either
//   bad-<rule>.txt                       must fire; declares what it expects
//   good-<thing>.txt                     must pass clean
//
//   // @path: src/app/actions/ops/x.ts   REQUIRED, first line. The path the
//                                        fixture is judged as, because the
//                                        import allowlist and the
//                                        requireOperator rule are root-only.
//   // @expect: OPS-RULE-ID              REQUIRED on every bad-* fixture, one
//                                        line per rule. "Something fired" is
//                                        not proof that the right thing fired.
//
// Not provable from a single-file corpus, and therefore covered by QA against
// a real tree instead: the multi-hop import walk, the zero-scanned-files
// assertion, and the schema drift checks. They live in
// tests/battery/security/ops-blindness-gate.spec.ts (spec A15), in the blocking
// `security` project, which builds throwaway trees under the OS temp directory
// and runs this script against them as a subprocess. That spec also asserts
// that --self-test is honest (it fails on a missing, empty, all-bad or all-good
// corpus, and on a fixture that declares the wrong rule), and it deletes each
// declared rule in turn from a throwaway copy of this file to prove every one
// of them is load-bearing. See FINDINGS.md F23 for what that pass found.
const SELF_TEST_DIR = "tests/fixtures/ops-blindness";

function runSelfTest() {
  const abs = path.join(ROOT, SELF_TEST_DIR);
  if (!existsSync(abs)) {
    console.error(
      `✖ Ops blindness gate self-test: ${SELF_TEST_DIR} does not exist.\n` +
        "  A gate nobody has seen fail is a decoration. Restore the corpus; do not delete the flag.",
    );
    process.exit(1);
  }
  const files = readdirSync(abs).filter((f) => f.endsWith(".txt")).sort();
  if (files.length === 0) {
    console.error(
      `✖ Ops blindness gate self-test: ${SELF_TEST_DIR} holds no fixtures.\n` +
        "  An empty corpus proves nothing and passes silently, which is the failure mode this gate exists to prevent.",
    );
    process.exit(1);
  }
  const failures = [];
  let bad = 0;
  let good = 0;
  for (const f of files) {
    const raw = readFileSync(path.join(abs, f), "utf8");
    const pathHeader = raw.match(/^\/\/\s*@path:\s*(\S+)/m);
    if (!pathHeader) {
      failures.push(`${f}: no "// @path:" header, so the gate cannot know which rules apply to it.`);
      continue;
    }
    const expected = [...raw.matchAll(/^\/\/\s*@expect:\s*(\S+)/gm)].map((m) => m[1]);
    const found = checkFile(pathHeader[1], raw, ctx);
    const foundRules = new Set(found.map((x) => x.rule));
    if (f.startsWith("bad-")) {
      bad += 1;
      if (expected.length === 0) {
        failures.push(`${f}: a bad fixture must declare "// @expect: RULE-ID", otherwise "something fired" counts as proof.`);
        continue;
      }
      for (const rule of expected) {
        if (!foundRules.has(rule)) {
          failures.push(
            `${f}: expected ${rule} to fire and it did not. Fired: ${[...foundRules].join(", ") || "nothing"}.`,
          );
        }
      }
    } else if (f.startsWith("good-")) {
      good += 1;
      if (found.length) {
        failures.push(
          `${f}: clean fixture was flagged: ${found.map((x) => `${x.rule} (${x.reason.slice(0, 80)})`).join("; ")}`,
        );
      }
    } else {
      failures.push(`${f}: fixture names must start with "bad-" or "good-".`);
    }
  }
  if (bad === 0 || good === 0) {
    failures.push(
      `the corpus needs both kinds: ${bad} bad and ${good} good found. A gate that fails on everything passes a naive self-test while being useless.`,
    );
  }
  if (violations.length) {
    failures.push(
      "the schema-derived checks (model classification and denylist drift) are failing, so the self-test result cannot be trusted. Run the gate without --self-test to see them.",
    );
  }
  if (failures.length) {
    console.error("✖ Ops blindness gate self-test FAILED:\n");
    for (const f of failures) console.error("  " + f);
    console.error(
      "\nFix the gate or the fixture. Never delete a fixture to get a green build: weakening this gate is the failure, not the workaround.",
    );
    process.exit(1);
  }
  console.log(
    `✓ Ops blindness gate self-test passed (${bad} violating fixtures all fired their expected rule, ${good} clean fixtures all passed).`,
  );
  console.log("  Corpus coverage is QA's to extend (handbook R3): the gate's author does not certify that it fires.");
  process.exit(0);
}

if (process.argv.includes("--self-test")) runSelfTest();

// -- Build the scan set ------------------------------------------------------
//
// Two cases that look the same from a distance and are not:
//
//   A. NO ops root exists on disk. The operator programme has not written any
//      code yet. That is the expected state before PR1, and it is a clean pass
//      with the schema checks above still enforced.
//
//   B. An ops root EXISTS but matches no files. That is rot, not absence:
//      somebody renamed a directory, or moved the code, and the gate would
//      otherwise scan nothing and exit 0 forever. That is a FAILURE.
//
// Case B is the single most likely way this gate quietly stops working, which
// is why the count is asserted rather than merely printed.
const existingRoots = OPS_ROOTS.filter((r) => existsSync(path.join(ROOT, r)));
const rootFiles = [];
const perRoot = new Map();
for (const r of existingRoots) {
  const files = [];
  walkDir(r, files);
  perRoot.set(r, files.length);
  rootFiles.push(...files);
}

// Reverse membership: a file anywhere in src/ that imports from an ops root is
// treated as ops code too. Otherwise the first person in a hurry puts an ops
// action in src/app/actions/billing.ts and the whole gate is bypassed by a file
// path.
//
// QA note (R3, corpus pass): this used to be a substring test for the literal
// strings "@/lib/ops/" and "@/app/actions/ops/", so the same file importing
// "../../lib/ops/reads" was not treated as ops code and was never scanned. The
// specifiers are resolved now, exactly as the import allowlist resolves them.
const allSrc = [];
walkDir("src", allSrc);
for (const rel of allSrc) {
  if (rootFiles.includes(rel)) continue;
  const text = readFileSync(path.join(ROOT, rel), "utf8");
  const reachesOps = importSpecsOf(stripComments(text)).some(({ spec }) => {
    const local = canonicalLocalSpec(spec, rel);
    return Boolean(local) && !local.outsideSrc && isUnderRoots(local.rel);
  });
  if (reachesOps) rootFiles.push(rel);
}

// Transitive local import walk. Following only local imports, so a banned read
// cannot be laundered through a helper one file away. The chain is reported in
// the failure message, because "src/lib/ops/reads.ts is the only file that
// touches Prisma" is worthless if an ops screen imports a shared helper that
// itself imports the database.
const scanned = new Map(); // rel -> chain (array of rel)
const queue = rootFiles.map((rel) => ({ rel, chain: [rel] }));
while (queue.length) {
  const { rel, chain } = queue.shift();
  if (scanned.has(rel)) continue;
  scanned.set(rel, chain);
  const abs = path.join(ROOT, rel);
  if (!existsSync(abs)) continue;
  const code = stripComments(readFileSync(abs, "utf8"));
  for (const { spec, typeOnly } of importSpecsOf(code)) {
    if (typeOnly) continue; // a type is not a read path
    const target = resolveLocal(spec, rel);
    if (!target || scanned.has(target) || TERMINAL_MODULES.has(target)) continue;
    queue.push({ rel: target, chain: [...chain, target] });
  }
}

// -- Anti-rot ----------------------------------------------------------------
if (existingRoots.length > 0) {
  if (rootFiles.length === 0) {
    violations.push({
      rel: existingRoots.join(", "),
      line: 0,
      rule: "OPS-SCAN-EMPTY",
      reason:
        "an ops root exists on disk but the scan matched zero files. That is rot, not absence: a renamed or moved directory leaves this gate scanning nothing and exiting 0 forever.",
    });
  }
  for (const r of existingRoots) {
    if (perRoot.get(r) === 0) {
      violations.push({
        rel: r,
        line: 0,
        rule: "OPS-SCAN-EMPTY",
        reason: `the root "${r}" exists but holds no scannable code. Either the code moved (fix the root list in the same commit) or the directory is a leftover (delete it). An empty root is a gate scanning nothing.`,
      });
    }
  }
}

// -- Run the per-file rules ---------------------------------------------------
for (const [rel, chain] of scanned) {
  const abs = path.join(ROOT, rel);
  if (!existsSync(abs)) continue;
  const raw = readFileSync(abs, "utf8");
  for (const v of checkFile(rel, raw, ctx)) {
    violations.push({ ...v, chain: chain.length > 1 ? chain.join(" -> ") : null });
  }
}

// -- Report -------------------------------------------------------------------
if (violations.length) {
  console.error("✖ Ops blindness gate FAILED:\n");
  for (const v of violations) {
    const where = v.line ? `${v.rel}:${v.line}` : v.rel;
    console.error(`  ${where}  [${v.rule}] ${v.reason}`);
    if (v.chain) console.error(`      reached from: ${v.chain}`);
  }
  console.error(
    `\n${violations.length} violation(s). See SAFEGUARDING.md rules 4, 5, 8 and 11, and RETENTION.md.\n` +
      "The fix is a new named aggregate helper in src/lib/ops/reads.ts with a comment explaining what it counts\n" +
      "and why the count cannot identify a child. There is no exceptions array in this gate and there must never be one:\n" +
      "weakening this gate is the failure, not the workaround.",
  );
  process.exit(1);
}

if (existingRoots.length === 0) {
  console.log(
    "✓ Ops blindness gate passed. No ops root exists yet (" +
      OPS_ROOTS.join(", ") +
      "), which is the expected state before the first operator PR.",
  );
} else {
  const rootSummary = existingRoots.map((r) => `${r}: ${perRoot.get(r)}`).join(", ");
  console.log(
    `✓ Ops blindness gate passed. ${rootFiles.length} ops file(s) (${rootSummary}), ` +
      `${scanned.size} file(s) scanned including transitive local imports.`,
  );
}
console.log(
  `  ${schema.size} models classified from prisma/schema.prisma; unknown models fail. ` +
    `${DENY_FIELDS.length} denied identifiers, all present in the schema.`,
);
for (const n of notes) console.log(`  Note: ${n}`);
