// Whether THIS deployment is the public site, and may therefore be indexed.
//
// StoryJar runs in more than one place: storyjar.co.uk, and a staging
// environment on a *.up.railway.app address that holds fixture schools and
// has OPS_ENABLED=1. The operator fixture password and its TOTP secret are
// committed to a public repository on purpose (they are test fixtures, R6), so
// a staging deployment that a search engine indexes is a signposted door.
//
// No `server-only` import: this is the sole implementation of the predicate and
// a blocking test has to be able to import it (see the pattern in
// src/lib/stripeMode.ts, which exists for the same reason).
//
// It FAILS TOWARDS BEING INDEXED, deliberately. next.config.ts calls this at
// build time, where APP_URL may not be present, and the two mistakes are not
// equal: wrongly indexing staging is a risk, wrongly de-indexing storyjar.co.uk
// during launch fortnight is an outage of the only marketing the product has.
// So an unset or unparseable APP_URL means "assume public, change nothing".
export const PUBLIC_SITE_HOSTS = ["storyjar.co.uk", "www.storyjar.co.uk"];

export function isPublicSite(appUrl: string | undefined = process.env.APP_URL): boolean {
  if (!appUrl) return true;
  let host: string;
  try {
    host = new URL(appUrl).host.toLowerCase();
  } catch {
    return true;
  }
  return PUBLIC_SITE_HOSTS.includes(host);
}
