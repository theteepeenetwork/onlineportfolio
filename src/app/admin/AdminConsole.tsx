"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  assignClassToStaff,
  inviteStaff,
  removeStaff,
  resendInvite,
  setStaffRole,
} from "@/app/actions/admin";
import { Icon, type IconName } from "@/components/icons/Icon";
import { ImportClassForm } from "@/components/ImportClassForm";
import { BillingPane } from "./BillingPane";
import { Guide } from "./Guide";
import { Promises } from "./Promises";
import { CARD, TABS, TAB_HEADING, type Tab } from "./tabs";

export type StaffRow = {
  id: string;
  name: string;
  email: string;
  role: string; // ADMIN | TEACHER | TA
  status: string; // ACTIVE | INVITED
  isYou: boolean;
  classes: string[];
};

export type SchoolClass = {
  id: string;
  name: string;
  teacherId: string;
  teacherName: string;
  children: number;
  /**
   * Set when this class arrived with its current holder because somebody was
   * REMOVED from the school, carrying the audit row's own words. Null for a
   * class that has always been theirs or that arrived by ordinary reassignment.
   *
   * The point of surfacing it is that the holding is meant to be temporary: an
   * admin who removed a colleague now holds that colleague's children's work,
   * and rule 5 says admins are not all-seeing. A flag makes that a thing they
   * can see and act on rather than a silent dump.
   */
  inherited: string | null;
};

export type AuditEntry = {
  id: string;
  atISO: string;
  actorName: string;
  action: string;
  detail: string | null;
  /** True when the detail names a child and was withheld on the server (rule 5). */
  redacted?: boolean;
};

// Human labels for audit actions.
const ACTION_LABEL: Record<string, string> = {
  MOMENT_APPROVED: "Approved a moment",
  MOMENT_RETURNED: "Sent a moment back",
  MOMENT_DELETED: "Deleted a moment",
  STAFF_INVITED: "Invited staff",
  STAFF_ROLE_CHANGED: "Changed a role",
  STAFF_REMOVED: "Removed staff",
  CLASS_ASSIGNED: "Assigned a class",
  CLASS_DELETED: "Deleted a class",
  CLASS_IMPORTED: "Set up a class",
  CLASS_AGE_MODE_CHANGED: "Changed a class register",
  CLASS_CODE_ROTATED: "Issued a new class code",
  BILLING_INVOICE_REQUESTED: "Requested an invoice",
  BILLING_ACTIVATED: "Plan activated",
  BILLING_PAST_DUE: "Payment retrying",
  BILLING_FROZEN: "Plan paused",
  BILLING_UPDATED: "Plan updated",
  BILLING_JOINED_SCHOOL: "Joined the school plan",
};

const AVATAR_PALETTE = ["#E08A9B", "#8AB9D6", "#A6C979", "#F0B441", "#B99CD6", "#37796f", "#E8A06A", "#C2476B"];
function avatarColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}
function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
}

const ROLE_STYLE: Record<string, { label: string; bg: string; color: string; border: string }> = {
  ADMIN: { label: "Admin", bg: "#F7E0E6", color: "#C2476B", border: "#E8B7C4" },
  TA: { label: "Teaching assistant", bg: "#E5EED9", color: "#5C7A32", border: "#C7DBAE" },
  TEACHER: { label: "Teacher", bg: "#D8ECE8", color: "#2E6B64", border: "#B6D8D2" },
};
const roleStyle = (r: string) => ROLE_STYLE[r] ?? ROLE_STYLE.TEACHER;

const JAM_BTN: React.CSSProperties = {
  font: "700 15px var(--font-atkinson)",
  color: "#FAF6EE",
  background: "#C2476B",
  border: "none",
  borderRadius: 999,
  padding: "12px 24px",
  cursor: "pointer",
  boxShadow: "0 3px 0 #93304F",
};
const INPUT: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  font: "400 16px var(--font-atkinson)",
  padding: "11px 13px",
  border: "3px solid #22304A",
  borderRadius: 10,
  background: "#FAF6EE",
  color: "#22304A",
};

type BillingProps = React.ComponentProps<typeof BillingPane>;

