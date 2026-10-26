// Walk inside, in 3D: a needle-felted dollhouse cut open at the front (three.js).
// Every surface is "wool": a fabric sheen plus a fibre texture painted on a canvas, so walls, floors,
// stairs, furniture and your little self all read as felt. Rooms sit side by side on each floor,
// a felt staircase on the left climbs to the next floor, and the camera follows you around.
import * as THREE from "./vendor/three.module.min.js";

const RW = 6, D = 6, H = 4.2, SLAB = .45, SW = 4.4;  // room width, depth, height; slab; stairwell width
const FLOOR = H + SLAB;

// ---------- felt materials ----------
const texCache = {};
function feltTexture(hex) {  // a wool swatch: base colour, mottled light and dark, lots of short stray fibres
  if (texCache[hex]) return texCache[hex];
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d"), base = new THREE.Color(hex);
  g.fillStyle = `#${base.getHexString()}`; g.fillRect(0, 0, 256, 256);
  let seed = [...hex].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 900; i++) {  // soft mottling
    const v = rnd() < .6 ? 255 : 60, a = rnd() * .045;
    g.fillStyle = `rgba(${v},${v},${v},${a})`; g.beginPath(); g.arc(rnd() * 256, rnd() * 256, 2 + rnd() * 9, 0, 7); g.fill();
  }
  g.lineCap = "round";
  for (let i = 0; i < 3400; i++) {  // fibres: mostly pale, curly, fine
    const x = rnd() * 256, y = rnd() * 256, a = rnd() * Math.PI * 2, l = 3 + rnd() * 9, v = rnd() < .7 ? 255 : 70;
    g.strokeStyle = `rgba(${v},${v},${v},${.04 + rnd() * .08})`; g.lineWidth = .4 + rnd() * .7;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 1) * l * .5, y + Math.sin(a + 1) * l * .5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (texCache[hex] = t);
}
const matCache = {};
function felt(hex, repeat = 1) {
  const key = hex + repeat;
  if (matCache[key]) return matCache[key];
  const map = feltTexture(hex).clone(); map.needsUpdate = true; map.repeat.set(repeat, repeat);
  return (matCache[key] = new THREE.MeshPhysicalMaterial({
    map, roughness: 1, metalness: 0, sheen: 1, sheenRoughness: .35, sheenColor: new THREE.Color(hex).lerp(new THREE.Color("#ffffff"), .7),
    bumpMap: map, bumpScale: .35,
  }));
}
// soft, slightly puffy shapes read as felt better than sharp boxes
function puffBox(w, h, d, hex, r = .08, repeat = 1) {
  const geo = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {  // nudge the corners in a little
    v.fromBufferAttribute(p, i);
    const k = (Math.abs(v.x) > w / 2 - 1e-3) + (Math.abs(v.y) > h / 2 - 1e-3) + (Math.abs(v.z) > d / 2 - 1e-3);
    if (k >= 2) v.multiplyScalar(1 - r / Math.max(w, h, d));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, felt(hex, repeat)); m.castShadow = m.receiveShadow = true;
  return m;
}
const ball = (r, hex) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), felt(hex)); m.castShadow = true; return m; };
const cyl = (rt, rb, h, hex, seg = 28) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), felt(hex)); m.castShadow = m.receiveShadow = true; return m; };
const at = (m, x, y, z) => (m.position.set(x, y, z), m);

// a little felt sign with handwriting on it
function sign(text, sub) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 200;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(255,250,240,.94)"; g.beginPath(); g.roundRect(8, 8, 496, 184, 40); g.fill();
  g.strokeStyle = "#2b2420"; g.lineWidth = 6; g.stroke();
  g.fillStyle = "#2b2420"; g.textAlign = "center"; g.font = "700 76px Caveat, cursive"; g.fillText(text, 256, sub ? 100 : 122);
  if (sub) { g.font = "700 40px Nunito, sans-serif"; g.fillStyle = "#7a6d63"; g.fillText(sub, 256, 160); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t })); s.scale.set(1.5, .59, 1);
  return s;
}

// wall colours for each room style (the same moods as the room pictures)
const WALL = { room_library: "#8fb3cf", room_cafe: "#e7c46a", room_studio: "#cf8a6a", room_hall: "#e19a5c", room_home: "#f0c3a8",
  room_gym: "#7fb5b0", room_garden: "#a9c98f", room_party: "#b7c49a", room_apricot: "#f3c79d", room_blue: "#cfdde8",
  room_blush: "#efc7c7", room_sage: "#c9d6b3", room: "#efe4cf", room_empty: "#ece2d0" };
