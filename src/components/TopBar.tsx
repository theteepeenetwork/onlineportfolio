import Link from "next/link";
import { logout } from "@/app/actions/auth";

// The bar across the top of every signed-in page.
export function TopBar({
  title,
  subtitle,
  links,
  right,
}: {
  title: string;
  subtitle?: string;
  links?: { href: string; label: string; badge?: number }[];
  right?: React.ReactNode;
}) {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-extrabold">
          <span className="text-xl">📚</span>
          <span className="hidden sm:inline">Class Journal</span>
        </Link>

        {links && (
          <nav className="flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="relative rounded-lg px-3 py-1.5 text-sm font-semibold text-muted hover:bg-background hover:text-foreground"
              >
                {l.label}
                {l.badge ? (
                  <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-xs font-bold text-amber-950">
                    {l.badge}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-3">
          {right}
          <form action={logout}>
            <button className="btn-ghost px-3 py-1.5 text-sm" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </div>
      {(title || subtitle) && (
        <div className="mx-auto max-w-5xl px-4 pb-4 pt-1">
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
      )}
    </header>
  );
}
