import type { CSSProperties, ReactNode } from "react";

/**
 * Storyjar icon set — one family of hand-inked, 24×24 keyline icons.
 *
 * Every glyph is drawn on a 0 0 24 24 grid with a 2px ink stroke (round caps
 * and joins) plus a single accent fill from the brand palette. The outline
 * follows `currentColor`, so an icon inherits the ink colour of whatever text
 * it sits beside; accent fills are baked in so the family stays recognisable.
 *
 * Usage:  <Icon name="home" />           // 24px, labelled "Home" for screen readers
 *         <Icon name="delete" size={20} decorative />  // hidden from a11y tree
 *         <Icon name="star" title="Favourite" />       // custom label
 */
export type IconName =
  | "pen"
  | "felt-tip"
  | "highlighter"
  | "eraser"
  | "fill"
  | "line"
  | "palette"
  | "shapes"
  | "text"
  | "undo"
  | "redo"
  | "add-picture"
  | "add-file"
  | "camera"
  | "voice"
  | "draw"
  | "write"
  | "jar"
  | "pop-in"
  | "add-to-jar"
  | "waiting"
  | "edit"
  | "delete"
  | "share"
  | "print"
  | "download"
  | "next"
  | "point"
  | "home"
  | "class"
  | "search"
  | "settings"
  | "back"
  | "close"
  | "menu"
  | "help"
  | "star"
  | "love"
  | "done";

type Glyph = { label: string; glyph: ReactNode };