const RUG = ["#e58f8f", "#f0b45c", "#7fb5c9", "#9cc48a", "#c9a0d6"];

function furnish(room, r, i, photoTex) {  // felt things in one room, depending on what it is
  const g = new THREE.Group();
  const rug = cyl(1.5, 1.5, .06, RUG[i % RUG.length], 40), rug2 = cyl(1, 1, .07, "#fff4e0", 40);
  g.add(at(rug, 0, .03, -D / 2), at(rug2, 0, .04, -D / 2));
  if (r.state === "full") {
    // the picture frame on the back wall, with the postcard photo in it
    const fw = 2.3, fh = 1.7, fz = -D + .12, fy = 2.5;
    [[0, fh / 2, fw + .3, .22], [0, -fh / 2, fw + .3, .22], [-fw / 2, 0, .22, fh], [fw / 2, 0, .22, fh]].forEach(([x, y, w, h]) =>
      g.add(at(puffBox(w, h, .18, "#e9d2a8", .04), x, fy + y, fz)));
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(fw - .1, fh - .1), new THREE.MeshStandardMaterial({ color: "#f6ecd8", roughness: .9 }));
    at(pic, 0, fy, fz - .02); g.add(pic);
    if (photoTex) photoTex.then((t) => { if (t) { pic.material.map = t; pic.material.color.set("#ffffff"); pic.material.needsUpdate = true; } });
    // an armchair and a plant
    const chair = new THREE.Group();
    chair.add(at(puffBox(1.3, .5, 1.1, "#e8b44c", .12), 0, .45, 0), at(puffBox(1.3, .9, .3, "#e8b44c", .12), 0, .95, -.45),
      at(puffBox(.25, .7, 1.1, "#d9a03c", .1), -.65, .7, 0), at(puffBox(.25, .7, 1.1, "#d9a03c", .1), .65, .7, 0));
    chair.position.set(-RW / 2 + 1.2, 0, -D + 1.6); chair.rotation.y = .5; g.add(chair);
    g.add(at(cyl(.32, .25, .55, "#c9744a"), RW / 2 - .9, .28, -D + .9));
    [[0, .85, 0, .42], [-.22, 1.1, .05, .3], [.2, 1.15, -.05, .32]].forEach(([x, y, z, rr]) => g.add(at(ball(rr, "#7faa62"), RW / 2 - .9 + x, y, -D + .9 + z)));
    if (r.key) {  // a floor finished: balloons, bunting and a cake
      ["#e58f8f", "#7fb5c9", "#f0d06a"].forEach((c, k) => { const b = ball(.32, c); at(b, RW / 2 - 1.4 + k * .45, 2.6 + k * .2, -D + 1.4); g.add(b); });
      for (let k = 0; k < 9; k++) { const flag = new THREE.Mesh(new THREE.ConeGeometry(.16, .4, 3), felt(RUG[k % RUG.length])); flag.rotation.x = Math.PI; at(flag, -RW / 2 + .6 + k * .6, H - .55 - Math.sin(k / 8 * Math.PI) * .25, -D + .5); g.add(flag); }
      g.add(at(cyl(.45, .45, .35, "#fff4e0"), 1.6, .18, -D + 2.2), at(cyl(.3, .3, .3, "#f3b8c4"), 1.6, .5, -D + 2.2));
    }
  } else {
    // still empty: moving boxes, a ladder, a paint pot
    g.add(at(puffBox(1, .8, .9, "#c9a074", .05), RW / 2 - 1.2, .4, -D + 1.1), at(puffBox(.8, .6, .7, "#b98d62", .05), RW / 2 - 1.3, 1.1, -D + 1.15));
    const lad = new THREE.Group();
    lad.add(at(puffBox(.12, 2.6, .12, "#a87a52"), -.4, 1.3, 0), at(puffBox(.12, 2.6, .12, "#a87a52"), .4, 1.3, 0));
    for (let k = 0; k < 5; k++) lad.add(at(puffBox(.8, .1, .1, "#a87a52"), 0, .4 + k * .5, 0));
    lad.position.set(-RW / 2 + 1.2, 0, -D + .9); lad.rotation.x = -.18; g.add(lad);
    g.add(at(cyl(.3, .3, .4, "#e7c46a"), -RW / 2 + 2.2, .2, -D + 1.4));
    if (r.state === "next") { const glow = new THREE.PointLight("#ffd27a", 6, 7, 1.6); glow.position.set(0, 2.5, -D / 2); g.add(glow); }
  }
  return g;
}

