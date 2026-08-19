# Vendored typefaces

Storyjar's two typefaces, committed to the repository rather than fetched from
Google at build time.

## Why they are here

`next/font/google` downloads a font at BUILD time, which put fonts.gstatic.com on
the critical path of every build and every deploy: an outage or a 404 there fails
the build outright. That is FINDINGS F28, and it took out a CI job on
2026-08-17. A deploy that cannot happen because somebody else's CDN is having an
afternoon is not a risk worth carrying for 76 KB of files.

Vendoring also makes the build reproducible: the bytes that shipped last month
are the bytes that ship today.

## What is here

Only the **latin** subsets, which is exactly what the application asked
`next/font/google` for. Fetched from the Google Fonts CSS API on 2026-08-19 and
committed unmodified.

| File | Face | Size |
| --- | --- | --- |
| `fredoka-normal-400-700.woff2` | Fredoka, variable 400 to 700 | 29 KB |
| `atkinson-normal-400.woff2` | Atkinson Hyperlegible regular | 11 KB |
| `atkinson-normal-700.woff2` | Atkinson Hyperlegible bold | 11 KB |
| `atkinson-italic-400.woff2` | Atkinson Hyperlegible italic | 12 KB |
| `atkinson-italic-700.woff2` | Atkinson Hyperlegible bold italic | 12 KB |

## Licence

Both are under the SIL Open Font License 1.1, which permits bundling with an
application and redistribution. The licence text is included for each, as the
OFL requires: `OFL-Fredoka.txt` and `OFL-Atkinson-Hyperlegible.txt`.

Atkinson Hyperlegible was designed by the Braille Institute for legibility at low
vision, which is why it carries the body text here. That is a safeguarding
choice rather than a decorative one (SAFEGUARDING rule 18).

## Changing them

Re-download from the Google Fonts CSS API with a browser user agent, keep the
latin subset only, and update the table above. Do not switch back to
`next/font/google`: that reopens F28.
