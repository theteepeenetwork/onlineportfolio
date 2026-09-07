"use client";

import { useEffect } from "react";

// Progressive enhancement for the landing page. Two effects, one island:
//
//  1. The hero: the nine work tiles are visible by default (no-JS / reduced-
//     motion friendly); this hides them and reveals them one-by-one as the
//     reader scrolls the 230vh hero track, raises a honey glow in the base of
//     the jar as progress climbs, and fades the "scroll to fill" cue at the end.
//  2. The approval-queue card further down settles its rows and pops its tick
//     the first time it scrolls into view.
//
// Both are decoration over markup that already reads correctly without them.
export function ScrollFill() {
  useEffect(() => {
    const cleanups: Array<() => void> = [];

    // ── The queue card ─────────────────────────────────────────────────────
    // Set up first, and with no bail-outs: the animation it enables is covered
    // by the reduced-motion guard in globals.css, which lands it on its final
    // frame — a settled queue — rather than skipping it.
    const queue = document.querySelector<HTMLElement>("[data-queue]");
    if (queue && typeof IntersectionObserver !== "undefined") {
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.setAttribute("data-queue-run", "1");
            io.unobserve(entry.target);
          }
        },
        { threshold: 0.35 },
      );
      io.observe(queue);
      cleanups.push(() => io.disconnect());
    }

    // ── The hero ───────────────────────────────────────────────────────────
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // On phones (≤760px) the hero track is static rather than sticky, so the
    // scroll-fill effect makes no sense — the nine tiles simply stay visible.
    const mobile = window.innerWidth <= 760;
    // And the same again for a SHORT window. Past `max-height: 760px` the CSS
    // un-sticks the track for the same reason it does on a phone, and hiding
    // the tiles inside a hero that no longer scrolls would leave the jar
    // permanently empty. The guard has to be in both places or it is in neither.
    const short = window.matchMedia("(max-height: 760px)").matches;
    if (!reduce && !mobile && !short) cleanups.push(heroFill());

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return null;
}

function heroFill(): () => void {
  const tiles = Array.from(document.querySelectorAll<SVGGElement>("[data-scroll-tile]"));
  tiles.forEach((t) => {
    t.style.transformBox = "fill-box";
    t.style.transformOrigin = "center";
  });

  const track = document.getElementById("hero-track");
  const cue = document.querySelector<HTMLElement>("[data-scroll-cue]");
  const glow = document.querySelector<SVGPathElement>("[data-fill-glow]");
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
    // Honey rising in the base. Capped low on purpose: it is a hint that the
    // jar is filling, not a second progress bar competing with the tiles.
    if (glow) glow.style.opacity = String(0.16 * p);
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
}
