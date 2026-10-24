// Future Feed's own hand-drawn icon set. Shapes are simple geometry on a 64x64 grid;
// rough.js (MIT, vendored) gives them wobbly ink outlines and pastel fills.
// Fixed seeds keep every icon looking the same on every render.
import rough from "./vendor/rough.esm.js";

const INK = "#2b2420";
const C = {
  orange: "#f6a15b", cream: "#fff4e0", pink: "#f7b6c2", rose: "#ef7f97", green: "#9ed39b", blue: "#9cc6f0",
  yellow: "#ffd86b", brown: "#c98d5e", tan: "#e9c79c", gray: "#bdb6ae", dark: "#3a3330", white: "#ffffff",
  lilac: "#c9b5f0", sky: "#cfe7fb",
};

const base = { stroke: INK, strokeWidth: 2, roughness: 1.3, bowing: 1.1, fillStyle: "solid" };
const o = (fill, extra = {}) => ({ ...base, fill, ...extra });
const ink = (extra = {}) => ({ ...base, fill: INK, roughness: 0.6, ...extra });
const line = (extra = {}) => ({ ...base, strokeWidth: 1.8, ...extra });

const eyes = (rc, y = 36, dx = 8, r = 4.4) => [rc.circle(32 - dx, y, r, ink()), rc.circle(32 + dx, y, r, ink())];
const smile = (rc, y = 45) => rc.path(`M27 ${y} Q32 ${y + 4} 37 ${y}`, line({ fill: "none" }));

