// Walk inside, in 3D: a needle-felted dollhouse cut open at the front (three.js).
// Every surface wears real felt: a patch of wool photographed in the room pictures (static/art/tex_felt.jpg),
// tinted to each colour, on soft rounded shapes. The house stands on a stone base in a felt meadow;
// every floor is the full width of the house, a felt staircase on the left climbs from floor to floor,
// and your little self walks room to room while the camera follows.
import * as THREE from "./vendor/three.module.min.js";

const RW = 6, D = 6, H = 4.2, SLAB = .45, SW = 4.6;  // room width, depth, height; slab; stairwell width
const FLOOR = H + SLAB, TILE = 2.6;                  // one felt swatch covers about 2.6 units

// ---------- felt ----------
let FELT = null;  // the grey wool swatch (an Image)
const texCache = {}, matCache = {};
function feltTexture(hex, wood) {
  const key = hex + (wood ? "w" : "");
  if (texCache[key]) return texCache[key];
  const c = document.createElement("canvas"); c.width = c.height = 512;
  const g = c.getContext("2d");
  g.drawImage(FELT, 0, 0, 512, 512);
  g.globalCompositeOperation = "multiply"; g.fillStyle = hex; g.fillRect(0, 0, 512, 512);
  if (wood) {  // felt floorboards: soft darker seams
    g.strokeStyle = "rgba(120,80,50,.45)"; g.lineWidth = 5;
    for (let y = 0; y <= 512; y += 128) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
    [[90, 0], [330, 128], [200, 256], [430, 384]].forEach(([x, y]) => { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 128); g.stroke(); });
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return (texCache[key] = t);
}
let BUMP = null;
function felt(hex, wood = false) {
  const key = hex + (wood ? "w" : "");
  if (matCache[key]) return matCache[key];
  if (!BUMP) { BUMP = new THREE.Texture(FELT); BUMP.wrapS = BUMP.wrapT = THREE.MirroredRepeatWrapping; BUMP.needsUpdate = true; }
  return (matCache[key] = new THREE.MeshPhysicalMaterial({
    map: feltTexture(hex, wood), bumpMap: BUMP, bumpScale: 2.2, roughness: 1, metalness: 0,
    sheen: .9, sheenRoughness: .6, sheenColor: new THREE.Color(hex).lerp(new THREE.Color("#ffffff"), .5),
  }));
}

