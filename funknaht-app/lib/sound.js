"use client";
// Alarm sounds made with the Web Audio API – no sound files needed.
// Browsers only allow sound after the person has clicked or typed on the page once; unlockAudio() is called on the first interaction.
let ctx = null;
const audio = () => {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  ctx ??= new Ctx();
  return ctx;
};
export function unlockAudio() { const c = audio(); if (c && c.state === "suspended") c.resume().catch(() => {}); }
export const audioReady = () => !!ctx && ctx.state === "running";

function tone(c, { freq, start, length, type = "sine", volume = 0.25, decay = false }) {
  const osc = c.createOscillator(), gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + (decay ? length * 3 : length));
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + (decay ? length * 3 : length) + 0.05);
}

// One pattern, about 1.5 seconds.
export function playSound(name = "klassisch") {
  const c = audio();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  const t = c.currentTime + 0.02;
  if (name === "sanft") {
    tone(c, { freq: 523.25, start: t, length: 0.5, volume: 0.3, decay: true });
    tone(c, { freq: 783.99, start: t + 0.45, length: 0.6, volume: 0.25, decay: true });
  } else if (name === "digital") {
    for (let i = 0; i < 4; i++) tone(c, { freq: 2093, start: t + i * 0.18, length: 0.09, type: "square", volume: 0.12 });
  } else {
    for (let i = 0; i < 8; i++) tone(c, { freq: i % 2 ? 1318.5 : 987.8, start: t + i * 0.09, length: 0.07, type: "triangle", volume: 0.22 });
    for (let i = 0; i < 8; i++) tone(c, { freq: i % 2 ? 1318.5 : 987.8, start: t + 0.85 + i * 0.09, length: 0.07, type: "triangle", volume: 0.22 });
  }
}
