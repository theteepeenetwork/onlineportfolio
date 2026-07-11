"use client";

import { useEffect } from "react";

// Progressive enhancement for the hero: the nine work tiles are visible by
// default (no-JS / reduced-motion friendly); this island hides them and reveals
// them one-by-one as the reader scrolls the 220vh hero track, and fades the
// "scroll to fill" cue at the end. Ported from the design prototype.
export function ScrollFill() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const tiles = Array.from(
      document.querySelectorAll<SVGGElement>("[data-scroll-tile]"),
    );
    tiles.forEach((t) => {
      t.style.transformBox = "fill-box";
      t.style.transformOrigin = "center";
    });

    const track = document.getElementById("hero-track");
    const cue = document.querySelector<HTMLElement>("[data-scroll-cue]");
    let raf: number | null = null;

    const update = () => {
      raf = null;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const total = Math.max(1, rect.height - window.innerHeight);
      const p = Math.min(1, Math.max(0, -rect.top / total));
      const n = Math.round(p * tiles.length);
      tiles.forEach((t, i) => {
        const vis = i < n;
        t.style.transform = vis
          ? "translate(0,0) rotate(0deg)"
          : "translate(20px,-480px) rotate(-18deg)";
        t.style.opacity = vis ? "1" : "0";
      });
      if (cue) cue.style.opacity = p >= 1 ? "0" : "1";
    };

    // Apply the initial (hidden) state with transitions still OFF, so the tiles
    // snap straight to hidden on load instead of visibly animating away from
    // their no-JS visible position. Enable the transition on the next frame,
    // once that hidden state has painted, so only scroll-driven reveals animate.
    update();
    const enable = requestAnimationFrame(() => {
      tiles.forEach((t) => {
        t.style.transition =
          "transform 0.7s cubic-bezier(.34,1.56,.64,1), opacity 0.35s ease";
      });
    });

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(enable);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
