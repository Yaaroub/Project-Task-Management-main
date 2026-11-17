"use client";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";

// Motion graphic about the tool itself: cards travel across a board (Offen → In Arbeit → Erledigt),
// get checked off, the progress ring fills, a timer runs and milestones light up on a timeline.
const COLS = [[660, "OFFEN"], [782, "IN ARBEIT"], [904, "ERLEDIGT"]];
const CW = 110, STEP = 122, LOOP = 7.5;
const times = [0, 0.12, 0.3, 0.52, 0.7, 0.92, 1];

function MovingCard({ row, delay, color }) {
  const y = 92 + row * 50;
  const t = { duration: LOOP, delay, repeat: Infinity, ease: [0.65, 0, 0.35, 1], times };
  return (
    <motion.g initial={{ x: 0, opacity: 0 }} animate={{ x: [0, 0, STEP, STEP, STEP * 2, STEP * 2, STEP * 2], opacity: [0, 1, 1, 1, 1, 1, 0] }} transition={t}>
      <rect x={COLS[0][0] + 6} y={y} width={CW - 12} height="38" rx="6" fill="#0F2C30" stroke="#2A5C61" />
      <rect x={COLS[0][0] + 6} y={y} width="3" height="38" rx="1.5" fill={color} />
      <rect x={COLS[0][0] + 16} y={y + 10} width="58" height="5" rx="2.5" fill="#A9C6C4" opacity=".75" />
      <rect x={COLS[0][0] + 16} y={y + 22} width="36" height="4" rx="2" fill="#5A7174" />
      <motion.path d={`M ${COLS[0][0] + 80} ${y + 19} l 5 5 l 9 -10`} fill="none" stroke="#7CC48E" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
        animate={{ pathLength: [0, 0, 0, 0, 0, 1, 1], opacity: [0, 0, 0, 0, 1, 1, 0] }} transition={t} />
    </motion.g>
  );
}

