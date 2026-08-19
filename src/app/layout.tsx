import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Storyjar's two typefaces, VENDORED rather than fetched from Google at build
// time. Fredoka for display, buttons and headings; Atkinson Hyperlegible for
// body and UI text, chosen by the Braille Institute's design for legibility at
// low vision rather than for looks (SAFEGUARDING rule 18). Exposed as CSS
// variables for the design tokens.
//
// next/font/google downloaded these during `next build`, which put
// fonts.gstatic.com on the critical path of every deploy: an outage there fails
// the build outright (FINDINGS F28, which took out a CI job on 2026-08-17). The
// files now live in ./fonts with their licences. See ./fonts/README.md.
const fredoka = localFont({
  // One variable file covering 400 to 700, which is the range the old
  // weight: ["400","500","600","700"] declaration asked for.
  src: "./fonts/fredoka-normal-400-700.woff2",
  weight: "400 700",
  variable: "--font-fredoka",
  display: "swap",
});
const atkinson = localFont({
  src: [
    { path: "./fonts/atkinson-normal-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/atkinson-normal-700.woff2", weight: "700", style: "normal" },
    { path: "./fonts/atkinson-italic-400.woff2", weight: "400", style: "italic" },
    { path: "./fonts/atkinson-italic-700.woff2", weight: "700", style: "italic" },
  ],
  variable: "--font-atkinson",
  display: "swap",
});
// Every route reads the session cookie + database per request, so nothing is
// statically prerendered. Declaring it here keeps the production build from
// touching the database (the volume-mounted SQLite file only exists at runtime).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Storyjar — every child's story, collected",
  description:
    "A class journal and portfolio for ages 3–11. Children pop their photos, drawings and words into the jar — and nothing is kept until the teacher has seen it.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`h-full antialiased ${fredoka.variable} ${atkinson.variable}`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
