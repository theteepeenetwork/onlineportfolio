import { avatarInk } from "@/lib/avatar";

// A coloured circle showing a student's initials.
//
// The ink adapts to the disc: `text-white` was unreadable on six of the eight
// palette colours (1.8–2.5:1 against a 4.5:1 floor). See src/lib/avatarInk.ts.
export function Avatar({
  name,
  color,
  size = 40,
}: {
  name: string;
  color: string;
  size?: number;
}) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{
        backgroundColor: color,
        color: avatarInk(color),
        width: size,
        height: size,
        fontSize: size * 0.4,
      }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
