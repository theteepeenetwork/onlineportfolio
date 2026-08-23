"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/components/icons/Icon";
import { teacherSearchIndex, type TeacherSearchItem } from "@/app/actions/teacherSearch";
import { LogoutForm } from "@/components/LogoutForm";

// ── the shell's data ────────────────────────────────────────────────────────

export type ShellClass = {
  id: string;
  name: string;
  /** The class's tint accent, used for the 10px dot in the rail. */
  dot: string;
  /** Moments from this class waiting in the approval queue. */
  waiting: number;
};

// ── live queue count ────────────────────────────────────────────────────────
//
// The rail badge has to fall as the teacher clears the queue, on the same
// screen, without a round trip. The queue board owns that moment, so it tells
// the shell; the shell owns the number, because it outlives the page.

type ShellApi = { clearPending: (classIds: string[]) => void };
const ShellContext = createContext<ShellApi>({ clearPending: () => {} });

/** Call `clearPending([classId, …])` when items leave the queue (approved or
 *  sent back) so the rail badge and the per-class counts drop with them. */
export function useTeacherShell() {
  return useContext(ShellContext);
}

// ── styling constants lifted straight from the handoff ──────────────────────

const INK = "var(--ink)";
const CREAM = "var(--paper)"; // #faf6ee — the rail and page background
const BORDER = "var(--calm-border)"; // #e4dcc8
const BAR_H = 57; // identity-bar height; the rail sticks below it
const RAIL_W = 236;
const RAIL_W_COLLAPSED = 74;
const STORAGE_KEY = "sj-rail-collapsed";

const SECTIONS: { href: string; label: string; icon: IconName; exact?: boolean }[] = [
  { href: "/teacher/queue", label: "Queue", icon: "waiting" },
  { href: "/teacher", label: "Journals", icon: "jar", exact: true },
  { href: "/teacher/activities", label: "Activities", icon: "draw" },
  { href: "/teacher/calendar", label: "Calendar", icon: "calendar" },
  { href: "/teacher/account", label: "Account", icon: "settings" },
];

// "School admin →" and "Sign out" on the identity bar. They read as text links
// and are styled as text links, but they are the two controls a teacher reaches
// for at the end of a lesson, so they carry a 44px box of their own rather than
// only the height of their letters (they measured 17px tall — WCAG 2.2 AA 2.5.8
// wants 24, and a finger on a classroom iPad wants 44).
const idBarLink: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 44,
  font: "600 14px var(--font-atkinson)",
  color: "#d8ece8",
  textDecoration: "none",
  background: "none",
  border: "none",
  borderRadius: 10,
  padding: "0 8px",
  cursor: "pointer",
};

