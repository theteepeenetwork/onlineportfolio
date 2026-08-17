// The operator kill switch (handbook ruling R17: "the kill switch OPS_ENABLED,
// unset by default, makes every ops route and action 404").
//
// Deliberately free of `import "server-only"`. A blocking spec has to be able
// to import this and prove both branches of the switch in-process, and a module
// that carries `server-only` throws the moment a Playwright test imports it.
// There is nothing secret in here: it reads one environment variable and
// returns a boolean. Everything that needs a session, a cookie or the database
// lives in src/lib/ops/session.ts, which does carry `server-only`.
//
// The default is OFF, and that direction matters. An operator area that is
// reachable because somebody forgot to disable it is the failure; an operator
// area that is unreachable because somebody forgot to enable it is an
// inconvenience the operator notices in ten seconds.

export const OPS_ENABLED_VAR = "OPS_ENABLED";

// Exactly "1" enables it. Not "true", not "yes", not any non-empty string: a
// switch with several spellings is a switch somebody turns on by accident with
// OPS_ENABLED=false.
export function opsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[OPS_ENABLED_VAR] === "1";
}