const DRAW = {
  // ---------- habits ----------
  guitar: (rc) => [
    rc.rectangle(29, 4, 6, 26, o(C.brown, { seed: 3 })),
    rc.rectangle(27, 1, 10, 7, o(C.dark, { seed: 4 })),
    rc.circle(32, 34, 20, o(C.orange, { seed: 5 })),
    rc.circle(32, 47, 26, o(C.orange, { seed: 6 })),
    rc.circle(32, 41, 8, ink({ seed: 7 })),
    rc.rectangle(26, 52, 12, 3, o(C.dark, { seed: 8 })),
    rc.line(31, 6, 31, 52, line({ strokeWidth: 0.8, seed: 9 })),
    rc.line(33, 6, 33, 52, line({ strokeWidth: 0.8, seed: 10 })),
  ],
  spanish: (rc) => [
    rc.path("M8 13 Q8 6 15 6 L49 6 Q56 6 56 13 L56 35 Q56 42 49 42 L28 42 L16 54 L19 42 L15 42 Q8 42 8 35 Z", o(C.yellow, { seed: 11 })),
    rc.line(16, 30, 48, 30, line({ stroke: C.rose, strokeWidth: 3, seed: 12 })),
    text("¡Hola!", 32, 26, 15),
  ],
  running: (rc) => [
    rc.path("M8 42 Q8 31 16 30 L26 28 L33 19 L42 21 L44 31 Q55 32 58 40 L58 44 L8 44 Z", o(C.pink, { seed: 13 })),
    rc.rectangle(7, 44, 52, 7, o(C.white, { seed: 14 })),
    rc.line(30, 26, 38, 29, line({ seed: 15 })), rc.line(28, 31, 37, 34, line({ seed: 16 })),
    rc.line(2, 26, 12, 26, line({ seed: 17 })), rc.line(0, 33, 8, 33, line({ seed: 18 })),
  ],
  reading: (rc) => [
    rc.path("M32 16 Q20 9 6 13 L6 51 Q20 47 32 54 Z", o(C.cream, { seed: 19 })),
    rc.path("M32 16 Q44 9 58 13 L58 51 Q44 47 32 54 Z", o(C.blue, { seed: 20 })),
    rc.line(11, 22, 26, 22, line({ seed: 21 })), rc.line(11, 29, 26, 30, line({ seed: 22 })), rc.line(11, 36, 24, 37, line({ seed: 23 })),
    rc.line(38, 22, 53, 21, line({ seed: 24 })), rc.line(38, 30, 53, 29, line({ seed: 25 })),
  ],
  saving: (rc) => [
    rc.circle(32, 11, 13, o(C.yellow, { seed: 26 })),
    rc.ellipse(30, 39, 44, 32, o(C.pink, { seed: 27 })),
    rc.polygon([[18, 27], [20, 16], [28, 25]], o(C.rose, { seed: 28 })),
    rc.ellipse(52, 40, 9, 12, o(C.rose, { seed: 29 })),
    rc.rectangle(17, 52, 6, 7, o(C.pink, { seed: 30 })), rc.rectangle(36, 52, 6, 7, o(C.pink, { seed: 31 })),
    rc.circle(41, 34, 3.5, ink({ seed: 32 })), rc.line(25, 25, 34, 25, line({ strokeWidth: 2.5, seed: 33 })),
  ],
  custom: (rc) => [
    rc.path("M32 4 L37 25 L58 30 L37 35 L32 58 L27 35 L6 30 L27 25 Z", o(C.yellow, { seed: 34 })),
    rc.path("M52 6 L54 12 L60 14 L54 16 L52 22 L50 16 L44 14 L50 12 Z", o(C.lilac, { seed: 35 })),
  ],

  // ---------- future-self characters ----------
  fox: (rc) => [
    rc.polygon([[11, 30], [13, 6], [29, 18]], o(C.orange, { seed: 40 })),
    rc.polygon([[53, 30], [51, 6], [35, 18]], o(C.orange, { seed: 41 })),
    rc.circle(32, 37, 46, o(C.orange, { seed: 42 })),
    rc.path("M12 40 Q22 52 32 47 Q42 52 52 40 Q48 58 32 59 Q16 58 12 40 Z", o(C.cream, { seed: 43 })),
    ...eyes(rc, 34), rc.circle(32, 46, 5, ink({ seed: 44 })),
  ],
  panda: (rc) => [
    rc.circle(14, 15, 15, ink({ seed: 45, roughness: 1.2 })), rc.circle(50, 15, 15, ink({ seed: 46, roughness: 1.2 })),
    rc.circle(32, 36, 48, o(C.white, { seed: 47 })),
    rc.ellipse(22, 34, 11, 14, ink({ seed: 48 })), rc.ellipse(42, 34, 11, 14, ink({ seed: 49 })),
    rc.circle(23, 33, 3, o(C.white, { stroke: "none", seed: 50 })), rc.circle(41, 33, 3, o(C.white, { stroke: "none", seed: 51 })),
    rc.ellipse(32, 45, 7, 5, ink({ seed: 52 })), smile(rc, 49),
  ],
  cat: (rc) => [
    rc.polygon([[10, 28], [12, 5], [28, 17]], o(C.gray, { seed: 53 })),
    rc.polygon([[54, 28], [52, 5], [36, 17]], o(C.gray, { seed: 54 })),
    rc.circle(32, 37, 46, o(C.gray, { seed: 55 })),
    ...eyes(rc, 34), rc.polygon([[29, 42], [35, 42], [32, 46]], o(C.rose, { seed: 56 })),
    rc.line(4, 42, 18, 44, line({ seed: 57 })), rc.line(4, 49, 18, 47, line({ seed: 58 })),
    rc.line(60, 42, 46, 44, line({ seed: 59 })), rc.line(60, 49, 46, 47, line({ seed: 60 })),
  ],
  bunny: (rc) => [
    rc.ellipse(23, 14, 11, 28, o(C.white, { seed: 61 })), rc.ellipse(41, 14, 11, 28, o(C.white, { seed: 62 })),
    rc.ellipse(23, 15, 4, 17, o(C.pink, { stroke: "none", seed: 63 })), rc.ellipse(41, 15, 4, 17, o(C.pink, { stroke: "none", seed: 64 })),
    rc.circle(32, 40, 42, o(C.white, { seed: 65 })),
    ...eyes(rc, 38, 8), rc.circle(32, 45, 4, o(C.rose, { seed: 66 })),
    rc.circle(18, 47, 6, o(C.pink, { stroke: "none", seed: 67 })), rc.circle(46, 47, 6, o(C.pink, { stroke: "none", seed: 68 })),
  ],
  bear: (rc) => [
    rc.circle(14, 15, 16, o(C.brown, { seed: 69 })), rc.circle(50, 15, 16, o(C.brown, { seed: 70 })),
    rc.circle(32, 36, 48, o(C.brown, { seed: 71 })),
    rc.ellipse(32, 45, 20, 15, o(C.tan, { seed: 72 })),
    ...eyes(rc, 32), rc.ellipse(32, 42, 7, 5, ink({ seed: 73 })), smile(rc, 47),
  ],
  koala: (rc) => [
    rc.circle(11, 20, 22, o(C.gray, { seed: 74 })), rc.circle(53, 20, 22, o(C.gray, { seed: 75 })),
    rc.circle(11, 20, 11, o(C.pink, { stroke: "none", seed: 76 })), rc.circle(53, 20, 11, o(C.pink, { stroke: "none", seed: 77 })),
    rc.circle(32, 38, 42, o(C.gray, { seed: 78 })),
    ...eyes(rc, 34, 9), rc.ellipse(32, 44, 10, 13, ink({ seed: 79 })),
  ],
  frog: (rc) => [
    rc.circle(19, 17, 18, o(C.green, { seed: 80 })), rc.circle(45, 17, 18, o(C.green, { seed: 81 })),
    rc.ellipse(32, 40, 54, 38, o(C.green, { seed: 82 })),
    rc.circle(19, 17, 9, o(C.white, { seed: 83 })), rc.circle(45, 17, 9, o(C.white, { seed: 84 })),
    rc.circle(19, 17, 4, ink({ seed: 85 })), rc.circle(45, 17, 4, ink({ seed: 86 })),
    rc.path("M20 44 Q32 54 44 44", line({ fill: "none", seed: 87 })),
    rc.circle(14, 44, 6, o(C.pink, { stroke: "none", seed: 88 })), rc.circle(50, 44, 6, o(C.pink, { stroke: "none", seed: 89 })),
  ],
  lion: (rc) => [
    rc.circle(32, 33, 60, o(C.brown, { fillStyle: "zigzag", fillWeight: 2, hachureGap: 3, seed: 90 })),
    rc.circle(32, 34, 38, o(C.yellow, { seed: 91 })),
    ...eyes(rc, 31, 7), rc.polygon([[28, 39], [36, 39], [32, 44]], ink({ seed: 92 })), smile(rc, 46),
  ],
  penguin: (rc) => [
    rc.circle(32, 34, 52, ink({ seed: 93, roughness: 1.2 })),
    rc.path("M32 22 Q20 12 16 26 Q12 46 32 56 Q52 46 48 26 Q44 12 32 22 Z", o(C.white, { seed: 94 })),
    ...eyes(rc, 33, 8), rc.polygon([[27, 40], [37, 40], [32, 47]], o(C.orange, { seed: 95 })),
  ],
  person: (rc) => [
    rc.circle(32, 36, 44, o(C.tan, { seed: 96 })),
    rc.path("M10 32 Q8 8 32 8 Q56 8 54 32 Q48 18 32 20 Q18 18 10 32 Z", o(C.dark, { seed: 97 })),
    ...eyes(rc, 36, 8), smile(rc, 45),
    rc.circle(18, 44, 6, o(C.pink, { stroke: "none", seed: 98 })), rc.circle(46, 44, 6, o(C.pink, { stroke: "none", seed: 99 })),
  ],

  // ---------- interface ----------
  lock: (rc) => [
    rc.path("M20 30 L20 20 Q20 8 32 8 Q44 8 44 20 L44 30", line({ fill: "none", strokeWidth: 3.5, seed: 100 })),
    rc.rectangle(12, 28, 40, 30, o(C.yellow, { seed: 101 })),
    rc.circle(32, 41, 7, ink({ seed: 102 })), rc.line(32, 43, 32, 50, line({ strokeWidth: 3, seed: 103 })),
  ],
  crown: (rc) => [
    rc.path("M6 48 L10 18 L22 34 L32 12 L42 34 L54 18 L58 48 Z", o(C.yellow, { seed: 104 })),
    rc.circle(32, 38, 7, o(C.rose, { seed: 105 })), rc.rectangle(6, 48, 52, 8, o(C.orange, { seed: 106 })),
  ],
  camera: (rc) => [
    rc.rectangle(6, 18, 52, 36, o(C.sky, { seed: 107 })), rc.rectangle(22, 10, 20, 9, o(C.blue, { seed: 108 })),
    rc.circle(32, 36, 22, o(C.white, { seed: 109 })), rc.circle(32, 36, 10, ink({ seed: 110 })),
  ],
  flame: (rc) => [
    rc.path("M32 4 Q46 20 48 34 Q50 56 32 58 Q14 56 16 38 Q18 28 26 22 Q26 32 32 34 Q30 18 32 4 Z", o(C.orange, { seed: 111 })),
    rc.path("M32 30 Q42 40 40 48 Q38 56 32 56 Q24 55 25 46 Q27 38 32 30 Z", o(C.yellow, { seed: 112 })),
  ],
  house: (rc) => [
    rc.polygon([[8, 30], [32, 8], [56, 30]], o(C.rose, { seed: 115 })),
    rc.rectangle(14, 30, 36, 26, o(C.cream, { seed: 116 })),
    rc.rectangle(27, 40, 10, 16, o(C.brown, { seed: 117 })),
  ],
  flag: (rc) => [
    rc.line(18, 6, 18, 60, line({ strokeWidth: 3, seed: 118 })),
    rc.path("M18 8 L54 16 L18 28 Z", o(C.rose, { seed: 119 })),
    rc.ellipse(18, 59, 26, 7, o(C.green, { seed: 120 })),
  ],
  tree: (rc) => [
    rc.rectangle(28, 38, 8, 20, o(C.brown, { seed: 121 })),
    rc.circle(32, 26, 34, o(C.green, { seed: 122 })),
  ],
  storm: (rc) => [
    rc.ellipse(24, 28, 30, 22, o(C.gray, { seed: 123 })), rc.ellipse(40, 24, 32, 26, o(C.gray, { seed: 124 })),
    rc.ellipse(32, 34, 46, 18, o(C.gray, { seed: 125 })),
    rc.path("M32 40 L26 52 L33 52 L28 62", line({ stroke: "#e3a400", strokeWidth: 3, fill: "none", seed: 126 })),
    rc.line(16, 44, 13, 52, line({ stroke: C.blue, seed: 127 })), rc.line(46, 44, 43, 52, line({ stroke: C.blue, seed: 128 })),
  ],
  check: (rc) => [rc.path("M10 34 L26 50 L56 14", line({ fill: "none", strokeWidth: 5, seed: 113 }))],
  play: (rc) => [rc.polygon([[18, 10], [54, 32], [18, 54]], o(C.white, { seed: 114 }))],
};