export function TeacherShell({
  teacher,
  schoolName,
  isAdmin,
  classes,
  pending,
  banner,
  children,
}: {
  teacher: { name: string; initials: string };
  schoolName: string | null;
  isAdmin: boolean;
  classes: ShellClass[];
  pending: number;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();

  // ── live counts ───────────────────────────────────────────────────────────
  // Seeded from the server on every navigation, then adjusted locally while the
  // teacher works through the queue without leaving the page.
  const serverSig = `${pending}|${classes.map((c) => `${c.id}:${c.waiting}`).join(",")}`;
  const [counts, setCounts] = useState(() => ({
    total: pending,
    byClass: Object.fromEntries(classes.map((c) => [c.id, c.waiting])) as Record<string, number>,
  }));
  const lastSig = useRef(serverSig);
  useEffect(() => {
    if (lastSig.current === serverSig) return;
    lastSig.current = serverSig;
    setCounts({
      total: pending,
      byClass: Object.fromEntries(classes.map((c) => [c.id, c.waiting])),
    });
  }, [serverSig, pending, classes]);

  const clearPending = useCallback((classIds: string[]) => {
    setCounts((prev) => {
      const byClass = { ...prev.byClass };
      for (const id of classIds) {
        if (byClass[id] != null) byClass[id] = Math.max(0, byClass[id] - 1);
      }
      return { total: Math.max(0, prev.total - classIds.length), byClass };
    });
  }, []);
  const api = useMemo<ShellApi>(() => ({ clearPending }), [clearPending]);

  // ── rail width ────────────────────────────────────────────────────────────
  // Rendered expanded on the server so there is nothing to mismatch; the stored
  // choice (and the tablet default) is applied after mount.
  const [collapsed, setCollapsed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [narrow, setNarrow] = useState(false); // ≤720px: the rail becomes a sheet

  useEffect(() => {
    const phone = window.matchMedia("(max-width: 720px)");
    const tablet = window.matchMedia("(max-width: 1024px)");
    const applyPhone = () => setNarrow(phone.matches);
    applyPhone();
    phone.addEventListener("change", applyPhone);

    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      /* private mode / storage disabled — fall back to the default */
    }
    // A teacher's own choice wins; with none recorded, a tablet starts collapsed
    // so the rail never eats the page on the device this is mostly used on.
    setCollapsed(stored === null ? tablet.matches : stored === "1");
    return () => phone.removeEventListener("change", applyPhone);
  }, []);

  const toggleRail = () => {
    setCollapsed((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* nothing to persist to — the session still gets the choice */
      }
      return next;
    });
  };

  // Close the slide-over whenever the route changes, so a tap on a nav item on a
  // phone leaves the sheet behind rather than covering where you just went.
  useEffect(() => {
    setSheetOpen(false);
  }, [pathname]);

  const showLabels = narrow ? true : !collapsed;
  const railWidth = narrow ? RAIL_W : collapsed ? RAIL_W_COLLAPSED : RAIL_W;

  const rail = (
    <Rail
      classes={classes}
      counts={counts}
      pathname={pathname}
      showLabels={showLabels}
      width={railWidth}
      narrow={narrow}
      collapsed={collapsed}
      onToggle={toggleRail}
      onClose={() => setSheetOpen(false)}
    />
  );

  return (
    <ShellContext.Provider value={api}>
      <div
        className="sj"
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          background: CREAM,
          color: INK,
          fontFamily: "var(--font-atkinson)",
        }}
      >
        <IdentityBar
          teacher={teacher}
          schoolName={schoolName}
          isAdmin={isAdmin}
          onOpenMenu={narrow ? () => setSheetOpen(true) : null}
        />

        {banner}

        <div style={{ display: "flex", alignItems: "stretch", flex: 1, minHeight: 0 }}>
          {!narrow && rail}

          {narrow && sheetOpen && (
            <div
              onClick={() => setSheetOpen(false)}
              // Full-screen on a phone, because the identity bar wraps to two or
              // three rows there and a sheet that started below a fixed 57px
              // would sit halfway across it.
              style={{ position: "fixed", inset: 0, zIndex: 30, background: "rgba(34,48,74,0.35)" }}
            >
              <div onClick={(e) => e.stopPropagation()} style={{ height: "100%" }}>
                {rail}
              </div>
            </div>
          )}

          <main
            id="teacher-main"
            className="teacher-main"
            style={{ flex: 1, minWidth: 0, padding: "26px 30px 70px", boxSizing: "border-box" }}
          >
            {children}
          </main>
        </div>
      </div>
    </ShellContext.Provider>
  );
}

// ── identity bar ────────────────────────────────────────────────────────────

function IdentityBar({
  teacher,
  schoolName,
  isAdmin,
  onOpenMenu,
}: {
  teacher: { name: string; initials: string };
  schoolName: string | null;
  isAdmin: boolean;
  onOpenMenu: (() => void) | null;
}) {
  return (
    <div
      className="no-print"
      // Swept by tests/battery/a11y/teacher-touch-targets.spec.ts. Every control
      // inside this bar is a 44px target; the attribute is how the gate finds
      // the bar without depending on its markup.
      data-shell="identity-bar"
      style={{
        background: INK,
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
        padding: "11px 26px",
        minHeight: BAR_H,
        boxSizing: "border-box",
        position: "sticky",
        top: 0,
        zIndex: 20,
      }}
    >
      {onOpenMenu && (
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open the menu"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            flex: "none",
            borderRadius: 12,
            border: "2px solid rgba(216,236,232,.35)",
            background: "rgba(255,253,247,.1)",
            color: "#d8ece8",
            cursor: "pointer",
          }}
        >
          <Icon name="menu" size={20} decorative />
        </button>
      )}

      {/* Home. The jar and the wordmark together came to 27px tall; the link now
          carries its own 44px box so the way back is a target, not a caption. */}
      <Link href="/teacher" style={{ display: "flex", alignItems: "center", minHeight: 44, gap: 8, flex: "none", textDecoration: "none" }}>
        {/* The jar, tinted for the dark bar: cream stroke instead of ink. */}
        <span aria-hidden style={{ display: "flex" }}>
          <DarkBarJar />
        </span>
        <span style={{ font: "600 19px var(--font-fredoka)", color: "#fffdf7" }}>storyjar</span>
      </Link>

      {schoolName && (
        <span style={{ font: "400 14px var(--font-atkinson)", color: "#d8ece8", flex: "none" }}>{schoolName}</span>
      )}

      <ShellSearch />

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14, flex: "none" }}>
        {isAdmin && (
          <Link href="/admin" style={idBarLink}>
            School admin →
          </Link>
        )}
        <span aria-hidden style={{ width: 1, height: 24, background: "rgba(216,236,232,.3)" }} />
        <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span
            aria-hidden
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: 999,
              background: "var(--honey)",
              color: INK,
              font: "700 14px var(--font-atkinson)",
            }}
          >
            {teacher.initials}
          </span>
          <span style={{ font: "600 14px var(--font-atkinson)", color: "#fffdf7" }}>{teacher.name}</span>
        </span>
        <LogoutForm>
          <button type="submit" style={idBarLink}>
            Sign out
          </button>
        </LogoutForm>
      </div>
    </div>
  );
}