const ICONS: Record<IconName, Glyph> = {
  "pen": { label: "Pen", glyph: (
    <><g transform="rotate(45 12 12)"><rect x="10" y="3" width="4" height="8" rx="1.2" fill="#4E9C94" /><path d="M10 11 L14 11 L12.6 17 L11.4 17 Z" fill="#FFFDF7" /><line x1="10" y1="13.5" x2="14" y2="13.5" /><line x1="12" y1="17" x2="12" y2="19.5" /></g></>
  ) },
  "felt-tip": { label: "Felt tip", glyph: (
    <><g transform="rotate(45 12 12)"><rect x="9" y="3" width="6" height="8" rx="1.6" fill="#C2476B" /><path d="M9 11 L15 11 L12.8 18 L11.2 18 Z" fill="#22304A" /></g></>
  ) },
  "highlighter": { label: "Highlighter", glyph: (
    <><g transform="rotate(32 12 12)"><rect x="8.5" y="3" width="7" height="7" rx="1.5" fill="#F0B441" /><path d="M8.5 10 L15.5 10 L13.6 16 L10.4 16 Z" fill="#F7E7A6" /><path d="M10.4 16 L13.6 16 L13.2 19 L10.8 19 Z" fill="#F7E7A6" /></g></>
  ) },
  "eraser": { label: "Eraser", glyph: (
    <><g transform="rotate(-20 12 12)"><path d="M5 13.5 Q5 11.5 7 11.5 L16 11.5 Q18 11.5 18 13.5 L18 16.5 L5 16.5 Z" fill="#8AB9D6" /><path d="M5 16.5 L18 16.5 L18 18 Q18 19 17 19 L6 19 Q5 19 5 18 Z" fill="#E08A9B" /></g> <path d="M4 21 h3 M9 21 h2.5" strokeLinecap="round" /></>
  ) },
  "fill": { label: "Fill", glyph: (
    <><g transform="rotate(35 11 11)"> <path d="M5.6 6 L7.4 15.8 Q7.6 17.3 9.1 17.3 L12.9 17.3 Q14.4 17.3 14.6 15.8 L16.4 6" fill="#D8ECE8" /> <ellipse cx="11" cy="6" rx="5.4" ry="1.7" fill="#D8ECE8" /> <path d="M6.6 5.2 Q6.1 1.8 11 1.8 Q15.9 1.8 15.4 5.2" /> </g> <path d="M17.6 10 Q19.4 12.8 19.4 14.7 Q19.4 16.5 17.6 16.5 Q15.8 16.5 15.8 14.7 Q15.8 12.8 17.6 10 Z" fill="#C2476B" /></>
  ) },
  "line": { label: "Line thickness", glyph: (
    <><line x1="4" y1="6.5" x2="20" y2="6.5" strokeWidth="1.5" /> <line x1="4" y1="12" x2="20" y2="12" strokeWidth="3.5" /> <line x1="4" y1="18" x2="20" y2="18" strokeWidth="6" /></>
  ) },
  "palette": { label: "Colour", glyph: (
    <><path d="M12 4 C6.5 4 3 7.5 3 11.5 C3 14.5 5 16.5 7.5 16 C9 15.7 9.6 17.4 9 18.4 C8.5 19.3 9.3 20 10.5 20 C16 20 21 16 21 11 C21 7 17 4 12 4 Z" fill="#FFFDF7" /> <circle cx="8" cy="9" r="1.5" fill="#C2476B" stroke="none" /> <circle cx="12" cy="7" r="1.5" fill="#F0B441" stroke="none" /> <circle cx="16" cy="9" r="1.5" fill="#4E9C94" stroke="none" /> <circle cx="16.5" cy="13" r="1.5" fill="#8AB9D6" stroke="none" /></>
  ) },
  "shapes": { label: "Shapes", glyph: (
    <><rect x="3.5" y="8" width="10" height="10" rx="1.5" fill="#8AB9D6" /> <circle cx="16" cy="9" r="5" fill="#F0B441" /></>
  ) },
  "text": { label: "Text", glyph: (
    <><path d="M5.5 19 L11 5 L12.5 5 L18 19" /> <line x1="8" y1="14" x2="15.5" y2="14" /> <rect x="19" y="6" width="2.4" height="13" rx="1.2" fill="#C2476B" stroke="none" /></>
  ) },
  "undo": { label: "Undo", glyph: (
    <><path d="M4.5 9 H13.5 A5 5 0 1 1 8.5 16" /> <path d="M4.5 9 L7.5 6 M4.5 9 L7.5 12" /></>
  ) },
  "redo": { label: "Redo", glyph: (
    <><path d="M19.5 9 H10.5 A5 5 0 1 0 15.5 16" /> <path d="M19.5 9 L16.5 6 M19.5 9 L16.5 12" /></>
  ) },
  "add-picture": { label: "Add a picture", glyph: (
    <><rect x="3" y="5" width="13" height="13" rx="2.5" fill="#D8ECE8" /> <circle cx="7.4" cy="9" r="1.8" fill="#F0B441" stroke="none" /> <path d="M3.4 15 L8 10.5 L11.5 13.8 L13.5 12.2 L16 14.6" /> <circle cx="18" cy="17" r="4.4" fill="#C2476B" /> <path d="M18 15 v4 M16 17 h4" stroke="#FFFDF7" strokeWidth="1.8" /></>
  ) },
  "add-file": { label: "Add a file", glyph: (
    <><path d="M5 4 Q5 3 6 3 L12 3 L16 7 L16 16 L16 16 Q16 17 15 17 L6 17 Q5 17 5 16 Z" fill="#FFFDF7" /> <path d="M12 3 L12 7 L16 7" /> <line x1="8" y1="11" x2="13" y2="11" /> <line x1="8" y1="13.6" x2="11.5" y2="13.6" /> <circle cx="17.5" cy="17.5" r="4.4" fill="#4E9C94" /> <path d="M17.5 15.5 v4 M15.5 17.5 h4" stroke="#FFFDF7" strokeWidth="1.8" /></>
  ) },
  "camera": { label: "Take a photo", glyph: (
    <><path d="M3 9 Q3 7.5 4.5 7.5 L7 7.5 L8.5 5.5 L15.5 5.5 L17 7.5 L19.5 7.5 Q21 7.5 21 9 L21 17 Q21 18.5 19.5 18.5 L4.5 18.5 Q3 18.5 3 17 Z" fill="#FFFDF7" /> <circle cx="12" cy="12.5" r="3.4" fill="#8AB9D6" /> <circle cx="18" cy="10.5" r="0.8" fill="#F0B441" stroke="none" /></>
  ) },
  "voice": { label: "Record your voice", glyph: (
    <><rect x="9" y="3" width="6" height="10" rx="3" fill="#C2476B" /> <path d="M6 11 A6 6 0 0 0 18 11" /> <line x1="12" y1="17" x2="12" y2="20" /> <line x1="9" y1="20.5" x2="15" y2="20.5" /></>
  ) },
  "draw": { label: "Draw a picture", glyph: (
    <><path d="M16.5 3.5 L20.5 7.5 L12 16 L8 17 L9 13 Z" fill="#A6C979" /> <path d="M13.5 6.5 L17.5 10.5" /> <path d="M3.5 20 Q6 16 8.5 19 T13.5 19" strokeWidth="2" /></>
  ) },
  "write": { label: "Write words", glyph: (
    <><line x1="3.5" y1="7" x2="16" y2="7" /> <line x1="3.5" y1="11.5" x2="13.5" y2="11.5" /> <line x1="3.5" y1="16" x2="11" y2="16" /> <path d="M16.5 12.5 L20 16 L14.5 21.5 L11.5 22 L12 19 Z" fill="#F0B441" /></>
  ) },
  "jar": { label: "My jar", glyph: (
    <><rect x="8" y="3" width="8" height="2.4" rx="1.2" fill="#C9A87C" /> <rect x="7.4" y="5.4" width="9.2" height="1.9" rx="0.9" fill="#C9A87C" /> <path d="M8 7.3 Q5 8.7 5 12.6 L5 18.5 Q5 21 7.6 21 L16.4 21 Q19 21 19 18.5 L19 12.6 Q19 8.7 16 7.3 Z" fill="#D8ECE8" /> <rect x="7.6" y="15.4" width="4" height="4" rx="0.8" fill="#E08A9B" stroke="none" transform="rotate(-8 9.6 17.4)" /> <rect x="12" y="16" width="4" height="4" rx="0.8" fill="#F0B441" stroke="none" transform="rotate(6 14 18)" /></>
  ) },
  "pop-in": { label: "Pop it in", glyph: (
    <><path d="M12 2 L12 7.5 M9.6 5.1 L12 7.5 L14.4 5.1" stroke="#C2476B" /> <path d="M6.5 9.5 Q5 10.4 5 13 L5 18.5 Q5 21 7.6 21 L16.4 21 Q19 21 19 18.5 L19 13 Q19 10.4 17.5 9.5" fill="#D8ECE8" /></>
  ) },
  "add-to-jar": { label: "Add to the jar", glyph: (
    <><rect x="6" y="4" width="7" height="2.1" rx="1" fill="#C9A87C" /> <path d="M6.3 6.1 Q4 7.4 4 10.6 L4 17.5 Q4 20 6.4 20 L13.6 20 Q16 20 16 17.5 L16 12.5" fill="#D8ECE8" /> <circle cx="18" cy="7.5" r="4.4" fill="#4E9C94" /> <path d="M16.1 7.6 L17.6 9.1 L20 6.3" stroke="#FFFDF7" strokeWidth="1.8" /></>
  ) },
  "waiting": { label: "Waiting", glyph: (
    <><path d="M6.5 3 H17.5 M6.5 21 H17.5" /> <path d="M7.5 3 Q7.5 9 12 12 Q7.5 15 7.5 21 M16.5 3 Q16.5 9 12 12 Q16.5 15 16.5 21" /> <path d="M9 5.5 L15 5.5 L12 9 Z" fill="#F0B441" stroke="none" /></>
  ) },
  "edit": { label: "Edit", glyph: (
    <><path d="M14.5 4 L18.5 8 L9 17.5 L5 18.5 L6 14.5 Z" fill="#4E9C94" /> <path d="M12.5 6 L16.5 10" /> <line x1="4" y1="21" x2="20" y2="21" /></>
  ) },
  "delete": { label: "Delete", glyph: (
    <><path d="M5 6 H19" /> <path d="M7 6 L7.8 19.5 Q7.9 21 9.3 21 L14.7 21 Q16.1 21 16.2 19.5 L17 6 Z" fill="#F7E0E6" /> <path d="M9.5 6 V4.2 Q9.5 3 10.7 3 L13.3 3 Q14.5 3 14.5 4.2 V6" /> <line x1="10.3" y1="9.5" x2="10.6" y2="17.5" /> <line x1="13.7" y1="9.5" x2="13.4" y2="17.5" /></>
  ) },
  "share": { label: "Share", glyph: (
    <><path d="M12 3 L12 14" /> <path d="M8.5 6.5 L12 3 L15.5 6.5" stroke="#4E9C94" /> <path d="M7 10 H5.5 Q4.5 10 4.5 11 L4.5 19 Q4.5 20 5.5 20 L18.5 20 Q19.5 20 19.5 19 L19.5 11 Q19.5 10 18.5 10 H17" /></>
  ) },
  "print": { label: "Print", glyph: (
    <><path d="M7 8 V4 H17 V8" /> <path d="M7 8 H5 Q4 8 4 9 L4 15 Q4 16 5 16 H7 M17 16 H19 Q20 16 20 15 L20 9 Q20 8 19 8 H17" fill="#D8ECE8" /> <rect x="7" y="13.5" width="10" height="6.5" rx="1" fill="#FFFDF7" /> <circle cx="17" cy="11" r="0.9" fill="#F0B441" stroke="none" /></>
  ) },
  "download": { label: "Download", glyph: (
    <><path d="M12 3 L12 14" /> <path d="M8 10.5 L12 14 L16 10.5" stroke="#4E9C94" /> <path d="M5 16.5 L5 19 Q5 20 6 20 L18 20 Q19 20 19 19 L19 16.5" /></>
  ) },
  "next": { label: "Next", glyph: (
    <><path d="M6 4 L14 12 L6 20" /> <line x1="17.5" y1="4" x2="17.5" y2="20" stroke="#C2476B" /></>
  ) },
  "point": { label: "Point", glyph: (
    <><path d="M9.7 13.4 L9.7 5 Q9.7 3.4 11.3 3.4 Q12.9 3.4 12.9 5 L12.9 10.3 Q13 9.3 14 9.3 Q15 9.3 15 10.3 L15 11.1 Q15.2 10.1 16.2 10.1 Q17.2 10.1 17.2 11.1 L17.2 11.9 Q17.4 11 18.4 11.2 Q19.3 11.4 19.2 12.5 L18.9 16 Q18.6 20.2 14.4 20.2 L13 20.2 Q10.7 20.2 9.4 18.3 L9.4 15.4 Q8.3 15.8 7.2 15.1 Q5.9 14.3 6.5 13.1 Q6.9 12.3 8.1 12.6 Q9.1 12.9 9.7 13.9 Z" fill="#FFFDF7" /> <path d="M12.9 11.2 L12.9 13.4 M15 11.5 L15 13.6 M17.2 12.1 L17.2 14.2" /> <path d="M9.5 17.8 Q11 20 14.6 19.6 L18.9 19 L18.3 22.3 Q18.2 22.6 17.8 22.6 L10.3 22.6 Q9.9 22.6 9.8 22.3 Z" fill="#8AB9D6" /></>
  ) },
  "home": { label: "Home", glyph: (
    <><path d="M4 11 L12 4 L20 11" /> <path d="M6 10 L6 20 L18 20 L18 10" /> <path d="M10 20 L10 14 L14 14 L14 20 Z" fill="#C2476B" /></>
  ) },
  "class": { label: "Class", glyph: (
    <><circle cx="9" cy="8" r="3" fill="#8AB9D6" /> <path d="M3.5 19 Q3.5 13 9 13 Q14.5 13 14.5 19" /> <circle cx="16.5" cy="8.5" r="2.5" fill="#A6C979" /> <path d="M14 13.2 Q20.5 12.8 20.5 19" /></>
  ) },
  "search": { label: "Search", glyph: (
    <><circle cx="10.5" cy="10.5" r="6" fill="#D8ECE8" /> <line x1="15" y1="15" x2="20" y2="20" /></>
  ) },
  "settings": { label: "Settings", glyph: (
    <><line x1="4" y1="8" x2="20" y2="8" /> <circle cx="9" cy="8" r="2.6" fill="#F0B441" /> <line x1="4" y1="16" x2="20" y2="16" /> <circle cx="15" cy="16" r="2.6" fill="#4E9C94" /></>
  ) },
  "back": { label: "Back", glyph: (
    <><line x1="20" y1="12" x2="5" y2="12" /> <path d="M11 6 L5 12 L11 18" /></>
  ) },
  "close": { label: "Close", glyph: (
    <><path d="M6.5 6.5 L17.5 17.5 M17.5 6.5 L6.5 17.5" /></>
  ) },
  "menu": { label: "Menu", glyph: (
    <><line x1="4" y1="7" x2="20" y2="7" /> <line x1="4" y1="12" x2="20" y2="12" /> <line x1="4" y1="17" x2="20" y2="17" /></>
  ) },
  "help": { label: "Help", glyph: (
    <><circle cx="12" cy="12" r="8.5" fill="#D8ECE8" /> <path d="M9.4 9.4 Q9.4 6.8 12 6.8 Q14.6 6.8 14.6 9.2 Q14.6 11 12 12 L12 13.6" /> <circle cx="12" cy="16.6" r="0.9" fill="#22304A" stroke="none" /></>
  ) },
  "star": { label: "Star", glyph: (
    <><path d="M12 3 L14.5 8.6 L20.6 9.3 L16.1 13.5 L17.4 19.6 L12 16.5 L6.6 19.6 L7.9 13.5 L3.4 9.3 L9.5 8.6 Z" fill="#F0B441" /></>
  ) },
  "love": { label: "Love", glyph: (
    <><path d="M12 20 C12 20 4 15 4 9 Q4 5 7.5 5 Q10.5 5 12 8 Q13.5 5 16.5 5 Q20 5 20 9 C20 15 12 20 12 20 Z" fill="#C2476B" /></>
  ) },
  "done": { label: "Done", glyph: (
    <><circle cx="12" cy="12" r="8.5" fill="#4E9C94" /> <path d="M8 12.2 L11 15 L16.5 8.5" stroke="#FFFDF7" strokeWidth="2.4" /></>
  ) },
};

export type IconProps = {
  /** Which glyph to draw. */
  name: IconName;
  /** Pixel size (width and height). Defaults to 24. */
  size?: number;
  /**
   * Accessible label. Defaults to the icon's built-in name (e.g. "Home").
   * Pass `decorative` instead when the icon only repeats adjacent text.
   */
  title?: string;
  /** Hide from the accessibility tree (use when the icon is purely decorative). */
  decorative?: boolean;
  className?: string;
  style?: CSSProperties;
};

/** Draw a Storyjar icon. See {@link IconName} for the full set. */
export function Icon({ name, size = 24, title, decorative, className, style }: IconProps) {
  const entry = ICONS[name];
  const label = title ?? entry.label;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
      focusable={false}
      style={{
        stroke: "currentColor",
        strokeWidth: 2,
        fill: "none",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        flex: "none",
        ...style,
      }}
    >
      {entry.glyph}
    </svg>
  );
}

export default Icon;