function text(t, x, y, size) {
  return { text: t, x, y, size };
}

const CACHE = {};

export function renderAll() {
  const host = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const rc = rough.svg(host);
  for (const [name, draw] of Object.entries(DRAW)) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 64 64");
    svg.setAttribute("aria-hidden", "true");
    for (const part of draw(rc)) {
      if (part.text) {
        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        Object.entries({ x: part.x, y: part.y, "text-anchor": "middle", "font-size": part.size, "font-family": "Caveat, 'Comic Sans MS', cursive", "font-weight": 700, fill: INK })
          .forEach(([k, v]) => t.setAttribute(k, v));
        t.textContent = part.text;
        svg.appendChild(t);
      } else {
        svg.appendChild(part);
      }
    }
    CACHE[name] = svg.outerHTML;
  }
}

/** Inline SVG markup for a named icon, e.g. ico("guitar"). */
export function ico(name, cls = "") {
  return `<span class="ico ${cls}">${CACHE[name] || CACHE.custom || ""}</span>`;
}

export const HABIT_ICON = (key) => (key in DRAW && !["custom"].includes(key) ? key : "custom");
export const CHARACTER_ICON = { "🦊": "fox", "🐼": "panda", "🐱": "cat", "🐰": "bunny", "🐻": "bear", "🐨": "koala",
  "🐸": "frog", "🦁": "lion", "🐧": "penguin", "🙂": "person" };