// The logo mark on the dark bar. `JarLogo` inks its stroke for light surfaces,
// where the ink outline is the point; on #22304a that outline disappears, so the
// dark-bar copy strokes in cream instead.
function DarkBarJar() {
  return (
    <svg width={22} height={27} viewBox="0 0 100 120" aria-hidden="true">
      <rect x="26" y="4" width="48" height="14" rx="7" fill="var(--kraft)" />
      <path
        d="M30,20 L70,20 L70,30 C82,36 86,46 86,58 L86,98 Q86,114 70,114 L30,114 Q14,114 14,98 L14,58 C14,46 18,36 30,30 Z"
        fill="var(--glass-light)"
        stroke="var(--paper)"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <rect x="30" y="76" width="16" height="16" rx="3" fill="var(--jam)" transform="rotate(-8 38 84)" />
      <rect x="52" y="82" width="16" height="16" rx="3" fill="var(--honey)" transform="rotate(6 60 90)" />
      <rect x="42" y="58" width="16" height="16" rx="3" fill="var(--glass)" transform="rotate(-4 50 66)" />
    </svg>
  );
}

// ── search ──────────────────────────────────────────────────────────────────

const KIND_LABEL: Record<TeacherSearchItem["kind"], string> = {
  child: "Pupil",
  class: "Class",
  activity: "Activity",
};

function ShellSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // The index arrives on first focus, not with every page. Until it does the
  // box still takes typing; the results simply appear a moment later.
  const [items, setItems] = useState<TeacherSearchItem[] | null>(null);
  const loading = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const loadIndex = useCallback(() => {
    if (items || loading.current) return;
    loading.current = true;
    teacherSearchIndex()
      .then(setItems)
      .catch(() => {
        // Deny by default: no index, no results — never a stale or partial one.
        loading.current = false;
      });
  }, [items]);

  const q = query.trim().toLowerCase();
  const hits = useMemo(() => {
    if (q.length < 2 || !items) return [];
    return items.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 8);
  }, [items, q]);

  // Click anywhere else and the results go away (the backdrop-close rule).
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  return (
    <div ref={boxRef} style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 380 }}>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          background: "rgba(255,253,247,.1)",
          border: "2px solid rgba(216,236,232,.35)",
          borderRadius: 999,
          // No vertical padding: the input STRETCHES to fill the pill instead,
          // so the control a teacher taps and the box they can see are the same
          // 44px rectangle. 48 here minus the 2px borders is the 44 inside.
          padding: "0 16px",
          minHeight: 48,
          boxSizing: "border-box",
        }}
      >
        <span className="sj-sr-only">Find a child, class or activity</span>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style={{ stroke: "#d8ece8", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round", flex: "none" }}>
          <circle cx="10.5" cy="10.5" r="6" fill="rgba(216,236,232,.22)" />
          <line x1="15" y1="15" x2="20" y2="20" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            loadIndex();
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Find a child, class or activity…"
          style={{
            flex: 1,
            minWidth: 0,
            alignSelf: "stretch", // fill the pill — see the label's padding note
            background: "none",
            border: "none",
            outline: "none",
            font: "400 14px var(--font-atkinson)",
            color: "#fffdf7",
          }}
        />
      </label>

      {open && q.length >= 2 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            right: 0,
            background: "var(--cream)",
            border: "2px solid var(--ink)",
            borderRadius: 14,
            padding: 6,
            boxShadow: "0 12px 30px rgba(34,48,74,0.28)",
            zIndex: 40,
          }}
        >
          <p role="status" className="sj-sr-only">
            {!items ? "Searching…" : hits.length === 0 ? "Nothing matches that" : `${hits.length} result${hits.length === 1 ? "" : "s"}`}
          </p>
          {!items ? (
            <p style={{ margin: 0, padding: "10px 12px", font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>
              Looking…
            </p>
          ) : hits.length === 0 ? (
            <p style={{ margin: 0, padding: "10px 12px", font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>
              Nothing matches that.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {hits.map((h) => (
                <li key={`${h.kind}-${h.id}`}>
                  <Link
                    href={h.href}
                    onClick={() => {
                      setOpen(false);
                      setQuery("");
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      textDecoration: "none",
                      color: INK,
                      borderRadius: 10,
                      padding: "10px 12px",
                      minHeight: 44,
                      boxSizing: "border-box",
                    }}
                  >
                    <span style={{ font: "700 15px var(--font-atkinson)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {h.name}
                    </span>
                    <span style={{ font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)", flex: "none" }}>
                      {KIND_LABEL[h.kind]}
                      {h.sub ? ` · ${h.sub}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── the rail ────────────────────────────────────────────────────────────────

function Rail({
  classes,
  counts,
  pathname,
  showLabels,
  width,
  narrow,
  collapsed,
  onToggle,
  onClose,
}: {
  classes: ShellClass[];
  counts: { total: number; byClass: Record<string, number> };
  pathname: string;
  showLabels: boolean;
  width: number;
  narrow: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const item = (active: boolean, alert: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    justifyContent: showLabels ? "flex-start" : "center",
    gap: 11,
    font: "700 16px var(--font-atkinson)",
    textDecoration: "none",
    borderRadius: 12,
    padding: showLabels ? "11px 13px" : "11px 0",
    minHeight: 48,
    boxSizing: "border-box",
    background: active ? INK : alert ? "var(--honey-tint)" : "transparent",
    color: active ? "var(--paper)" : INK,
    border: `2px solid ${active ? INK : alert ? "var(--honey)" : "transparent"}`,
  });

  return (
    <nav
      // Swept by the touch-target gate, like the identity bar above.
      data-shell="rail"
      aria-label="Teacher sections and classes"
      className="no-print"
      style={{
        flex: "none",
        width,
        transition: "width 160ms ease",
        borderRight: `2px solid ${BORDER}`,
        background: CREAM,
        padding: "18px 14px 26px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 18,
        position: narrow ? "static" : "sticky",
        top: narrow ? undefined : BAR_H,
        alignSelf: narrow ? "stretch" : "flex-start",
        height: narrow ? "100%" : `calc(100vh - ${BAR_H}px)`,
        overflowY: "auto",
      }}
    >
      {narrow && (
        <button
          type="button"
          onClick={onClose}
          style={{
            alignSelf: "flex-end",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            font: "600 14px var(--font-atkinson)",
            color: "var(--sj-muted)",
            background: "none",
            border: `2px solid ${BORDER}`,
            borderRadius: 999,
            padding: "8px 14px",
            minHeight: 44,
            cursor: "pointer",
          }}
        >
          <Icon name="close" size={16} decorative /> Close
        </button>
      )}

      {/* ── sections ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {SECTIONS.map((s) => {
          // Journals owns /teacher exactly — its children are their own sections.
          const active = s.exact ? pathname === s.href : pathname.startsWith(s.href);
          const isQueue = s.href === "/teacher/queue";
          // The queue is the one item allowed to advertise itself: when it is
          // idle and non-empty it reads as a standing alert, not a nav item.
          const alert = isQueue && !active && counts.total > 0;
          return (
            <Link
              key={s.href}
              href={s.href}
              aria-label={s.label}
              aria-current={active ? "page" : undefined}
              style={item(active, alert)}
            >
              <span style={{ display: "flex", flex: "none" }} aria-hidden>
                <Icon name={s.icon} size={21} decorative />
              </span>
              {showLabels && <span style={{ flex: 1 }}>{s.label}</span>}
              {isQueue && counts.total > 0 && showLabels && (
                <span
                  style={{
                    marginLeft: "auto",
                    background: "var(--jam)",
                    color: "var(--paper)",
                    borderRadius: 999,
                    padding: "2px 9px",
                    fontSize: 13,
                  }}
                >
                  {counts.total}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* ── the teacher's classes ── */}
      <div style={{ borderTop: `2px solid ${BORDER}`, paddingTop: 16, display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 8px 8px" }}>
          {showLabels && (
            <span style={{ font: "700 11px var(--font-atkinson)", letterSpacing: ".09em", textTransform: "uppercase", color: "var(--glass-ink)" }}>
              My classes
            </span>
          )}
          <Link
            href="/teacher/class"
            aria-label="Add a class"
            style={{
              marginLeft: "auto",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 44,
              minHeight: 44,
              font: "700 15px var(--font-atkinson)",
              color: "var(--sj-muted)",
              textDecoration: "none",
            }}
          >
            <span aria-hidden>＋</span>
          </Link>
        </div>

        {/* The open class comes from the URL, never from component state — the
            same decision the class manager made, so a reload or a bookmark is
            predictable. Reading it needs useSearchParams, so only this list
            (not the whole shell) sits behind a Suspense boundary. */}
        <Suspense fallback={<ClassList classes={classes} counts={counts} showLabels={showLabels} selectedId={null} />}>
          <ClassListFromUrl classes={classes} counts={counts} showLabels={showLabels} />
        </Suspense>

        <Link
          href="/teacher/class"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: showLabels ? "flex-start" : "center",
            gap: 10,
            marginTop: 6,
            font: "600 14px var(--font-atkinson)",
            textDecoration: "none",
            color: "var(--sj-muted)",
            padding: "9px 10px",
            minHeight: 44,
            boxSizing: "border-box",
          }}
          aria-label="Manage classes"
        >
          <span style={{ display: "flex", flex: "none" }} aria-hidden>
            <Icon name="class" size={17} decorative />
          </span>
          {showLabels && <span>Manage classes</span>}
        </Link>
      </div>

      {!narrow && (
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={collapsed}
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: showLabels ? "flex-start" : "center",
            gap: 9,
            font: "600 13px var(--font-atkinson)",
            cursor: "pointer",
            background: "none",
            border: `2px solid ${BORDER}`,
            borderRadius: 999,
            padding: "8px 12px",
            color: "var(--sj-muted)",
            minHeight: 44,
            boxSizing: "border-box",
          }}
        >
          <span aria-hidden style={{ fontSize: 15 }}>{collapsed ? "»" : "«"}</span>
          <span className={showLabels ? undefined : "sr-only"}>{collapsed ? "Expand the menu" : "Collapse the menu"}</span>
        </button>
      )}
    </nav>
  );
}

function ClassListFromUrl({
  classes,
  counts,
  showLabels,
}: {
  classes: ShellClass[];
  counts: { total: number; byClass: Record<string, number> };
  showLabels: boolean;
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  // A class only reads as "open" on Journals, which is the screen it opens.
  const selectedId = pathname === "/teacher" ? params.get("class") : null;
  return <ClassList classes={classes} counts={counts} showLabels={showLabels} selectedId={selectedId} />;
}

function ClassList({
  classes,
  counts,
  showLabels,
  selectedId,
}: {
  classes: ShellClass[];
  counts: { total: number; byClass: Record<string, number> };
  showLabels: boolean;
  selectedId: string | null;
}) {
  return (
    <>
      {classes.map((c) => (
        <ClassRow
          key={c.id}
          klass={c}
          waiting={counts.byClass[c.id] ?? 0}
          showLabels={showLabels}
          selected={c.id === selectedId}
        />
      ))}
    </>
  );
}

// A class row is a link, because selecting a class opens Journals for it.
function ClassRow({
  klass,
  waiting,
  showLabels,
  selected,
}: {
  klass: ShellClass;
  waiting: number;
  showLabels: boolean;
  selected: boolean;
}) {
  return (
    <Link
      href={`/teacher?class=${encodeURIComponent(klass.id)}`}
      aria-label={klass.name}
      aria-current={selected ? "true" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: showLabels ? "flex-start" : "center",
        gap: 10,
        font: "600 15px var(--font-atkinson)",
        textDecoration: "none",
        borderRadius: 10,
        padding: showLabels ? "9px 10px" : "9px 0",
        minHeight: 44,
        boxSizing: "border-box",
        background: selected ? "var(--kraft-tag)" : "transparent",
        color: selected ? INK : "var(--ink-soft)",
      }}
    >
      <span aria-hidden style={{ width: 10, height: 10, borderRadius: 999, flex: "none", background: klass.dot }} />
      {showLabels && (
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{klass.name}</span>
      )}
      {showLabels && waiting > 0 && (
        <span style={{ font: "700 13px var(--font-atkinson)", color: "var(--honey-ink)" }}>{waiting}</span>
      )}
    </Link>
  );
}