// soft rounded shapes; texture laid in world units so the fibres are the same size everywhere
function worldUV(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const [u, v] = ax >= ay && ax >= az ? [p.getZ(i), p.getY(i)] : ay >= az ? [p.getX(i), p.getZ(i)] : [p.getX(i), p.getY(i)];
    uv.setXY(i, u / TILE, v / TILE);
  }
  uv.needsUpdate = true;
  return geo;
}
function roundGeo(w, h, d, r) {
  r = Math.min(r, w / 2 - .001, h / 2 - .001, d / 2 - .001);
  const seg = (x) => Math.max(2, Math.min(10, Math.round(x / .5) + 2));
  const geo = new THREE.BoxGeometry(w, h, d, seg(w), seg(h), seg(d));
  const p = geo.attributes.position, v = new THREE.Vector3(), inner = new THREE.Vector3(), half = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    inner.set(THREE.MathUtils.clamp(v.x, -half.x, half.x), THREE.MathUtils.clamp(v.y, -half.y, half.y), THREE.MathUtils.clamp(v.z, -half.z, half.z));
    v.sub(inner); if (v.lengthSq() > 0) v.setLength(r);
    p.setXYZ(i, inner.x + v.x, inner.y + v.y, inner.z + v.z);
  }
  geo.computeVertexNormals();
  return worldUV(geo);
}
function block(w, h, d, hex, r = .1, wood = false) {
  const m = new THREE.Mesh(roundGeo(w, h, d, r), felt(hex, wood)); m.castShadow = m.receiveShadow = true;
  return Math.max(w, h, d) < 3 && !wood ? fuzz(m, hex, Math.min(w, h, d)) : m;  // small felt things get a fuzzy halo
}
// the halo of loose fibres that makes felt look like felt: a few see-through shells just outside small things
let FUZZ = null;
function fuzzTexture() {
  if (FUZZ) return FUZZ;
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d"); g.fillStyle = "#000"; g.fillRect(0, 0, 256, 256); g.lineCap = "round";
  for (let i = 0; i < 2200; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, a = Math.random() * 7, l = 2 + Math.random() * 7;
    g.strokeStyle = `rgba(255,255,255,${.35 + Math.random() * .6})`; g.lineWidth = .6 + Math.random() * .8;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 1.3) * l * .6, y + Math.sin(a + 1.3) * l * .6, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  FUZZ = new THREE.CanvasTexture(c); FUZZ.wrapS = FUZZ.wrapT = THREE.RepeatWrapping;
  return FUZZ;
}
const fuzzMats = {};
function fuzz(mesh, hex, size) {
  const shells = 3, step = Math.min(.04, size * .03);
  for (let k = 1; k <= shells; k++) {
    const key = hex + k;
    const mat = (fuzzMats[key] ||= new THREE.MeshStandardMaterial({ color: new THREE.Color(hex).lerp(new THREE.Color("#fff8ee"), .25), alphaMap: fuzzTexture(),
      transparent: true, opacity: .7 - k * .17, depthWrite: false, roughness: 1, side: THREE.FrontSide }));
    const shell = new THREE.Mesh(mesh.geometry, mat);
    shell.scale.setScalar(1 + (step * k) / Math.max(.05, size / 2));
    mesh.add(shell);
  }
  return mesh;
}
function scaleUV(geo, k) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k); return geo; }
const ball = (r, hex, sy = 1, soft = r < 3) => {
  const m = new THREE.Mesh(scaleUV(new THREE.SphereGeometry(r, 28, 18), Math.max(1, Math.round(r * 2.4 / TILE))), felt(hex)); m.scale.y = sy; m.castShadow = true;
  return soft ? fuzz(m, hex, r * 2) : m;
};
const cyl = (rt, rb, h, hex, seg = 32) => {
  const m = new THREE.Mesh(worldUV(new THREE.CylinderGeometry(rt, rb, h, seg)), felt(hex)); m.castShadow = m.receiveShadow = true;
  return Math.max(rt, rb) < 2 && h > .15 ? fuzz(m, hex, Math.max(rt, rb) * 2) : m;
};
const at = (m, x, y, z) => (m.position.set(x, y, z), m);
function rod(a, b, r, hex) {  // a felt cylinder between two points
  const dir = new THREE.Vector3().subVectors(b, a), m = cyl(r, r, dir.length(), hex, 12);
  m.position.copy(a).addScaledVector(dir, .5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

// a little felt sign with handwriting on it
function sign(text, sub) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 200;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(255,250,240,.95)"; g.beginPath(); g.roundRect(8, 8, 496, 184, 40); g.fill();
  g.strokeStyle = "#2b2420"; g.lineWidth = 6; g.stroke();
  g.fillStyle = "#2b2420"; g.textAlign = "center"; g.font = "700 76px Caveat, cursive"; g.fillText(text, 256, sub ? 100 : 122);
  if (sub) { g.font = "700 40px Nunito, sans-serif"; g.fillStyle = "#7a6d63"; g.fillText(sub, 256, 160); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t })); s.scale.set(1.5, .59, 1);
  return s;
}

// wall colours for each room style (the same moods as the room pictures)
const WALL = { room_library: "#9dbcd6", room_cafe: "#ecca72", room_studio: "#d99677", room_hall: "#e9a468", room_home: "#f3cbb2",
  room_gym: "#8dbfb9", room_garden: "#b4d19a", room_party: "#c3cfa6", room_apricot: "#f6cfa6", room_blue: "#d5e2ec",
  room_blush: "#f2cdcd", room_sage: "#d0dcbb", room: "#f2e8d5", room_empty: "#efe6d6" };
const RUG = ["#e9a0a0", "#f2bd6c", "#8fbfd2", "#a8cd97", "#cfadde"];
const WOOD = "#d6a676", BEAM = "#b98a5e", CREAM = "#f6ead6", STONE = "#bdb3a6";