// compact: shows only the board scene, fitted to the top of a narrow panel (login page).
export default function HeroMotion({ compact = false }) {
  const mx = useMotionValue(0), my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 18 }), sy = useSpring(my, { stiffness: 60, damping: 18 });
  const tx = useTransform(sx, v => v * 14), ty = useTransform(sy, v => v * 8);
  const bx = useTransform(sx, v => v * -8), by = useTransform(sy, v => v * -5);

  useEffect(() => {
    const move = e => { mx.set(e.clientX / window.innerWidth - 0.5); my.set(e.clientY / window.innerHeight - 0.5); };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [mx, my]);

  const ring = 2 * Math.PI * 24;
  return (
    <svg className={`hero__motion ${compact ? "hero__motion--compact" : ""}`} aria-hidden="true"
      viewBox={compact ? "640 30 450 280" : "0 0 1100 340"} preserveAspectRatio={compact ? "xMidYMin meet" : "xMaxYMid slice"}>
      <defs>
        <pattern id="hm-dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="#2A5C61" /></pattern>
        <radialGradient id="hm-glow"><stop offset="0" stopColor="#7CC3C4" stopOpacity=".22" /><stop offset="1" stopColor="#7CC3C4" stopOpacity="0" /></radialGradient>
        <linearGradient id="hm-line" x1="0" x2="1"><stop offset="0" stopColor="#C9A56E" stopOpacity="0" /><stop offset=".3" stopColor="#D8BD8A" /><stop offset="1" stopColor="#C9A56E" /></linearGradient>
      </defs>

      <motion.rect width="1100" height="340" fill="url(#hm-dots)" opacity=".6" style={{ x: bx, y: by }} />
      <circle cx="860" cy="170" r="260" fill="url(#hm-glow)" />

      <motion.g style={{ x: tx, y: ty }}>
        {/* Board */}
        {COLS.map(([x, label], i) => (
          <motion.g key={label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.12, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
            <rect x={x} y="48" width={CW} height="240" rx="10" fill="#082023" stroke="#1E4247" />
            <circle cx={x + 14} cy="68" r="3.5" fill={["#9AA7C4", "#C9A56E", "#7CC48E"][i]} />
            <text x={x + 24} y="72" fill="#7F9997" fontSize="10" fontFamily="ui-monospace, Consolas, monospace" letterSpacing="1.4">{label}</text>
            {/* resting cards */}
            {[0, 1, 2].slice(0, 3 - i).map(r => (
              <rect key={r} x={x + 6} y={242 - r * 0} width={CW - 12} height="34" rx="6" fill="#0B2427" stroke="#1E4247" opacity={0.5} transform={`translate(0 ${-r * 4})`} />
            ))}
          </motion.g>
        ))}
        <MovingCard row={0} delay={0.8} color="#E0A866" />
        <MovingCard row={1} delay={0.8 + LOOP / 3} color="#7CC3C4" />
        <MovingCard row={2} delay={0.8 + (LOOP * 2) / 3} color="#C9A56E" />

        {/* Progress ring */}
        <g transform="translate(1056 76)">
          <circle r="24" fill="#082023" stroke="#1E4247" strokeWidth="6" />
          <motion.circle r="24" fill="none" stroke="#C9A56E" strokeWidth="6" strokeLinecap="round" strokeDasharray={ring} transform="rotate(-90)"
            initial={{ strokeDashoffset: ring }} animate={{ strokeDashoffset: [ring, ring * 0.66, ring * 0.33, ring * 0.05, ring * 0.05] }}
            transition={{ duration: LOOP * 1.5, repeat: Infinity, ease: "easeInOut", times: [0, 0.3, 0.6, 0.85, 1] }} />
          <motion.path d="M -8 0 l 5 5 l 10 -11" fill="none" stroke="#D8BD8A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
            animate={{ pathLength: [0, 0, 1, 1, 0] }} transition={{ duration: LOOP * 1.5, repeat: Infinity, times: [0, 0.82, 0.88, 0.97, 1] }} />
        </g>

        {/* Timer (time tracking) */}
        <g transform="translate(1056 168)">
          <circle r="22" fill="#082023" stroke="#2A5C61" />
          <rect x="-4" y="-30" width="8" height="5" rx="2" fill="#2A5C61" />
          <motion.line x1="0" y1="0" x2="0" y2="-15" stroke="#7CC3C4" strokeWidth="2.4" strokeLinecap="round"
            animate={{ rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: "linear" }} />
          <circle r="2.6" fill="#D8BD8A" />
        </g>

        {/* Calendar day */}
        <motion.g transform="translate(1034 222)" animate={{ y: [0, -4, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}>
          <rect width="44" height="46" rx="7" fill="#082023" stroke="#2A5C61" />
          <rect width="44" height="13" rx="7" fill="#C9A56E" />
          <rect y="7" width="44" height="6" fill="#C9A56E" />
          <text x="22" y="37" textAnchor="middle" fill="#E4EEED" fontSize="17" fontWeight="700" fontFamily="system-ui">{new Date().getDate()}</text>
        </motion.g>
      </motion.g>

      {/* Timeline with milestones (projects & deadlines) */}
      {!compact && <>
      <motion.path d="M -20 314 C 260 296, 520 326, 760 312 S 1000 300, 1120 306" fill="none" stroke="url(#hm-line)" strokeWidth="2"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2.2, ease: [0.16, 1, 0.3, 1] }} />
      {[[300, 308], [560, 318], [760, 312], [960, 304]].map(([x, y], i) => (
        <motion.circle key={x} cx={x} cy={y} r="5" fill="#04171A" stroke="#C9A56E" strokeWidth="2"
          animate={{ fill: ["#04171A", "#04171A", "#C9A56E", "#C9A56E", "#04171A"] }}
          transition={{ duration: LOOP * 1.5, repeat: Infinity, times: [0, 0.15 + i * 0.18, 0.2 + i * 0.18, 0.95, 1] }} />
      ))}
      </>}
    </svg>
  );
}
