// Tiny paper-and-ink sound kit, synthesized with Web Audio (no audio files).
// Quiet by design; muting is remembered in localStorage.

let ctx = null;
let muted = localStorage.getItem("ff-muted") === "1";

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function noise(dur, { freq = 1200, q = 0.8, gain = 0.15, type = "bandpass", attack = 0.005 } = {}) {
  const a = ac(), len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(0, a.currentTime);
  g.gain.linearRampToValueAtTime(gain, a.currentTime + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}

function tone(freq, dur, { gain = 0.08, type = "sine", slideTo = null, delay = 0 } = {}) {
  const a = ac(), t = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  get muted() { return muted; },
  toggle() { muted = !muted; localStorage.setItem("ff-muted", muted ? "1" : "0"); return muted; },
  paper() { if (!muted) noise(0.35, { freq: 2400, q: 0.6, gain: 0.12, attack: 0.04 }); },
  stamp() { if (!muted) { noise(0.18, { freq: 180, q: 1.2, gain: 0.5, type: "lowpass" }); tone(90, 0.18, { gain: 0.12 }); } },
  charge() { if (!muted) tone(260, 0.9, { gain: 0.05, type: "triangle", slideTo: 620 }); },
  pop() { if (!muted) { tone(660, 0.12, { gain: 0.06 }); tone(990, 0.16, { gain: 0.05, delay: 0.08 }); } },
  chime() { if (!muted) [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.5, { gain: 0.05, delay: i * 0.09 })); },
  tick() { if (!muted) tone(1400, 0.04, { gain: 0.015, type: "square" }); },
};

export const buzz = (pattern) => { try { navigator.vibrate?.(pattern); } catch {} };
