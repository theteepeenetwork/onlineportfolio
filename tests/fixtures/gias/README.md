# A GIAS extract, in miniature

`sample-extract.csv` is what `scripts/gias-import.ts` reads, cut down to
fourteen rows so `npm run check` can prove the parser without downloading sixty
megabytes from a government service on every dev loop.

**The header is real; every school in it is invented.** The 135 column names and
their order were taken from the DfE's all-establishments extract of 24 August
2026, because a parser that reads columns by name is only tested if the names
are the real ones. The rows are fiction — Bramblewick, Ambledon, Barsetshire —
for the reason `docs/TEST_LOGINS.md` gives and does not qualify: a real school's
name in a fixture is a real school's name in a screenshot, and this one would be
a real school's postcode too.

It is encoded **Windows-1252, not UTF-8**, and that is deliberate rather than an
accident of whatever wrote it: so is the real extract, and a parser that assumes
UTF-8 turns `St Cuthbert’s` into mojibake in twenty thousand places. One row
carries a curly apostrophe and a comma inside a quoted field so both the
decoding and the CSV parsing are actually exercised.

Seven rows are kept and seven are dropped, one for each reason the filter has.
`scripts/check-establishments.ts` asserts which is which and why.