export function AdminConsole({
  schoolName,
  plan,
  billing,
  meId,
  staff,
  classes,
  childrenCount,
  audit,
}: {
  schoolName: string;
  plan: string;
  billing: Omit<BillingProps, "invoiceRequested">;
  meId: string;
  staff: StaffRow[];
  classes: SchoolClass[];
  childrenCount: number;
  audit: AuditEntry[];
}) {
  const [tab, setTab] = useState<Tab>("staff");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [submenu, setSubmenu] = useState<"role" | "classes" | null>(null);
  const [inviting, setInviting] = useState(false);
  const [importing, setImporting] = useState(false);

  const invited = staff.filter((s) => s.status === "INVITED").length;
  const closeMenus = () => { setMenuId(null); setSubmenu(null); };

  // Keyed by `id`, not by `label`: two of these read "Staff" once a school has
  // more than one member of staff, and a duplicate React key drops a card.
  const stats = [
    { id: "staff", value: `${staff.length}`, label: "Staff", sub: invited > 0 ? `${invited} invite${invited === 1 ? "" : "s"} pending` : "all active", color: "#22304A" },
    { id: "classes", value: `${classes.length}`, label: "Classes", sub: "across the school", color: "#37796f" },
    { id: "pupils", value: `${childrenCount}`, label: "Pupils", sub: "no pupil logins", color: "#C2476B" },
    // The fourth card is the PLAN, not a second staff count. It used to repeat
    // `staff.length` under a "Staff" label, which read as a seat count on a plan
    // that has never had seats — exactly the wrong thing to imply.
    { id: "plan", value: plan, label: "Plan", sub: "see the Billing tab", color: "#B07A1E", small: true },
  ];

  return (
    <div className="sj" onClick={closeMenus} style={{ minHeight: "100vh", background: "#FAF6EE", fontFamily: "var(--font-atkinson)", color: "#22304A" }}>
      {/* ink top bar — signals the whole-school space */}
      <header data-shell="admin-header" style={{ display: "flex", alignItems: "center", gap: 22, padding: "14px 32px", background: "#22304A", position: "sticky", top: 0, zIndex: 30, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <JarMark />
          <span style={{ font: "600 19px var(--font-fredoka)", color: "#FAF6EE" }}>storyjar</span>
          <span style={{ font: "700 12px var(--font-atkinson)", color: "#22304A", background: "#F0B441", borderRadius: 6, padding: "3px 9px", letterSpacing: "0.05em", textTransform: "uppercase" }}>Admin</span>
        </div>
        <nav style={{ display: "flex", gap: 4, marginLeft: 8, flexWrap: "wrap" }}>
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={(e) => { e.stopPropagation(); setTab(t.id); closeMenus(); }}
                style={{ display: "inline-flex", alignItems: "center", minHeight: 44, font: "700 15px var(--font-atkinson)", color: active ? "#22304A" : "#C4CDDD", background: active ? "#FAF6EE" : "transparent", border: "none", borderRadius: 999, padding: "7px 16px", whiteSpace: "nowrap", cursor: "pointer" }}
              >
                {t.label}
              </button>
            );
          })}
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {/* The way back to a teacher's own classes. It measured 99×17 — the
              only route out of the admin console, and the shortest control on
              the screen. It now carries a 44px box like everything else. */}
          <Link href="/teacher" style={{ display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 8px", borderRadius: 10, font: "700 14px var(--font-atkinson)", color: "#C4CDDD", textDecoration: "none", whiteSpace: "nowrap" }}>My teaching →</Link>
          <span style={{ width: 38, height: 38, borderRadius: "50%", background: avatarColor(meId), display: "flex", alignItems: "center", justifyContent: "center", font: "600 16px var(--font-fredoka)", color: "#FFFDF7" }}>
            {initials(staff.find((s) => s.id === meId)?.name ?? "?")}
          </span>
        </div>
      </header>

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 32px 60px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: 0, font: "700 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>{schoolName}</p>
            <h1 style={{ margin: "4px 0 0", font: "600 32px var(--font-fredoka)" }}>{TAB_HEADING[tab]}</h1>
          </div>
          {tab === "staff" && (
            <button onClick={(e) => { e.stopPropagation(); setInviting((v) => !v); }} style={{ ...JAM_BTN, marginLeft: "auto" }} aria-expanded={inviting}>＋ Invite staff</button>
          )}
          {tab === "classes" && (
            <button onClick={(e) => { e.stopPropagation(); setImporting((v) => !v); }} style={{ ...JAM_BTN, marginLeft: "auto" }} aria-expanded={importing}>＋ Paste a class list</button>
          )}
        </div>

        {/* stats strip (Staff + Overview) */}
        {(tab === "staff" || tab === "overview") && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginTop: 22 }}>
            {stats.map((st) => (
              <div key={st.id} style={CARD}>
                <p style={{ margin: 0, font: `600 ${"small" in st && st.small ? 19 : 30}px var(--font-fredoka)`, color: st.color }}>{st.value}</p>
                <p style={{ margin: "2px 0 0", font: "700 14px var(--font-atkinson)", color: "#43506B" }}>{st.label}</p>
                <p style={{ margin: "2px 0 0", font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>{st.sub}</p>
              </div>
            ))}
          </div>
        )}

        {tab === "staff" && (
          <>
            {inviting && <InviteForm onDone={() => setInviting(false)} />}
            <StaffTable
              staff={staff}
              classes={classes}
              menuId={menuId}
              submenu={submenu}
              onToggleMenu={(id) => { setMenuId(menuId === id ? null : id); setSubmenu(null); }}
              onSubmenu={setSubmenu}
            />
            <p style={{ margin: "14px 2px 0", font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>
              Each teacher manages their own classes and approval queue. Admins can invite staff, assign classes and manage the school subscription — but never see pupils&apos; work unless they teach the class.
            </p>
          </>
        )}

        {tab === "overview" && (
          <>
            <div className="sj-card" style={{ ...CARD, marginTop: 24, padding: "22px 24px" }}>
              <h2 style={{ margin: 0, font: "600 20px var(--font-fredoka)" }}>Welcome to {schoolName} on Storyjar</h2>
              <p style={{ margin: "10px 0 0", font: "400 16px/1.6 var(--font-atkinson)", color: "#43506B" }}>
                You have {staff.length} staff across {classes.length} {classes.length === 1 ? "class" : "classes"} and {childrenCount} pupils. Use <strong>Staff</strong> to invite colleagues and set roles, <strong>Classes</strong> to set classes up and hand them over, and <strong>Billing</strong> for the plan.
              </p>
            </div>
            <ThingsToDo
              invited={invited}
              classes={classes}
              staff={staff}
              billing={billing}
              onGoTo={(t) => { setTab(t); closeMenus(); }}
            />
          </>
        )}

        {tab === "classes" && (
          <>
          <p style={{ margin: "18px 0 0", font: "400 15px/1.6 var(--font-atkinson)", color: "var(--sj-muted)", maxWidth: 720 }}>
            Every class in the school, and who teaches it. You can set a class up for a colleague from a pasted
            register — that saves them the typing, and it does not give you access to the children&rsquo;s work.
            Only the teacher who teaches a class ever sees what is in its jar.
          </p>
          {importing && (
            <div style={{ marginTop: 18 }}>
              <ImportClassForm
                staff={staff.map((s) => ({ id: s.id, name: s.isYou ? `${s.name} (you)` : s.name }))}
                defaultOwnerId={meId}
                onDone={() => setImporting(false)}
              />
            </div>
          )}
          <div style={{ ...CARD, marginTop: 20, padding: 0, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr", gap: 12, padding: "14px 22px", borderBottom: "2px solid #F0EADD", font: "700 12px var(--font-atkinson)", color: "var(--sj-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              <span>Class</span><span>Teacher</span><span>Pupils</span>
            </div>
            {classes.length === 0 && (
              <p style={{ padding: "18px 22px", margin: 0, color: "var(--sj-muted)" }}>
                No classes yet. <strong>＋ Paste a class list</strong> sets the first one up in one step.
              </p>
            )}
            {classes.map((c) => (
              <div key={c.id} style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr", gap: 12, alignItems: "center", padding: "14px 22px", borderBottom: "1px solid #F5F0E6" }}>
                <span style={{ font: "700 16px var(--font-atkinson)" }}>
                  {c.name}
                  {/* Inherited because somebody was removed. Said in words on
                      the row rather than as a colour or a dot, so it survives
                      forced-colours mode and reads the same to a screen reader
                      (handbook: convey no status by colour alone). It is here
                      to be acted on — the admin holding it is not this class's
                      teacher, and the next thing they should do is hand it to
                      whoever is. */}
                  {c.inherited && (
                    <span
                      style={{
                        display: "block",
                        font: "400 12px/1.45 var(--font-atkinson)",
                        color: "#8A5A00",
                        marginTop: 2,
                      }}
                    >
                      Came to you when a colleague was removed — hand it on to whoever teaches it
                      now.
                    </span>
                  )}
                </span>
                {/* Handing a class over is the single most common thing an admin
                    needs in September, and it used to be buried three levels deep
                    in a staff row's ⋯ menu. It IS the access control (whoever
                    holds the class is the only one who sees its children's work),
                    so it belongs on the class, in the open, and it is audited. */}
                <ClassTeacherPicker klass={c} staff={staff} />
                <span style={{ font: "700 15px var(--font-atkinson)" }}>{c.children === 0 ? <span style={{ color: "var(--sj-muted)", fontWeight: 400 }}>none yet</span> : c.children}</span>
              </div>
            ))}
          </div>
          </>
        )}

        {tab === "guide" && <Guide onGoTo={(t) => { setTab(t); closeMenus(); }} />}

        {tab === "promises" && <Promises />}

        {tab === "audit" && (
          <div style={{ marginTop: 24 }}>
            <p style={{ margin: "0 0 14px", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
              A record of safeguarding-relevant actions across the school — approvals, moments sent back or deleted,
              and every staff, class and plan change. You can always see who did what and when. Where an entry is
              about a particular child in a class you don&rsquo;t teach, the child is not named: being an admin
              doesn&rsquo;t make you all-seeing.
            </p>
            {audit.length === 0 ? (
              <div className="sj-card" style={{ ...CARD, padding: "28px 24px", textAlign: "center", color: "var(--sj-muted)" }}>Nothing recorded yet.</div>
            ) : (
              <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr 2.2fr", gap: 12, padding: "12px 20px", borderBottom: "2px solid #F0EADD", font: "700 12px var(--font-atkinson)", color: "var(--sj-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  <span>When</span><span>Who &amp; what</span><span>Detail</span>
                </div>
                {audit.map((e) => (
                  <div key={e.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr 2.2fr", gap: 12, alignItems: "baseline", padding: "12px 20px", borderBottom: "1px solid #F5F0E6" }}>
                    <span style={{ font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>{new Date(e.atISO).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    <span style={{ font: "400 14px var(--font-atkinson)" }}><strong>{e.actorName}</strong> · {ACTION_LABEL[e.action] ?? e.action}</span>
                    <span style={{ font: "400 14px var(--font-atkinson)", color: e.redacted ? "var(--sj-muted)" : "#43506B" }}>
                      {e.redacted ? "About a child in a class you don’t teach" : e.detail ?? "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "billing" && (
          <div onClick={(e) => e.stopPropagation()}>
            <BillingPane {...billing} invoiceRequested={false} />
          </div>
        )}
      </main>
    </div>
  );
}

// A class's teacher, changeable in place. Submits the same admin-guarded,
// audited action as the staff-row menu — this is only a shorter road to it.
//
// The change is confirmed with a button rather than fired on `change`: a native
// select fires change on every arrow key, so an auto-submitting picker would
// hand the class to each teacher in turn as a keyboard user moved through the
// list. Reassignment IS the access control (SAFEGUARDING rule 4), so it takes a
// deliberate press.
function ClassTeacherPicker({ klass, staff }: { klass: SchoolClass; staff: StaffRow[] }) {
  const [choice, setChoice] = useState(klass.teacherId);
  const changed = choice !== klass.teacherId;
  const target = staff.find((t) => t.id === choice);

  return (
    <form action={assignClassToStaff} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
      <input type="hidden" name="classId" value={klass.id} />
      <select
        name="staffId"
        aria-label={`Teacher for ${klass.name}`}
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        style={{ font: "400 15px var(--font-atkinson)", color: "#43506B", background: "#FFFDF7", border: `2px solid ${changed ? "#22304A" : "#E4DCC8"}`, borderRadius: 8, padding: "7px 9px", minHeight: 44, maxWidth: "100%" }}
      >
        {staff.map((t) => (
          <option key={t.id} value={t.id}>{t.name}{t.status === "INVITED" ? " (invited)" : ""}</option>
        ))}
      </select>
      {changed && (
        <button
          type="submit"
          style={{ font: "700 13px var(--font-atkinson)", color: "#FAF6EE", background: "#C2476B", border: "none", borderRadius: 999, padding: "9px 14px", minHeight: 44, cursor: "pointer", whiteSpace: "nowrap" }}
        >
          Hand to {target?.name.split(/\s+/)[0] ?? "them"}
        </button>
      )}
    </form>
  );
}

// The Overview's "what needs you" list. Only ever counts and adult-facing state —
// never anything about a child (SAFEGUARDING rule 5).
function ThingsToDo({
  invited,
  classes,
  staff,
  billing,
  onGoTo,
}: {
  invited: number;
  classes: SchoolClass[];
  staff: StaffRow[];
  billing: { status: string; kind: string | null; trialDaysLeft: number | null };
  onGoTo: (t: Tab) => void;
}) {
  const emptyClasses = classes.filter((c) => c.children === 0);
  const teachersWithoutClass = staff.filter((p) => p.role !== "ADMIN" && p.classes.length === 0);

  const jobs: { key: string; text: React.ReactNode; tab: Tab; urgent?: boolean }[] = [];

  if (billing.status === "FROZEN") {
    jobs.push({ key: "frozen", urgent: true, tab: "billing", text: <>The plan has paused, so staff can view and download but cannot add or change work. Renewing puts it back straight away.</> });
  } else if (billing.status === "PAST_DUE") {
    jobs.push({ key: "pastdue", urgent: true, tab: "billing", text: <>A payment didn&rsquo;t go through and is being retried. Access is unaffected for now.</> });
  } else if (billing.status === "TRIAL" && billing.trialDaysLeft !== null && billing.trialDaysLeft <= 21) {
    jobs.push({ key: "trial", urgent: billing.trialDaysLeft <= 7, tab: "billing", text: <>{billing.trialDaysLeft} {billing.trialDaysLeft === 1 ? "day" : "days"} left to try Storyjar. Card or purchase order — both take a minute.</> });
  } else if (billing.status === "NONE") {
    jobs.push({ key: "noplan", tab: "billing", text: <>No school plan is set up yet. The Billing tab shows the price for a school your size and both ways of paying.</> });
  }

  if (classes.length === 0) {
    jobs.push({ key: "noclasses", tab: "classes", text: <>No classes yet. Paste a register and the first one is ready in a minute.</> });
  }
  if (invited > 0) {
    jobs.push({ key: "invites", tab: "staff", text: <>{invited} {invited === 1 ? "colleague has not" : "colleagues have not"} accepted their invite yet. You can resend it from their row.</> });
  }
  if (emptyClasses.length > 0) {
    jobs.push({ key: "empty", tab: "classes", text: <>{emptyClasses.length} {emptyClasses.length === 1 ? "class has" : "classes have"} no children in yet — a pasted register fills one in one go.</> });
  }
  if (teachersWithoutClass.length > 0) {
    jobs.push({ key: "noclass", tab: "classes", text: <>{teachersWithoutClass.length} {teachersWithoutClass.length === 1 ? "member of staff has" : "members of staff have"} no class. A teacher with no class has nothing to open.</> });
  }

  return (
    <div className="sj-card" style={{ ...CARD, marginTop: 18, padding: "22px 24px" }}>
      <h2 style={{ margin: 0, font: "600 20px var(--font-fredoka)" }}>What needs you</h2>
      {jobs.length === 0 ? (
        <p style={{ margin: "10px 0 0", font: "400 16px var(--font-atkinson)", color: "#2E6B64" }}>
          Nothing right now — staff are set up, classes have children in them and the plan is in order.
        </p>
      ) : (
        <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
          {jobs.map((j) => (
            <li key={j.key} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span aria-hidden style={{ marginTop: 6, width: 9, height: 9, borderRadius: "50%", background: j.urgent ? "#C2476B" : "#F0B441", flexShrink: 0 }} />
              <span style={{ font: "400 15px/1.55 var(--font-atkinson)", color: "#43506B" }}>
                {j.text}{" "}
                <button
                  onClick={(e) => { e.stopPropagation(); onGoTo(j.tab); }}
                  style={{ font: "700 15px var(--font-atkinson)", color: "#C2476B", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                >
                  {TABS.find((t) => t.id === j.tab)?.label ?? "Open"} →
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StaffTable({
  staff,
  classes,
  menuId,
  submenu,
  onToggleMenu,
  onSubmenu,
}: {
  staff: StaffRow[];
  classes: SchoolClass[];
  menuId: string | null;
  submenu: "role" | "classes" | null;
  onToggleMenu: (id: string) => void;
  onSubmenu: (s: "role" | "classes" | null) => void;
}) {
  const cols = "2.2fr 1.4fr 1.6fr 1fr 44px";
  return (
    <div style={{ marginTop: 30, background: "#FFFDF7", border: "2px solid #E4DCC8", borderRadius: 16, overflow: "visible" }}>
      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 12, padding: "14px 22px", borderBottom: "2px solid #F0EADD", font: "700 12px var(--font-atkinson)", color: "var(--sj-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
        <span>Name</span><span>Role</span><span>Classes</span><span>Status</span><span />
      </div>
      {staff.map((p) => {
        const rs = roleStyle(p.role);
        const open = menuId === p.id;
        const invited = p.status === "INVITED";
        return (
          <div key={p.id} style={{ position: "relative", zIndex: open ? 20 : 1, display: "grid", gridTemplateColumns: cols, gap: 12, alignItems: "center", padding: "14px 22px", borderBottom: "1px solid #F5F0E6" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <span style={{ width: 40, height: 40, borderRadius: "50%", background: avatarColor(p.id), display: "flex", alignItems: "center", justifyContent: "center", font: "600 16px var(--font-fredoka)", color: "#FFFDF7", flexShrink: 0 }}>{initials(p.name)}</span>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, font: "700 16px var(--font-atkinson)" }}>{p.name}{p.isYou && <span style={{ color: "var(--sj-muted)", fontWeight: 400 }}> · you</span>}</p>
                <p style={{ margin: "1px 0 0", font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.email}</p>
              </div>
            </div>
            {/* data-staff-role marks THIS as the row's role, so a test can ask
                "how many staff are teaching assistants" rather than "how many
                times do those words appear on the page" — the latter also counts
                the role picker, the invite form and the explanatory copy beside
                them. Inert; see tests/e2e/admin.spec.ts. */}
            <span data-staff-role={p.role} style={{ font: "700 13px var(--font-atkinson)", color: rs.color, background: rs.bg, border: `1px solid ${rs.border}`, borderRadius: 999, padding: "5px 12px", justifySelf: "start", whiteSpace: "nowrap" }}>{rs.label}</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {p.classes.length === 0 ? (
                <span style={{ font: "400 13px var(--font-atkinson)", color: "#B0B7C6" }}>—</span>
              ) : (
                p.classes.map((c) => (
                  <span key={c} style={{ font: "700 12px var(--font-atkinson)", color: "#43506B", background: "#F3E3C3", borderRadius: 999, padding: "4px 10px", whiteSpace: "nowrap" }}>{c}</span>
                ))
              )}
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "700 13px var(--font-atkinson)", color: invited ? "#B07A1E" : "#2E6B64", whiteSpace: "nowrap" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: invited ? "#F0B441" : "#37796f" }} />
              {invited ? "Invited" : "Active"}
            </span>

            <div style={{ position: "relative", justifySelf: "end" }}>
              <button
                onClick={(e) => { e.stopPropagation(); onToggleMenu(p.id); }}
                aria-label={`Actions for ${p.name}`}
                aria-expanded={open}
                style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: open ? "#F3E3C3" : "#F3EEE2", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}
              >
                {[0, 1, 2].map((i) => <span key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: "#43506B" }} />)}
              </button>
              {open && (
                <div role="menu" onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: 40, right: 0, width: 214, background: "#FFFDF7", border: "2px solid #22304A", borderRadius: 12, padding: 6, boxShadow: "0 12px 30px rgba(34,48,74,0.28)", zIndex: 40 }}>
                  {submenu === "role" ? (
                    <RoleSubmenu staff={p} onBack={() => onSubmenu(null)} />
                  ) : submenu === "classes" ? (
                    <ClassesSubmenu staff={p} classes={classes} onBack={() => onSubmenu(null)} />
                  ) : (
                    <>
                      <MenuButton icon="edit" label="Edit role" onClick={() => onSubmenu("role")} />
                      <MenuButton icon="class" label="Assign classes" onClick={() => onSubmenu("classes")} />
                      {invited && <MenuForm action={resendInvite} staffId={p.id} icon="share" label="Resend invite" />}
                      {!p.isYou && <RemoveStaffItem staff={p} />}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const MENU_ITEM: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  textAlign: "left",
  cursor: "pointer",
  font: "700 15px var(--font-atkinson)",
  background: "none",
  border: "none",
  borderRadius: 8,
  padding: "9px 12px",
  color: "#22304A",
};

function MenuButton({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button role="menuitem" onClick={onClick} style={MENU_ITEM}>
      <Icon name={icon} size={18} decorative />
      {label}
    </button>
  );
}

// Removing somebody says what it will do BEFORE it does it.
//
// There was no confirmation of any kind (FINDINGS F59), and removal is not an
// "undo" job: it ends a colleague's access and, as of the same change, moves
// their classes and their pupils' work to whoever pressed the button and
// reissues every one of those class codes.
//
// ONE PRESS TO CONFIRM, NOT A WIZARD, and that distinction is the whole design.
// The scenario this exists for is a SUSPENSION, where a head teacher must be
// able to revoke access immediately — so nothing here asks them to choose a
// recipient, pick classes, or type a reason. It tells them what is about to
// happen and takes one more press. A mandatory picker at this moment would be
// friction on the one path that must never have any.
function RemoveStaffItem({ staff }: { staff: StaffRow }) {
  const [confirming, setConfirming] = useState(false);
  const count = staff.classes.length;

  if (!confirming) {
    return (
      <button
        role="menuitem"
        type="button"
        onClick={() => setConfirming(true)}
        style={{ ...MENU_ITEM, color: "#C2476B" }}
      >
        <Icon name="delete" size={18} decorative />
        Remove from school
      </button>
    );
  }

  return (
    <div style={{ padding: "8px 12px" }}>
      <p style={{ margin: "0 0 8px", font: "400 12px/1.45 var(--font-atkinson)", color: "#43506B" }}>
        {count > 0 ? (
          <>
            <strong>{staff.name}</strong> loses access to StoryJar. Their {count}{" "}
            {count === 1 ? "class" : "classes"} ({staff.classes.join(", ")}) and the children&rsquo;s
            work in {count === 1 ? "it" : "them"} move to <strong>you</strong>, and{" "}
            {count === 1 ? "its class code is" : "their class codes are"} reissued — so the children
            will need telling the new {count === 1 ? "code" : "codes"}.
          </>
        ) : (
          <>
            <strong>{staff.name}</strong> loses access to StoryJar. They hold no classes.
          </>
        )}
      </p>
      <form action={removeStaff}>
        <input type="hidden" name="staffId" value={staff.id} />
        <button
          role="menuitem"
          type="submit"
          style={{ ...MENU_ITEM, color: "#C2476B", font: "700 13px var(--font-atkinson)" }}
        >
          <Icon name="delete" size={18} decorative />
          Yes, remove {staff.name}
        </button>
      </form>
      <button
        role="menuitem"
        type="button"
        onClick={() => setConfirming(false)}
        style={{ ...MENU_ITEM, color: "#43506B" }}
      >
        Cancel
      </button>
    </div>
  );
}

function MenuForm({ action, staffId, icon, label, danger }: { action: (fd: FormData) => void; staffId: string; icon: IconName; label: string; danger?: boolean }) {
  return (
    <form action={action}>
      <input type="hidden" name="staffId" value={staffId} />
      <button role="menuitem" type="submit" style={{ ...MENU_ITEM, color: danger ? "#C2476B" : "#22304A" }}>
        <Icon name={icon} size={18} decorative />
        {label}
      </button>
    </form>
  );
}

function RoleSubmenu({ staff, onBack }: { staff: StaffRow; onBack: () => void }) {
  return (
    <>
      <button onClick={onBack} style={{ ...MENU_ITEM, color: "#43506B", font: "700 13px var(--font-atkinson)" }}>← Edit role</button>
      <div style={{ height: 1, background: "#F0EADD", margin: "4px 0" }} />
      {/* Said here because this is where somebody believes they are limiting a
          colleague. Only ADMIN changes what StoryJar permits; the other two are
          the school's own record of who somebody is. What decides what they can
          see is Assign classes, one menu across. See F47. */}
      <p style={{ margin: 0, padding: "6px 12px 8px", font: "400 12px/1.45 var(--font-atkinson)", color: "var(--sj-muted)" }}>
        Only <strong>Admin</strong> changes what someone can do — it opens this console. What a
        teacher or a teaching assistant can see comes from the classes they hold.
      </p>
      {(["ADMIN", "TEACHER", "TA"] as const).map((r) => (
        <form key={r} action={setStaffRole}>
          <input type="hidden" name="staffId" value={staff.id} />
          <input type="hidden" name="role" value={r} />
          <button role="menuitem" type="submit" disabled={staff.role === r} style={{ ...MENU_ITEM, opacity: staff.role === r ? 0.5 : 1 }}>
            <span style={{ width: 18, textAlign: "center" }} aria-hidden>{roleStyle(r).label === "Admin" ? "★" : "•"}</span>
            {roleStyle(r).label}
          </button>
        </form>
      ))}
    </>
  );
}

function ClassesSubmenu({ staff, classes, onBack }: { staff: StaffRow; classes: SchoolClass[]; onBack: () => void }) {
  return (
    <>
      <button onClick={onBack} style={{ ...MENU_ITEM, color: "#43506B", font: "700 13px var(--font-atkinson)" }}>← Assign classes</button>
      <div style={{ height: 1, background: "#F0EADD", margin: "4px 0" }} />
      {classes.length === 0 && <p style={{ margin: 0, padding: "9px 12px", font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>No classes yet.</p>}
      {classes.map((c) => {
        const mine = c.teacherId === staff.id;
        return (
          <form key={c.id} action={assignClassToStaff}>
            <input type="hidden" name="staffId" value={staff.id} />
            <input type="hidden" name="classId" value={c.id} />
            <button role="menuitem" type="submit" disabled={mine} style={{ ...MENU_ITEM, opacity: mine ? 0.55 : 1 }}>
              <span style={{ width: 18, textAlign: "center" }} aria-hidden>{mine ? "✓" : "＋"}</span>
              {c.name}
            </button>
          </form>
        );
      })}
    </>
  );
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(inviteStaff, {});
  const ref = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      ref.current?.reset();
      onDone();
    }
    wasPending.current = pending;
  }, [pending, state, onDone]);

  return (
    <form ref={ref} action={action} onClick={(e) => e.stopPropagation()} style={{ ...CARD, marginTop: 22, display: "grid", gridTemplateColumns: "1.4fr 1.6fr auto auto", gap: 12, alignItems: "end" }}>
      <div>
        <label htmlFor="inv-name" style={{ display: "block", font: "700 13px var(--font-atkinson)", marginBottom: 5 }}>Name</label>
        <input id="inv-name" name="name" placeholder="e.g. Miss Malik" required style={INPUT} />
      </div>
      <div>
        <label htmlFor="inv-email" style={{ display: "block", font: "700 13px var(--font-atkinson)", marginBottom: 5 }}>School email</label>
        <input id="inv-email" name="email" type="email" placeholder="name@school.sch.uk" required style={INPUT} />
      </div>
      <div>
        <label htmlFor="inv-role" style={{ display: "block", font: "700 13px var(--font-atkinson)", marginBottom: 5 }}>Role</label>
        <select id="inv-role" name="role" defaultValue="TEACHER" aria-describedby="inv-role-hint" style={{ ...INPUT, width: "auto" }}>
          <option value="TEACHER">Teacher</option>
          <option value="TA">Teaching assistant</option>
          <option value="ADMIN">Admin</option>
        </select>
        <p id="inv-role-hint" style={{ margin: "5px 0 0", maxWidth: 220, font: "400 12px/1.45 var(--font-atkinson)", color: "var(--sj-muted)" }}>
          Admin opens this console. Teacher and teaching assistant can do the same things &mdash; give
          them a class to decide what they see.
        </p>
      </div>
      <button type="submit" disabled={pending} style={{ ...JAM_BTN, opacity: pending ? 0.7 : 1 }}>{pending ? "Inviting…" : "Send invite"}</button>
      {state.error && <p role="alert" style={{ gridColumn: "1 / -1", margin: 0, font: "700 14px var(--font-atkinson)", color: "#C2476B" }}>{state.error}</p>}
    </form>
  );
}

function JarMark() {
  return (
    <svg width="22" height="27" viewBox="0 0 100 120" aria-hidden>
      <rect x="26" y="4" width="48" height="14" rx="7" fill="#C9A87C" />
      <path d="M30,20 L70,20 L70,30 C82,36 86,46 86,58 L86,98 Q86,114 70,114 L30,114 Q14,114 14,98 L14,58 C14,46 18,36 30,30 Z" fill="#D8ECE8" stroke="#FAF6EE" strokeWidth="5" strokeLinejoin="round" />
      <rect x="30" y="76" width="16" height="16" rx="3" fill="#C2476B" transform="rotate(-8 38 84)" />
      <rect x="52" y="82" width="16" height="16" rx="3" fill="#F0B441" transform="rotate(6 60 90)" />
    </svg>
  );
}
