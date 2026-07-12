// The little Storyjar jar mark, reused in the nav, footer and "treasure" step.
// One master SVG, sized by props — never redrawn per screen.
export function JarLogo({
  width = 30,
  height = 36,
  jarFill = "var(--glass-light)",
}: {
  width?: number;
  height?: number;
  jarFill?: string;
}) {
  return (
    <svg width={width} height={height} viewBox="0 0 100 120" aria-hidden="true">
      <rect x="26" y="4" width="48" height="14" rx="7" fill="var(--kraft)" />
      <path
        d="M30,20 L70,20 L70,30 C82,36 86,46 86,58 L86,98 Q86,114 70,114 L30,114 Q14,114 14,98 L14,58 C14,46 18,36 30,30 Z"
        fill={jarFill}
        stroke="var(--ink)"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <rect x="30" y="76" width="16" height="16" rx="3" fill="var(--jam)" transform="rotate(-8 38 84)" />
      <rect x="52" y="82" width="16" height="16" rx="3" fill="var(--honey)" transform="rotate(6 60 90)" />
      <rect x="42" y="58" width="16" height="16" rx="3" fill="#37796f" transform="rotate(-4 50 66)" />
    </svg>
  );
}
