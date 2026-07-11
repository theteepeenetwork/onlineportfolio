import type { Metadata } from "next";
import { Fredoka, Atkinson_Hyperlegible } from "next/font/google";
import "./globals.css";

// Storyjar's two typefaces (self-hosted by next/font). Fredoka for display,
// buttons and headings; Atkinson Hyperlegible for body/UI text (chosen for
// dyslexia-friendly legibility). Exposed as CSS variables for the tokens.
const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-fredoka",
  display: "swap",
});
const atkinson = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-atkinson",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Storyjar — every child's story, collected",
  description:
    "A class journal and portfolio for ages 3–7. Children pop their photos, drawings and words into the jar — and nothing is kept until the teacher has seen it.",
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
