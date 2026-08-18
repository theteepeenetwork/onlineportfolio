"use client";

// One search box, used on both activity screens, so a teacher learns it once.
//
// Three things it does that a bare <input> would not:
//
//   It is labelled. A placeholder is not a label: it disappears the moment you
//   type, and a screen reader user gets nothing to hear (SAFEGUARDING rule 18).
//
//   It announces its own result count in a live region, so somebody who cannot
//   see the grid change still learns that typing did something and how much is
//   left. The sentence comes from searchResultLabel so both screens say it the
//   same way.
//
//   It offers a clear button once there is something to clear, because the
//   fastest way out of an empty result is not backspacing sixteen times.

export function ActivitySearchBox({
  id,
  value,
  onChange,
  label,
  placeholder,
  resultLabel,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  label: string;
  placeholder: string;
  resultLabel: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 240 }}>
      <label htmlFor={id} style={{ font: "700 13px var(--font-atkinson)", color: "var(--ink)" }}>
        {label}
      </label>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <input
          id={id}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: "100%",
            boxSizing: "border-box",
            font: "400 15px var(--font-atkinson)",
            color: "var(--ink)",
            background: "var(--paper)",
            border: "2px solid var(--ink)",
            borderRadius: 999,
            padding: "10px 40px 10px 16px",
            minHeight: 44,
          }}
        />
        {value !== "" && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear the search"
            style={{
              position: "absolute",
              right: 6,
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: "none",
              background: "#F3EEE2",
              color: "var(--ink)",
              font: "700 15px var(--font-atkinson)",
              cursor: "pointer",
            }}
          >
            ×
          </button>
        )}
      </div>
      {/* polite, not assertive: a count that interrupts every keystroke is worse
          than no count at all. */}
      <p aria-live="polite" style={{ margin: 0, font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>
        {resultLabel}
      </p>
    </div>
  );
}