function furnish(r, i, rw, photoTex) {  // felt things in one room
  const g = new THREE.Group();
  g.add(at(cyl(1.5, 1.5, .07, RUG[i % RUG.length], 40), 0, .06, -D / 2), at(cyl(1.05, 1.05, .08, "#fff4e0", 40), 0, .07, -D / 2));
  if (r.state === "full") {
    const fw = 2.3, fh = 1.7, fz = -D + .14, fy = 2.5;  // the picture frame, with the postcard photo in it
    [[0, fh / 2 + .08, fw + .36, .26], [0, -fh / 2 - .08, fw + .36, .26], [-fw / 2 - .05, 0, .26, fh + .1], [fw / 2 + .05, 0, .26, fh + .1]]
      .forEach(([x, y, w, h]) => g.add(at(block(w, h, .2, "#ead6ae", .09), x, fy + y, fz)));
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(fw - .02, fh - .02), new THREE.MeshStandardMaterial({ color: "#f6ecd8", roughness: .95 }));
    at(pic, 0, fy, fz - .03); g.add(pic);
    photoTex?.then((t) => { if (t) { pic.material.map = t; pic.material.color.set("#ffffff"); pic.material.needsUpdate = true; } });
    const chair = new THREE.Group();  // an armchair
    chair.add(at(block(1.3, .5, 1.1, "#e8b85a", .22), 0, .45, 0), at(block(1.3, 1, .34, "#e8b85a", .16), 0, .95, -.42),
      at(block(.3, .75, 1.1, "#dba548", .14), -.66, .6, 0), at(block(.3, .75, 1.1, "#dba548", .14), .66, .6, 0));
    chair.position.set(-rw / 2 + 1.25, 0, -D + 1.7); chair.rotation.y = .5; g.add(chair);
    g.add(at(cyl(.34, .26, .6, "#cf7c50"), rw / 2 - .9, .3, -D + .95));  // a pot plant
    [[0, .9, 0, .44], [-.24, 1.15, .06, .32], [.22, 1.2, -.06, .34]].forEach(([x, y, z, rr]) => g.add(at(ball(rr, "#86b06a"), rw / 2 - .9 + x, y, -D + .95 + z)));
    if (r.key) {  // a floor finished: balloons, bunting and a cake
      ["#e9a0a0", "#8fbfd2", "#f2d878"].forEach((c, k) => g.add(at(ball(.34, c, 1.15), rw / 2 - 1.5 + k * .48, 2.6 + k * .22, -D + 1.4)));
      for (let k = 0; k < 9; k++) { const f = new THREE.Mesh(new THREE.ConeGeometry(.17, .42, 3), felt(RUG[k % RUG.length])); f.rotation.x = Math.PI; g.add(at(f, -rw / 2 + .6 + k * (rw - 1.2) / 8, H - .6 - Math.sin(k / 8 * Math.PI) * .25, -D + .5)); }
      g.add(at(cyl(.48, .48, .38, "#fff4e0"), 1.6, .2, -D + 2.2), at(cyl(.32, .32, .32, "#f3b8c4"), 1.6, .55, -D + 2.2));
    }
  } else {  // still empty: moving boxes, a ladder, a paint pot
    g.add(at(block(1, .8, .9, "#c9a074", .1), rw / 2 - 1.2, .45, -D + 1.1), at(block(.8, .62, .72, "#b98d62", .1), rw / 2 - 1.3, 1.16, -D + 1.15));
    const lad = new THREE.Group();
    lad.add(at(block(.14, 2.6, .14, "#a87a52", .06), -.4, 1.3, 0), at(block(.14, 2.6, .14, "#a87a52", .06), .4, 1.3, 0));
    for (let k = 0; k < 5; k++) lad.add(at(block(.8, .12, .12, "#a87a52", .05), 0, .4 + k * .5, 0));
    lad.position.set(-rw / 2 + 1.2, 0, -D + .9); lad.rotation.x = -.16; g.add(lad);
    g.add(at(cyl(.3, .3, .42, "#ecca72"), -rw / 2 + 2.2, .22, -D + 1.4));
    if (r.state === "next") { const glow = new THREE.PointLight("#ffd27a", 7, 7, 1.6); glow.position.set(0, 2.6, -D / 2); g.add(glow); }
  }
  return g;
}

function landing(w) {  // the rest of a floor that has fewer rooms: a cosy felt landing with round windows and benches
  const g = new THREE.Group();
  for (let x = RW / 2; x < w - 1; x += RW) {
    const rim = cyl(.9, .9, .2, "#9a6a45"), pane = cyl(.72, .72, .22, "#bfe0ee");
    rim.rotation.x = pane.rotation.x = Math.PI / 2;
    g.add(at(rim, x, 2.5, -D + .12), at(pane, x, 2.5, -D + .14));
    g.add(at(block(1.6, .45, .6, "#c98f62", .15), x, .4, -D + .6), at(cyl(.28, .22, .5, "#cf7c50"), x + 1.6, .25, -D + .6), at(ball(.4, "#86b06a"), x + 1.6, .78, -D + .6));
  }
  return g;
}

