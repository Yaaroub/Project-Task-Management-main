"use client";
import Link from "next/link";
import { motion } from "framer-motion";

export const PRODUCT = "Nahtbord";
export const TAGLINE = "Alles an Bord.";

// Nahtbord mark: a board with three columns; a brass seam (stitches) runs across it and ends in a check.
// FUNKNAHT palette (petrol, fjord, brass), but the tool's own sign.
export function NahtbordMark({ size = 30, animate = true }) {
  const t = (delay, duration = 0.6) => (animate ? { delay, duration, ease: [0.16, 1, 0.3, 1] } : { duration: 0 });
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="mark">
      <defs>
        <linearGradient id="nb-board" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#124248" /><stop offset="1" stopColor="#0A2427" /></linearGradient>
        <linearGradient id="nb-seam" x1="0" x2="1"><stop offset="0" stopColor="#C9A56E" /><stop offset="1" stopColor="#E7D2A8" /></linearGradient>
      </defs>
      <rect x="1.5" y="3.5" width="29" height="25" rx="6" fill="url(#nb-board)" stroke="#2A5C61" />
      {/* column dividers */}
      {[11.5, 20.5].map((x, i) => (
        <motion.line key={x} x1={x} y1="7" x2={x} y2="25" stroke="#2A5C61" strokeWidth="1.2"
          initial={animate ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={t(0.1 + i * 0.1)} />
      ))}
      {/* cards: fewer in "open", more in "done" */}
      {[[4.5, 8], [13.5, 8], [13.5, 12.5], [22.5, 8], [22.5, 12.5]].map(([x, y], i) => (
        <motion.rect key={i} x={x} y={y} width="5" height="3" rx="1" fill="#7CC3C4" opacity=".55"
          initial={animate ? { opacity: 0, y: -3 } : false} animate={{ opacity: 0.55, y: 0 }} transition={t(0.2 + i * 0.05, 0.4)} />
      ))}
      {/* the seam: stitched line ending in a check */}
      <motion.path d="M3.8 21 L6.6 21 M9.4 21 L12.2 21 M15 21 L17.8 21 M20.6 21 L23.6 24 L29.6 15.4" fill="none" stroke="url(#nb-seam)"
        strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"
        initial={animate ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={t(0.45, 0.8)} />
    </svg>
  );
}

export function Wordmark() {
  return <span className="wordmark"><b>Naht</b><span>bord</span></span>;
}

export function Brand({ href = "/" }) {
  return (
    <Link className="brand" href={href} aria-label={`${PRODUCT} – zur Übersicht`}>
      <NahtbordMark />
      <Wordmark />
    </Link>
  );
}
