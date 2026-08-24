# Canaries for the LIKE-wildcard gate

`scripts/check-like-wildcards.mjs --self-test` runs every `.txt` here, in the
same convention as `tests/fixtures/ops-blindness/`:

- `// @path: <path>` — **required, first line.** The path the fixture is judged
  as, because the allowlist is keyed on it.
- `// @expect: <operator>` — **required on every `bad-*`.** The operator that
  must fire. "Something fired" is not proof that the right thing fired: a
  fixture naming two operators still passes when one is removed from the gate,
  which is how this corpus was wrong on its first attempt.
- `bad-*` must fire. `good-*` must pass clean. The self-test fails if the corpus
  holds none of either kind.

`.txt` rather than `.ts` so no other walker in the repository ever compiles,
lints or scans them.

**Adding a rule to the gate means adding a fixture that fails without it.** The
current corpus was checked by removing each rule in turn and confirming the
self-test goes red every time — seven mutations, seven caught. Two of those were
only caught after the corpus was rebuilt, and both are recorded in `FINDINGS.md`
F55, because a canary that cannot fail is a decoration.