function avatarMesh(av) {  // a felt little person; your photo (or character) on the face
  const g = new THREE.Group();
  const body = fuzz(new THREE.Mesh(worldUV(new THREE.CapsuleGeometry(.38, .55, 8, 20)), felt("#ef9aae")), "#ef9aae", .8); body.position.y = .68; body.castShadow = true;
  const head = ball(.42, "#fbe6d4"); head.position.y = 1.52;
  const face = document.createElement("canvas"); face.width = face.height = 256;
  const g2 = face.getContext("2d"), tex = new THREE.CanvasTexture(face); tex.colorSpace = THREE.SRGBColorSpace;
  const draw = (img) => { g2.save(); g2.beginPath(); g2.arc(128, 128, 118, 0, 7); g2.clip(); g2.drawImage(img, 0, 0, 256, 256); g2.restore(); g2.lineWidth = 12; g2.strokeStyle = "#fff6ec"; g2.beginPath(); g2.arc(128, 128, 118, 0, 7); g2.stroke(); tex.needsUpdate = true; };
  if (av?.photo) { const im = new Image(); im.onload = () => draw(im); im.src = av.photo; }
  else { g2.fillStyle = "#fbe6d4"; g2.fillRect(0, 0, 256, 256); g2.font = "170px serif"; g2.textAlign = "center"; g2.textBaseline = "middle"; g2.fillText(av?.character || "🙂", 128, 140); tex.needsUpdate = true; }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(.36, 40), new THREE.MeshStandardMaterial({ map: tex, roughness: .95 })); disc.position.set(0, 1.52, .4);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.48, 24), new THREE.MeshBasicMaterial({ color: "#3b2a1e", transparent: true, opacity: .22 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .02;
  g.add(body, head, disc, shadow, at(ball(.14, "#fbe6d4"), -.2, 1.1, .24), at(ball(.14, "#fbe6d4"), .2, 1.1, .24));
  return g;
}

function skyTexture() {  // a soft sky that fades into the meadow
  const c = document.createElement("canvas"); c.width = 16; c.height = 256;
  const g = c.getContext("2d"), grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "#a9c6d6"); grd.addColorStop(.6, "#dfe6dc"); grd.addColorStop(1, "#efe4cf");
  g.fillStyle = grd; g.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/**
 * opts: floors [{f, n, rooms:[{state, key, rn, label, sub}]}], felt (url of the wool swatch), roofColor, avatar {photo, character},
 * photo(f, s) -> url or null, onOpen(f, s), onMoved(f, s), sfx, mount (element)
 */
export async function walk3D(opts) {
  FELT = await new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = opts.felt; });
  const { floors, mount } = opts;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1;
  mount.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog("#e6e4d6", 45, 120);
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 300);
  scene.add(new THREE.HemisphereLight("#fff6e8", "#8c7458", 1.25));
  const sun = new THREE.DirectionalLight("#ffeccc", 2.3);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0005; sun.shadow.radius = 6;
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 120 });
  scene.add(sun, sun.target);
  const lamp = new THREE.PointLight("#ffe3b8", 6, 9, 1.4); scene.add(lamp);  // a warm light that follows you

  // ---------- the house: every floor is the full width; lower floors get wider rooms and a landing ----------
  const cols = Math.max(...floors.map((fl) => fl.n));
  const Wh = SW + cols * RW;                         // inside width of the house
  floors.forEach((fl) => { fl.rw = RW * Math.min(2, cols / fl.n); });
  const yOf = (i) => i * FLOOR;
  const house = new THREE.Group(); scene.add(house);
  const clickables = [];
  // the meadow, a stone base, a doorstep, felt hills and trees
  const meadow = new THREE.Mesh(worldUV(new THREE.BoxGeometry(260, .4, 260, 1, 1, 1)), felt("#97bb73")); meadow.position.y = -1.15; meadow.receiveShadow = true; scene.add(meadow);
  house.add(at(block(Wh + 1.4, .8, D + 1.4, STONE, .2), Wh / 2, -.55 - SLAB / 2, -D / 2 + .1));
  house.add(at(block(2.2, .3, 1.2, STONE, .12), SW / 2, -.8, 1.4), at(block(2.2, .3, .9, STONE, .12), SW / 2, -.5, 1.2));
  [[-30, -40, 22, "#a6c487"], [10, -55, 30, "#9bbd7f"], [55, -45, 24, "#b0cb8f"], [-60, -30, 18, "#a3c283"], [85, -30, 20, "#9fbf80"]]
    .forEach(([x, z, r, c]) => scene.add(at(ball(r, c, .35), x, -1.2, z)));
  [[-6, 4, "#86b06a"], [-9, -3, "#e2b04e"], [Wh + 5, 3, "#d98a4c"], [Wh + 8, -5, "#86b06a"], [-4, -12, "#9cc07c"]].forEach(([x, z, c]) => {
    scene.add(at(cyl(.22, .3, 2.2, "#8a5e3c"), x, 0, z), at(ball(1.5, c, 1.1), x, 2.2, z));
  });

  floors.forEach((fl, i) => {
    const y = yOf(i), top = i === floors.length - 1;
    // the floor slab (an opening over the stairs below, apart from a landing)
    if (i === 0) house.add(at(block(Wh + .5, SLAB, D + .5, BEAM, .12), Wh / 2, y - SLAB / 2, -D / 2 + .1));
    else house.add(at(block(1.5, SLAB, D + .5, BEAM, .12), .75, y - SLAB / 2, -D / 2 + .1), at(block(Wh - SW + .5, SLAB, D + .5, BEAM, .12), SW + (Wh - SW) / 2, y - SLAB / 2, -D / 2 + .1));
    // outer walls, all the way up: left, right, and the stairwell's back wall
    house.add(at(block(.4, FLOOR, D + .5, CREAM, .12), -.2, y + H / 2 - SLAB / 2, -D / 2 + .1), at(block(.4, FLOOR, D + .5, CREAM, .12), Wh + .2, y + H / 2 - SLAB / 2, -D / 2 + .1));
    house.add(at(block(SW, H, .3, "#f3e6cf", .08), SW / 2, y + H / 2, -D - .1));
    const stairFloor = new THREE.Mesh(new THREE.BoxGeometry(SW, .05, D), new THREE.MeshBasicMaterial({ visible: false }));
    stairFloor.userData = { f: i, s: -1 }; house.add(at(stairFloor, SW / 2, y + .02, -D / 2)); clickables.push(stairFloor);
    // the staircase up: solid felt steps against the back wall, a handrail on posts
    if (!top) {
      const steps = 12, run = SW - 1.8, rise = FLOOR / steps, x0 = SW - .4, z = -D + 1.15;
      for (let k = 0; k < steps; k++) house.add(at(block(run / steps + .02, rise * (k + 1), 2, k % 2 ? "#cf9f70" : "#d8ab7c", .05), x0 - (k + .5) * run / steps, y + rise * (k + 1) / 2, z));
      const a = new THREE.Vector3(x0, y + 1.05, z + 1.05), b = new THREE.Vector3(x0 - run, y + FLOOR + 1.05, z + 1.05);
      house.add(rod(a, b, .08, "#8a5a3a"));
      for (let k = 0; k <= steps; k += 3) { const px = x0 - k * run / steps; house.add(rod(new THREE.Vector3(px, y + rise * k, z + 1.05), new THREE.Vector3(px, y + rise * k + 1.05, z + 1.05), .05, "#a06c46")); }
    }
    // rooms, then a landing for whatever width is left
    fl.rooms.forEach((r, j) => {
      const rw = fl.rw, cx = SW + j * rw + rw / 2, wall = WALL[r.rn] || "#f2e8d5";
      const room = new THREE.Group(); room.position.set(cx, y, 0); house.add(room);
      room.add(at(block(rw, .1, D, r.state === "full" ? WOOD : "#dcc6a2", .03, true), 0, .05, -D / 2));
      room.add(at(block(rw, H, .3, wall, .08), 0, H / 2, -D - .1), at(block(rw, .3, .26, BEAM, .08), 0, .15, -D + .08));
      // the wall on the left, with a doorway
      room.add(at(block(.3, H, D - 3.2, wall, .08), -rw / 2, H / 2, -D + (D - 3.2) / 2), at(block(.3, H, .9, wall, .08), -rw / 2, H / 2, -.45),
        at(block(.3, H - 2.9, 2.3, wall, .08), -rw / 2, 2.9 + (H - 2.9) / 2, -2.05));
      room.add(furnish(r, j, rw, r.state === "full" ? loadPhoto(opts.photo(i, j)) : null));
      room.add(at(sign(r.label, r.sub), rw / 2 - 1.1, .55, -.5));
      const hit = new THREE.Mesh(new THREE.BoxGeometry(rw, H, D), new THREE.MeshBasicMaterial({ visible: false }));
      hit.userData = { f: i, s: j }; room.add(at(hit, 0, H / 2, -D / 2)); clickables.push(hit);
    });
    const used = SW + fl.n * fl.rw, rest = Wh - used;
    if (rest > .5) {
      const g = new THREE.Group(); g.position.set(used, y, 0); house.add(g);
      g.add(at(block(rest, .1, D, "#dcc6a2", .03, true), rest / 2, .05, -D / 2), at(block(rest, H, .3, "#efe2c8", .08), rest / 2, H / 2, -D - .1),
        at(block(.3, H - 2.9, 2.3, "#efe2c8", .08), 0, 2.9 + (H - 2.9) / 2, -2.05), at(block(.3, H, D - 3.2, "#efe2c8", .08), 0, H / 2, -D + (D - 3.2) / 2));
      g.add(landing(rest));
    }
  });
  // ceiling, roof and chimney
  const topY = yOf(floors.length);
  house.add(at(block(Wh + .9, SLAB, D + .9, BEAM, .14), Wh / 2, topY - SLAB / 2, -D / 2 + .1));
  const rise = Math.min(4.6, Wh * .22), shape = new THREE.Shape();
  shape.moveTo(-1, 0); shape.lineTo(Wh / 2, rise); shape.lineTo(Wh + 1, 0); shape.lineTo(-1, 0);
  const roof = new THREE.Mesh(worldUV(new THREE.ExtrudeGeometry(shape, { depth: D + 1.4, bevelEnabled: true, bevelSize: .25, bevelThickness: .25, bevelSegments: 4, curveSegments: 1 })), felt(opts.roofColor || "#c9744a"));
  roof.position.set(0, topY, -D - .7); roof.castShadow = true; house.add(roof);
  house.add(at(block(.9, 1.8, .9, "#b8674a", .14), Wh * .74, topY + rise * .55 + .4, -D / 2));

  // ---------- you ----------
  const me = avatarMesh(opts.avatar); scene.add(me);
  const roomX = (f, s) => SW + s * floors[f].rw + floors[f].rw / 2;
  const spot = (f, s) => new THREE.Vector3(s < 0 ? SW - .8 : roomX(f, s) - .7, yOf(f), s < 0 ? -2.3 : -1.9);
  const pos = { f: 0, s: -1 };
  me.position.set(SW / 2, -.35, 2.2);
  let path = [], seg = null, bob = 0;
  function go(f, s) {
    if (seg || path.length || f < 0 || f >= floors.length || s < -1 || s >= floors[f].n) return;
    const pts = [];
    let cf = pos.f;
    if (me.position.z > 1) pts.push({ p: new THREE.Vector3(SW / 2, 0, .5), f: 0, s: -1 });  // up the doorstep and in
    if (f !== cf) {
      if (pos.s !== -1) pts.push({ p: spot(cf, -1), f: cf, s: -1 });
      const Z = -D + 1.15, OUT = -2.3, LOW = SW - .5, HIGH = .75, P = (x, fl, z) => new THREE.Vector3(x, yOf(fl), z);
      while (cf !== f) {  // walk onto the steps, climb them, step off away from the next flight
        if (f > cf) pts.push({ p: P(LOW, cf, OUT), f: cf, s: -1 }, { p: P(LOW, cf, Z), f: cf, s: -1 }, { p: P(HIGH, cf + 1, Z), f: cf + 1, s: -1, climb: true }, { p: P(HIGH, cf + 1, OUT), f: cf + 1, s: -1 }), cf++;
        else pts.push({ p: P(HIGH, cf, OUT), f: cf, s: -1 }, { p: P(HIGH, cf, Z), f: cf, s: -1 }, { p: P(LOW, cf - 1, Z), f: cf - 1, s: -1, climb: true }, { p: P(LOW, cf - 1, OUT), f: cf - 1, s: -1 }), cf--;
      }
      pts.push({ p: spot(f, -1), f, s: -1 });
    }
    if (s !== -1 || !pts.length) pts.push({ p: spot(f, s), f, s });
    path.push(...pts); opts.sfx?.tick?.();
  }

  // ---------- camera: follows you; drag to look around, wheel to zoom ----------
  const look = new THREE.Vector3(SW / 2, 1.5, 0), want = new THREE.Vector3();
  let yaw = -.15, pitch = .22, dist = 14;
  let drag = null;
  const cv = renderer.domElement;
  cv.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, yaw, pitch, moved: false }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    yaw = THREE.MathUtils.clamp(drag.yaw - dx * .005, -.8, .8); pitch = THREE.MathUtils.clamp(drag.pitch + dy * .004, 0, .75);
  });
  cv.addEventListener("pointerup", (e) => {
    const wasDrag = drag?.moved; drag = null;
    if (wasDrag) return;
    const r = cv.getBoundingClientRect(), ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(clickables, false)[0];
    if (!hit) return;
    const { f, s } = hit.object.userData;
    if (f === pos.f && s === pos.s && !seg && !path.length) opts.onOpen(f, s); else go(f, s);
  });
  cv.addEventListener("wheel", (e) => { e.preventDefault(); dist = THREE.MathUtils.clamp(dist + e.deltaY * .01, 6, 30); }, { passive: false });

  function resize() {
    const w = mount.clientWidth, h = mount.clientHeight;
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    if (w < 600) dist = Math.max(dist, 17);
  }
  addEventListener("resize", resize); resize();

  const clock = new THREE.Clock();
  let alive = true;
  (function frame() {
    if (!alive) return;
    requestAnimationFrame(frame);
    const dt = Math.min(.05, clock.getDelta());
    if (!seg && path.length) { const next = path.shift(); seg = { from: me.position.clone(), ...next, t: 0, len: me.position.distanceTo(next.p) }; }
    if (seg) {
      seg.t += dt * (seg.climb ? 2.2 : 3.4) / Math.max(.4, seg.len);
      const k = Math.min(1, seg.t);
      me.position.lerpVectors(seg.from, seg.p, k);
      const dir = new THREE.Vector3().subVectors(seg.p, seg.from); dir.y = 0;
      if (dir.lengthSq() > 1e-4) me.rotation.y += (Math.atan2(dir.x, dir.z) - me.rotation.y) * .25;
      bob += dt * 14;
      if (k >= 1) { pos.f = seg.f; pos.s = seg.s; seg = null; if (!path.length) { bob = 0; opts.onMoved(pos.f, pos.s); } }
    } else me.rotation.y += (0 - me.rotation.y) * .08;  // face the camera when standing
    me.children[0].position.y = .68 + Math.abs(Math.sin(bob)) * .08;
    lamp.position.set(me.position.x, me.position.y + 3, me.position.z + 1.5);
    look.lerp(me.position.clone().add(new THREE.Vector3(.6, 1.6, -1.2)), .06);
    want.set(look.x + Math.sin(yaw) * dist * Math.cos(pitch), look.y + Math.sin(pitch) * dist + .8, look.z + Math.cos(yaw) * dist * Math.cos(pitch));
    camera.position.lerp(want, .08); camera.lookAt(look);
    sun.target.position.copy(look); sun.position.copy(look).add(new THREE.Vector3(-14, 26, 22));
    renderer.render(scene, camera);
  })();

  return {
    go, pos,
    key(k) {
      if (k === "ArrowLeft") go(pos.f, Math.max(-1, pos.s - 1));
      else if (k === "ArrowRight") go(pos.f, Math.min(floors[pos.f].n - 1, pos.s + 1));
      else if (k === "ArrowUp") go(Math.min(floors.length - 1, pos.f + 1), -1);
      else if (k === "ArrowDown") go(Math.max(0, pos.f - 1), -1);
    },
    dispose() { alive = false; removeEventListener("resize", resize); renderer.dispose(); renderer.domElement.remove(); },
  };
}

const photoCache = {};
function loadPhoto(url) {
  if (!url) return null;
  return (photoCache[url] ||= new Promise((ok) => new THREE.TextureLoader().load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; ok(t); }, undefined, () => ok(null))));
}

export const webglOK = () => { try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; } };
