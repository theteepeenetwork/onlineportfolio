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

export type StaffRow = {
  id: string;
  name: string;
  email: string;
  role: string; // ADMIN | TEACHER | TA
  status: string; // ACTIVE | INVITED
  isYou: boolean;
  classes: string[];
};

export type SchoolClass = { id: string; name: string; teacherId: string; teacherName: string; children: number };

export type AuditEntry = { id: string; atISO: string; actorName: string; action: string; detail: string | null };

type Tab = "overview" | "staff" | "classes" | "safeguarding" | "billing" | "audit";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "staff", label: "Staff" },
  { id: "classes", label: "Classes" },
  { id: "safeguarding", label: "Safeguarding" },
  { id: "audit", label: "Audit log" },
  { id: "billing", label: "Billing" },
];

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
};

const AVATAR_PALETTE = ["#E08A9B", "#8AB9D6", "#A6C979", "#F0B441", "#B99CD6", "#4E9C94", "#E8A06A", "#C2476B"];
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
const CARD: React.CSSProperties = { background: "#FFFDF7", border: "2px solid #E4DCC8", borderRadius: 14, padding: "16px 18px" };
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

export function AdminConsole({
  schoolName,
  plan,
  seatLimit,
  meId,
  staff,
  classes,
  childrenCount,
  audit,
}: {
  schoolName: string;
  plan: string;
  seatLimit: number;
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

  const invited = staff.filter((s) => s.status === "INVITED").length;
  const closeMenus = () => { setMenuId(null); setSubmenu(null); };

  const stats = [
    { value: `${staff.length}`, label: "Staff", sub: invited > 0 ? `${invited} invite${invited === 1 ? "" : "s"} pending` : "all active", color: "#22304A" },
    { value: `${classes.length}`, label: "Classes", sub: "across the school", color: "#4E9C94" },
    { value: `${childrenCount}`, label: "Children", sub: "no child logins", color: "#C2476B" },
    { value: `${staff.length} / ${seatLimit}`, label: "Seats used", sub: plan.toLowerCase(), color: "#B07A1E" },
  ];

  return (
    <div className="sj" onClick={closeMenus} style={{ minHeight: "100vh", background: "#FAF6EE", fontFamily: "var(--font-atkinson)", color: "#22304A" }}>
      {/* ink top bar — signals the whole-school space */}
      <header style={{ display: "flex", alignItems: "center", gap: 22, padding: "14px 32px", background: "#22304A", position: "sticky", top: 0, zIndex: 30, flexWrap: "wrap" }}>
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
                style={{ font: "700 15px var(--font-atkinson)", color: active ? "#22304A" : "#C4CDDD", background: active ? "#FAF6EE" : "transparent", border: "none", borderRadius: 999, padding: "7px 16px", whiteSpace: "nowrap", cursor: "pointer" }}
              >
                {t.label}
              </button>
            );
          })}
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/teacher" style={{ font: "700 14px var(--font-atkinson)", color: "#C4CDDD", textDecoration: "none", whiteSpace: "nowrap" }}>My teaching →</Link>
          <span style={{ width: 38, height: 38, borderRadius: "50%", background: avatarColor(meId), display: "flex", alignItems: "center", justifyContent: "center", font: "600 16px var(--font-fredoka)", color: "#FFFDF7" }}>
            {initials(staff.find((s) => s.id === meId)?.name ?? "?")}
          </span>
        </div>
      </header>

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 32px 60px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: 0, font: "700 14px var(--font-atkinson)", color: "#6B7690" }}>{schoolName}</p>
            <h1 style={{ margin: "4px 0 0", font: "600 32px var(--font-fredoka)" }}>
              {tab === "staff" ? "Staff & whole-school" : tab === "overview" ? "School overview" : tab === "classes" ? "Classes" : tab === "safeguarding" ? "Safeguarding" : tab === "audit" ? "Audit log" : "Billing & seats"}
            </h1>
          </div>
          {tab === "staff" && (
            <button onClick={(e) => { e.stopPropagation(); setInviting((v) => !v); }} style={{ ...JAM_BTN, marginLeft: "auto" }} aria-expanded={inviting}>＋ Invite staff</button>
          )}
        </div>

        {/* stats strip (Staff + Overview) */}
        {(tab === "staff" || tab === "overview") && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginTop: 22 }}>
            {stats.map((st) => (
              <div key={st.label} style={CARD}>
                <p style={{ margin: 0, font: "600 30px var(--font-fredoka)", color: st.color }}>{st.value}</p>
                <p style={{ margin: "2px 0 0", font: "700 14px var(--font-atkinson)", color: "#43506B" }}>{st.label}</p>
                <p style={{ margin: "2px 0 0", font: "400 13px var(--font-atkinson)", color: "#8A93A8" }}>{st.sub}</p>
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
            <p style={{ margin: "14px 2px 0", font: "400 14px var(--font-atkinson)", color: "#8A93A8" }}>
              Each teacher manages their own classes and approval queue. Admins can invite staff, assign classes and manage the school subscription — but never see children&apos;s work unless they teach the class.
            </p>
          </>
        )}

        {tab === "overview" && (
          <div className="sj-card" style={{ ...CARD, marginTop: 24, padding: "22px 24px" }}>
            <h2 style={{ margin: 0, font: "600 20px var(--font-fredoka)" }}>Welcome to {schoolName} on Storyjar</h2>
            <p style={{ margin: "10px 0 0", font: "400 16px/1.6 var(--font-atkinson)", color: "#43506B" }}>
              You have {staff.length} staff across {classes.length} classes and {childrenCount} children. Use <strong>Staff</strong> to invite colleagues and set roles, <strong>Classes</strong> to see who teaches what, and <strong>Billing</strong> for your seats.
            </p>
          </div>
        )}

        {tab === "classes" && (
          <div style={{ ...CARD, marginTop: 24, padding: 0, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr", gap: 12, padding: "14px 22px", borderBottom: "2px solid #F0EADD", font: "700 12px var(--font-atkinson)", color: "#8A93A8", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              <span>Class</span><span>Teacher</span><span>Children</span>
            </div>
            {classes.length === 0 && <p style={{ padding: "18px 22px", margin: 0, color: "#8A93A8" }}>No classes yet.</p>}
            {classes.map((c) => (
              <div key={c.id} style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr", gap: 12, alignItems: "center", padding: "14px 22px", borderBottom: "1px solid #F5F0E6" }}>
                <span style={{ font: "700 16px var(--font-atkinson)" }}>{c.name}</span>
                <span style={{ font: "400 15px var(--font-atkinson)", color: "#43506B" }}>{c.teacherName}</span>
                <span style={{ font: "700 15px var(--font-atkinson)" }}>{c.children}</span>
              </div>
            ))}
          </div>
        )}

        {tab === "safeguarding" && (
          <div className="sj-card" style={{ ...CARD, marginTop: 24, padding: "22px 24px" }}>
            <h2 style={{ margin: 0, font: "600 20px var(--font-fredoka)" }}>Who can see what</h2>
            <ul style={{ margin: "12px 0 0", paddingLeft: 20, font: "400 16px/1.7 var(--font-atkinson)", color: "#43506B" }}>
              <li>Children never have logins, emails or passwords — they sign in with a class code and their name.</li>
              <li>Every moment waits in the teacher&apos;s approval queue before it joins a child&apos;s jar.</li>
              <li>Admins manage staff, class assignment and billing, but <strong>never see children&apos;s work unless they teach the class</strong>.</li>
            </ul>
          </div>
        )}

        {tab === "audit" && (
          <div style={{ marginTop: 24 }}>
            <p style={{ margin: "0 0 14px", font: "400 15px var(--font-atkinson)", color: "#8A93A8" }}>A record of safeguarding-relevant actions across the school — approvals, moments sent back or deleted, and staff/role changes.</p>
            {audit.length === 0 ? (
              <div className="sj-card" style={{ ...CARD, padding: "28px 24px", textAlign: "center", color: "#8A93A8" }}>Nothing recorded yet.</div>
            ) : (
              <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr 2.2fr", gap: 12, padding: "12px 20px", borderBottom: "2px solid #F0EADD", font: "700 12px var(--font-atkinson)", color: "#8A93A8", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  <span>When</span><span>Who &amp; what</span><span>Detail</span>
                </div>
                {audit.map((e) => (
                  <div key={e.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr 2.2fr", gap: 12, alignItems: "baseline", padding: "12px 20px", borderBottom: "1px solid #F5F0E6" }}>
                    <span style={{ font: "400 13px var(--font-atkinson)", color: "#8A93A8" }}>{new Date(e.atISO).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    <span style={{ font: "400 14px var(--font-atkinson)" }}><strong>{e.actorName}</strong> · {ACTION_LABEL[e.action] ?? e.action}</span>
                    <span style={{ font: "400 14px var(--font-atkinson)", color: "#43506B" }}>{e.detail ?? "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "billing" && (
          <div className="sj-card" style={{ ...CARD, marginTop: 24, padding: "22px 24px" }}>
            <h2 style={{ margin: 0, font: "600 20px var(--font-fredoka)" }}>Seats &amp; plan</h2>
            <p style={{ margin: "10px 0 0", font: "600 40px var(--font-fredoka)" }}>{staff.length} <span style={{ font: "400 18px var(--font-atkinson)", color: "#8A93A8" }}>of {seatLimit} seats used</span></p>
            <p style={{ margin: "4px 0 0", font: "400 15px var(--font-atkinson)", color: "#43506B" }}>{plan}{invited > 0 ? ` · ${invited} invited and not yet active` : ""}.</p>
          </div>
        )}
      </main>
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
      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 12, padding: "14px 22px", borderBottom: "2px solid #F0EADD", font: "700 12px var(--font-atkinson)", color: "#8A93A8", letterSpacing: "0.06em", textTransform: "uppercase" }}>
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
                <p style={{ margin: 0, font: "700 16px var(--font-atkinson)" }}>{p.name}{p.isYou && <span style={{ color: "#8A93A8", fontWeight: 400 }}> · you</span>}</p>
                <p style={{ margin: "1px 0 0", font: "400 13px var(--font-atkinson)", color: "#8A93A8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.email}</p>
              </div>
            </div>
            <span style={{ font: "700 13px var(--font-atkinson)", color: rs.color, background: rs.bg, border: `1px solid ${rs.border}`, borderRadius: 999, padding: "5px 12px", justifySelf: "start", whiteSpace: "nowrap" }}>{rs.label}</span>
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
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: invited ? "#F0B441" : "#4E9C94" }} />
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
                      <MenuButton icon="✎" label="Edit role" onClick={() => onSubmenu("role")} />
                      <MenuButton icon="🏫" label="Assign classes" onClick={() => onSubmenu("classes")} />
                      {invited && <MenuForm action={resendInvite} staffId={p.id} icon="✉" label="Resend invite" />}
                      {!p.isYou && <MenuForm action={removeStaff} staffId={p.id} icon="🗑" label="Remove from school" danger />}
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

function MenuButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button role="menuitem" onClick={onClick} style={MENU_ITEM}>
      <span style={{ width: 18, textAlign: "center" }} aria-hidden>{icon}</span>
      {label}
    </button>
  );
}

function MenuForm({ action, staffId, icon, label, danger }: { action: (fd: FormData) => void; staffId: string; icon: string; label: string; danger?: boolean }) {
  return (
    <form action={action}>
      <input type="hidden" name="staffId" value={staffId} />
      <button role="menuitem" type="submit" style={{ ...MENU_ITEM, color: danger ? "#C2476B" : "#22304A" }}>
        <span style={{ width: 18, textAlign: "center" }} aria-hidden>{icon}</span>
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
      {classes.length === 0 && <p style={{ margin: 0, padding: "9px 12px", font: "400 13px var(--font-atkinson)", color: "#8A93A8" }}>No classes yet.</p>}
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
        <select id="inv-role" name="role" defaultValue="TEACHER" style={{ ...INPUT, width: "auto" }}>
          <option value="TEACHER">Teacher</option>
          <option value="TA">Teaching assistant</option>
          <option value="ADMIN">Admin</option>
        </select>
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