function avatarMesh(av) {  // a felt little person; your photo (or character) on the face
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.36, .55, 6, 16), felt("#ef8fa6")); body.position.y = .66; body.castShadow = true;
  const head = ball(.4, "#fbe6d4"); head.position.y = 1.5;
  const face = document.createElement("canvas"); face.width = face.height = 256;
  const g2 = face.getContext("2d");
  const tex = new THREE.CanvasTexture(face); tex.colorSpace = THREE.SRGBColorSpace;
  const drawCircle = (img) => { g2.save(); g2.beginPath(); g2.arc(128, 128, 120, 0, 7); g2.clip(); g2.drawImage(img, 0, 0, 256, 256); g2.restore(); g2.lineWidth = 10; g2.strokeStyle = "#fff"; g2.beginPath(); g2.arc(128, 128, 120, 0, 7); g2.stroke(); tex.needsUpdate = true; };
  if (av?.photo) { const im = new Image(); im.onload = () => drawCircle(im); im.src = av.photo; }
  else { g2.fillStyle = "#fbe6d4"; g2.fillRect(0, 0, 256, 256); g2.font = "170px serif"; g2.textAlign = "center"; g2.textBaseline = "middle"; g2.fillText(av?.character || "🙂", 128, 140); tex.needsUpdate = true; }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(.36, 40), new THREE.MeshStandardMaterial({ map: tex, roughness: .9 }));
  disc.position.set(0, 1.5, .38);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.45, 24), new THREE.MeshBasicMaterial({ color: "#3b2a1e", transparent: true, opacity: .25 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .01;
  g.add(body, head, disc, shadow);
  [-.18, .18].forEach((x) => g.add(at(ball(.13, "#fbe6d4"), x, 1.1, .22)));  // little hands
  return g;
}

/**
 * opts: floors [{f, n, rooms:[{state, key, label, sub}]}], roofColor, background (image url), avatar {photo, character},
 * photo(f, s) -> url or null, describe(f, s) -> html, onOpen(f, s), onMoved(f, s), sfx, mount (element)
 */
export function walk3D(opts) {
  const { floors, mount } = opts;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  mount.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#e9dcc4");
  if (opts.background) new THREE.TextureLoader().load(opts.background, (t) => { t.colorSpace = THREE.SRGBColorSpace; scene.background = t; });
  scene.fog = new THREE.Fog("#e9dcc4", 40, 90);
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 200);

  scene.add(new THREE.HemisphereLight("#fff4e2", "#8a7058", 1.5));
  const sun = new THREE.DirectionalLight("#fff1d6", 2.2);
  sun.position.set(-14, 26, 22); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0004; sun.shadow.radius = 4;
  scene.add(sun, sun.target);
  const lamp = new THREE.PointLight("#ffe1b0", 8, 9, 1.4); scene.add(lamp);  // a warm light that follows you

  // ---------- the house ----------
  const house = new THREE.Group(); scene.add(house);
  const yOf = (i) => i * FLOOR;
  const widest = SW + Math.max(...floors.map((fl) => fl.n)) * RW;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), felt("#8fb36d", 40)); ground.rotation.x = -Math.PI / 2; ground.position.y = -SLAB - .01; ground.receiveShadow = true; scene.add(ground);
  const clickables = [];
  floors.forEach((fl, i) => {
    const y = yOf(i), w = SW + fl.n * RW;
    // slab under this floor (with a hole above the stairs below, apart from a landing)
    if (i === 0) house.add(at(puffBox(w + .4, SLAB, D + .5, "#b98a5e", .1, 3), w / 2, y - SLAB / 2, -D / 2 + .1));
    else { house.add(at(puffBox(1.4, SLAB, D + .5, "#b98a5e", .1), .7, y - SLAB / 2, -D / 2 + .1), at(puffBox(w - SW + .4, SLAB, D + .5, "#b98a5e", .1, 3), SW + (w - SW) / 2, y - SLAB / 2, -D / 2 + .1)); }
    // stairwell walls
    house.add(at(puffBox(SW, H, .3, "#f4e6cf", .05, 2), SW / 2, y + H / 2, -D - .1), at(puffBox(.35, H + SLAB, D + .5, "#e2cfae", .05, 2), -.17, y + H / 2 - SLAB / 2, -D / 2 + .1));
    const stairFloor = new THREE.Mesh(new THREE.BoxGeometry(SW, .02, D), new THREE.MeshBasicMaterial({ visible: false })); at(stairFloor, SW / 2, y + .01, -D / 2);
    stairFloor.userData = { f: i, s: -1 }; house.add(stairFloor); clickables.push(stairFloor);
    // the stairs up to the next floor: felt steps along the back of the stairwell
    if (i < floors.length - 1) {
      const steps = 11, run = SW - 1.6, rise = FLOOR / steps;
      for (let k = 0; k < steps; k++) house.add(at(puffBox(run / steps + .05, rise * (k + 1), 2, k % 2 ? "#c99a6b" : "#d1a678", .04), SW - .3 - (k + .5) * run / steps, y + rise * (k + 1) / 2, -D + 1.15));
      const rail = puffBox(.12, .12, Math.hypot(run, FLOOR) + .3, "#8a5a3a"); rail.rotation.order = "YXZ"; rail.rotation.y = Math.PI / 2; rail.rotation.x = -Math.atan2(FLOOR, run);
      at(rail, SW - .3 - run / 2, y + FLOOR / 2 + 1, -D + .2); house.add(rail);
    }
    fl.rooms.forEach((r, j) => {
      const x0 = SW + j * RW, cx = x0 + RW / 2, wall = WALL[r.rn] || "#efe4cf";
      const room = new THREE.Group(); room.position.set(cx, y, 0); house.add(room);
      room.add(at(puffBox(RW, .08, D, r.state === "full" ? "#d8b07f" : "#d9c4a4", .02, 3), 0, .04, -D / 2));  // floorboards
      room.add(at(puffBox(RW, H, .3, wall, .05, 2), 0, H / 2, -D - .1));  // back wall
      room.add(at(puffBox(RW, .3, .3, "#b98a5e"), 0, .15, -D + .1));  // skirting
      // the wall to the left, with a doorway
      room.add(at(puffBox(.3, H, D - 3.2, wall, .05), -RW / 2, H / 2, -D + (D - 3.2) / 2), at(puffBox(.3, H, .9, wall, .05), -RW / 2, H / 2, -.45),
        at(puffBox(.3, H - 2.9, 2.3, wall, .05), -RW / 2, 2.9 + (H - 2.9) / 2, -2.05));
      room.add(furnish(room, r, j, r.state === "full" ? loadPhoto(opts.photo(i, j)) : null));
      const s = sign(r.label, r.sub); s.position.set(RW / 2 - 1.1, .5, -.5); room.add(s);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(RW, H, D), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(0, H / 2, -D / 2);
      hit.userData = { f: i, s: j }; room.add(hit); clickables.push(hit);
    });
    house.add(at(puffBox(.35, H + SLAB, D + .5, "#e2cfae", .05, 2), w + .17, y + H / 2 - SLAB / 2, -D / 2 + .1));  // the end wall
  });
  // ceiling and roof
  const topY = yOf(floors.length), topW = SW + floors[floors.length - 1].n * RW;
  house.add(at(puffBox(topW + .4, SLAB, D + .5, "#b98a5e", .1, 3), topW / 2, topY - SLAB / 2, -D / 2 + .1));
  const shape = new THREE.Shape(); shape.moveTo(-.8, 0); shape.lineTo(topW / 2, Math.min(5, topW * .28)); shape.lineTo(topW + .8, 0); shape.lineTo(-.8, 0);
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: D + 1.2, bevelEnabled: true, bevelSize: .15, bevelThickness: .15, bevelSegments: 3 }), felt(opts.roofColor || "#c9744a", 3));
  roof.position.set(0, topY, -D - .6); roof.castShadow = true; house.add(roof);
  house.add(at(puffBox(.8, 1.6, .8, "#b05a3a", .08), topW * .74, topY + 1.6, -D / 2));

  // ---------- you ----------
  const me = avatarMesh(opts.avatar); scene.add(me);
  const spot = (f, s) => new THREE.Vector3(s < 0 ? SW - .7 : SW + s * RW + RW / 2 - .6, yOf(f), s < 0 ? -2.4 : -1.9);
  const stairTop = (f) => new THREE.Vector3(.7, yOf(f), -D + 1.15);  // where the stairs from floor f-1 arrive
  const pos = { f: 0, s: -1 };
  me.position.copy(spot(0, -1)).add(new THREE.Vector3(-1.5, 0, 2));
  let path = [], seg = null, bob = 0;
  function queue(points) { path.push(...points); }
  function go(f, s) {
    if (seg || path.length || f < 0 || f >= floors.length || s < -1 || s >= floors[f].n) return;
    const pts = [];
    let cf = pos.f;
    if (f !== cf) {
      if (pos.s !== -1) pts.push({ p: spot(cf, -1), f: cf, s: -1 });
      const Z = -D + 1.15, OUT = -2.4, LOW = SW - .4, HIGH = .7, P = (x, fl, z) => new THREE.Vector3(x, yOf(fl), z);
      while (cf !== f) {  // walk onto the steps, climb them, step off away from the next flight
        if (f > cf) pts.push({ p: P(LOW, cf, OUT), f: cf, s: -1 }, { p: P(LOW, cf, Z), f: cf, s: -1 }, { p: P(HIGH, cf + 1, Z), f: cf + 1, s: -1, climb: true }, { p: P(HIGH, cf + 1, OUT), f: cf + 1, s: -1 }), cf++;
        else pts.push({ p: P(HIGH, cf, OUT), f: cf, s: -1 }, { p: P(HIGH, cf, Z), f: cf, s: -1 }, { p: P(LOW, cf - 1, Z), f: cf - 1, s: -1, climb: true }, { p: P(LOW, cf - 1, OUT), f: cf - 1, s: -1 }), cf--;
      }
      pts.push({ p: spot(f, -1), f, s: -1 });
    }
    if (s !== -1 || pts.length === 0) pts.push({ p: spot(f, s), f, s });
    queue(pts); opts.sfx?.tick?.();
  }

  // ---------- camera: follows you; drag to look around, wheel to zoom ----------
  const look = new THREE.Vector3().copy(me.position), want = new THREE.Vector3();
  let yaw = -.12, pitch = .2, dist = 13;
  let drag = null;
  const cv = renderer.domElement;
  cv.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, yaw, pitch, moved: false }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    yaw = THREE.MathUtils.clamp(drag.yaw - dx * .005, -.75, .75); pitch = THREE.MathUtils.clamp(drag.pitch + dy * .004, -.05, .7);
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
  cv.addEventListener("wheel", (e) => { e.preventDefault(); dist = THREE.MathUtils.clamp(dist + e.deltaY * .01, 6, 24); }, { passive: false });

  function resize() {
    const w = mount.clientWidth, h = mount.clientHeight;
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    if (w < 600) dist = Math.max(dist, 15);
  }
  addEventListener("resize", resize); resize();

  // ---------- the loop ----------
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
      if (k >= 1) {
        pos.f = seg.f; pos.s = seg.s; seg = null;
        if (!path.length) { bob = 0; opts.onMoved(pos.f, pos.s); }
      }
    } else me.rotation.y += (0 - me.rotation.y) * .08;  // face the camera when standing
    me.children[0].position.y = .66 + Math.abs(Math.sin(bob)) * .08;
    lamp.position.set(me.position.x, me.position.y + 3, me.position.z + 1.5);
    // the camera trails behind and a little above you
    look.lerp(me.position.clone().add(new THREE.Vector3(.6, 1.6, -1.2)), .06);
    want.set(look.x + Math.sin(yaw) * dist * Math.cos(pitch), look.y + Math.sin(pitch) * dist + .8, look.z + Math.cos(yaw) * dist * Math.cos(pitch));
    camera.position.lerp(want, .08); camera.lookAt(look);
    sun.target.position.copy(look); sun.position.copy(look).add(new THREE.Vector3(-14, 24, 20));
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
    busy: () => !!seg || path.length > 0,
    dispose() { alive = false; removeEventListener("resize", resize); renderer.dispose(); renderer.domElement.remove(); },
  };
}

const photoCache = {};
function loadPhoto(url) {
  if (!url) return null;
  return (photoCache[url] ||= new Promise((ok) => new THREE.TextureLoader().load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; ok(t); }, undefined, () => ok(null))));
}

export const webglOK = () => { try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; } };
