import { renderAll, ico, HABIT_ICON, CHARACTER_ICON } from "./icons.js";
import rough from "./vendor/rough.esm.js";
import { sfx, buzz } from "./sound.js";

const $ = (id) => document.getElementById(id);
renderAll();
const hico = (key, cls = "") => ico(HABIT_ICON(key), cls);
// a habit's own icon (custom habits get one picked by the Ladder agent)
const hIcon = (h, cls = "") => ico(h?.icon || HABIT_ICON(h?.key || ""), cls);
const iconOfPost = (p) => hIcon(S.habits.find((h) => h.id === p.habit_id) || { key: p.habit_key });

let S = null;            // latest /api/state
let POSTS = { kept: [], stopped: [] };
let roadHabit = null;    // which habit's road is shown
let busy = false;
// ?mode=plain = control group for the A/B test: an ordinary streak tracker, no road, no AI.
const PLAIN = new URLSearchParams(location.search).get("mode") === "plain";
const Q = PLAIN ? "?plain=true" : "";
// ?study=1 (opened from the study console): one habit only, plus a researcher bar.
const STUDY = new URLSearchParams(location.search).get("study") === "1";

const api = async (url, body, method) => {
  const res = await fetch(url, body === undefined && !method ? {} : {
    method: method || "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Something went wrong.");
  return data;
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const lower = (t) => t.charAt(0).toLowerCase() + t.slice(1).replace(/\.$/, "");
const year = (iso) => iso.slice(0, 4);

// ---------- boot ----------

async function refresh() {
  S = await api("/api/state" + Q);
  const onboarded = !!S.profile;
  $("onboard").hidden = onboarded;
  $("game").hidden = !onboarded;
  $("menu-avatar").hidden = $("menu-play").hidden = PLAIN || !onboarded;
  $("menu-add").hidden = !onboarded;
  if (!onboarded) return renderOnboard();
  if (!PLAIN) {
    const [kept, stopped] = await Promise.all([api("/api/feed?timeline=kept"), api("/api/feed?timeline=stopped")]);
    POSTS = { kept, stopped };
  }
  renderMe();
  renderToday();
  if (wantIntro) playIntro();
  renderRoad();
  if (!PLAIN && !refresh.counted) { countUp($("me")); refresh.counted = true; }
  if (STUDY && $("sb-date")) $("sb-date").textContent = `Day ${S.day_offset + 1}`;
}

// ---------- onboarding / add habit ----------

const START = ["Brand new", "Tried it a little", "Comfortable with basics", "Already pretty good"];

function pickItem(t, on) {
  const custom = t.key === "custom";
  return `
    <div class="pick-item sketch ${on ? "on" : ""}" data-key="${t.key}">
      <div class="pick-top">
        <span class="em">${hico(t.key)}</span>
        ${custom ? `<input class="cname" maxlength="40" placeholder="Something else: meditate, draw, piano…">` : `<span class="name">${t.label}</span>`}
        <input type="number" class="amt" min="1" max="240" value="${t.default_amount}" aria-label="amount">
        <span class="unit">${t.unit === "dollars" ? "$ / day" : "min / day"}</span>
      </div>
      <div class="pick-more">
        <label>Where are you starting?
          <select class="lvl">${START.map((x, i) => `<option value="${i}">${x}</option>`).join("")}</select></label>
        <label>Your dream, in a few words <small>(optional)</small>
          <input class="goal" maxlength="100" placeholder="${custom ? "e.g. finish a 10-day retreat" : "e.g. play at my sister's wedding"}"></label>
      </div>
    </div>`;
}

function pickList(el, preselect) {
  const all = [...S.templates, { key: "custom", label: "Something else", unit: "minutes", default_amount: 15 }];
  el.innerHTML = all.map((t) => pickItem(t, t.key === preselect)).join("");
  el.querySelectorAll(".pick-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      if (e.target.closest("input, select, label")) {
        if (e.target.classList.contains("cname") && !item.classList.contains("on")) selectPick(el, item, true);
        return;
      }
      selectPick(el, item, !item.classList.contains("on"));
    });
  });
}

function selectPick(el, item, on) {
  if (STUDY && on) el.querySelectorAll(".pick-item").forEach((o) => o !== item && o.classList.remove("on"));  // one habit per round keeps A/B fair
  item.classList.toggle("on", on);
}

const picked = (el) => [...el.querySelectorAll(".pick-item.on")].map((i) => ({
  key: i.dataset.key,
  amount: +i.querySelector(".amt").value,
  start_level: +i.querySelector(".lvl").value,
  goal: i.querySelector(".goal").value.trim(),
  name: i.querySelector(".cname")?.value.trim() || "",
}));

let readOnboardAvatar = () => ({ character: "🦊" });

function renderOnboard() {
  $("ob-avatar-wrap").hidden = PLAIN;
  if (!PLAIN && !$("ob-avatar").children.length) readOnboardAvatar = avatarPicker($("ob-avatar"));
  if (PLAIN) {  // the control group must not hear about the road or the postcards
    document.querySelector(".onboard .kicker").textContent = "Daily habits";
    document.querySelector(".onboard h1").textContent = "Build a streak.";
    document.querySelector(".onboard .muted").textContent = "Pick one small thing to do every day and check in each day you do it.";
    document.querySelector("#onboard-form button[type=submit]").textContent = "Start";
    $("ob-bestie").closest("label").hidden = true;
  }
  if (!$("ob-habits").children.length) pickList($("ob-habits"), "guitar");
}

// A custom habit waits on the Ladder agent and may be refused for safety.
async function addHabits(list, errEl, btn) {
  const label = btn.textContent;
  btn.disabled = true;
  const errors = [];
  for (const h of list) {
    btn.textContent = h.key === "custom" ? "Designing your road…" : "Adding…";
    if (h.key === "custom" && !h.name) { errors.push("Name your custom daily thing."); continue; }
    try { await api("/api/habits", h); } catch (err) { errors.push(err.message); }
  }
  btn.disabled = false;
  btn.textContent = label;
  errEl.textContent = errors.join(" ");
  return errors.length < list.length;
}

$("onboard-form").onsubmit = async (e) => {
  e.preventDefault();
  const habits = picked($("ob-habits"));
  if (!$("ob-name").value.trim()) return ($("ob-err").textContent = "Tell us your first name.");
  if (!habits.length) return ($("ob-err").textContent = "Pick at least one daily thing.");
  try {
    await api("/api/profile", { name: $("ob-name").value, bestie: $("ob-bestie").value });
    if (!PLAIN) await api("/api/avatar", readOnboardAvatar());
  } catch (err) {
    return ($("ob-err").textContent = err.message);
  }
  const btn = document.querySelector("#onboard-form button[type=submit]");
  if (await addHabits(habits, $("ob-err"), btn)) refresh();
};

function openAdd() {
  const have = new Set(S.habits.map((h) => h.key));
  pickList($("add-habits"));
  $("add-habits").querySelectorAll(".pick-item").forEach((i) => { if (have.has(i.dataset.key)) i.remove(); });
  $("add-habits").insertAdjacentHTML("beforeend", `<button type="button" class="link" id="another-custom">+ another thing of my own</button>`);
  $("another-custom").onclick = () => {
    $("another-custom").insertAdjacentHTML("beforebegin", pickItem({ key: "custom", unit: "minutes", default_amount: 15 }, true));
    const item = $("another-custom").previousElementSibling;
    item.addEventListener("click", (e) => { if (!e.target.closest("input, select, label")) selectPick($("add-habits"), item, !item.classList.contains("on")); });
    item.querySelector(".cname").focus();
  };
  $("add-err").textContent = "";
  $("add-ok").textContent = "";
  $("add").hidden = false;
}
$("add-cancel").onclick = () => ($("add").hidden = true);
$("add-save").onclick = async () => {
  const list = picked($("add-habits"));
  if (!list.length) return ($("add-err").textContent = "Pick something to add.");
  const before = new Set(S.habits.map((h) => h.id));
  await addHabits(list, $("add-err"), $("add-save"));
  await refresh();
  const added = S.habits.filter((h) => !before.has(h.id));
  if (added.length && !$("add-err").textContent) { $("add").hidden = true; return; }
  if (added.length) $("add-ok").textContent = `Added: ${added.map((h) => h.short).join(", ")}.`;
  openAdd();  // keep going: the list now hides what you already have
  $("add-ok").textContent = added.length ? `Added: ${added.map((h) => h.short).join(", ")}.` : "";
};

// ---------- future-self avatar: evolves with your highest level ----------
// Lv1-3 ink ring · Lv3 habit badge · Lv4 gold ring · Lv5 crown · Lv6 rainbow ring

function tier() {
  return Math.max(0, ...(S?.habits || []).map((h) => h.level));
}

function avatarHTML(size, opts = {}) {
  const av = S?.profile?.avatar || {};
  const t = opts.tier ?? tier();
  const top = [...(S?.habits || [])].sort((a, b) => b.level - a.level)[0];
  const face = av.photo
    ? `<img src="${av.photo}" alt="">`
    : `<span class="face">${ico(CHARACTER_ICON[av.character] || "person")}</span>`;
  return `<span class="avx t${t} ${opts.gray ? "gray" : ""}" style="width:${size}px;height:${size}px">
      <span class="avx-in">${face}</span>
      ${t >= 3 && top && size >= 44 ? `<span class="avx-badge">${hIcon(top)}</span>` : ""}
      ${t >= 5 && size >= 44 ? `<span class="avx-crown">${ico("crown")}</span>` : ""}
    </span>`;
}

const TIER_NAME = ["Day zero", "Getting started", "Building", "On a roll", "Gold streaker", "Crowned", "Legend"];

function avatarPicker(el, current = {}) {
  let choice = { ...current };
  const draw = () => {
    const chars = S?.avatar_characters || ["🦊", "🐼", "🐱", "🐰", "🐻", "🐨", "🐸", "🦁", "🐧", "🙂"];
    el.innerHTML = `
      <label class="photo-tile ${choice.photo ? "on" : ""}">
        <span class="pt-pic">${choice.photo ? `<img src="${choice.photo}" alt="">` : ico("camera")}</span>
        <span><b>${choice.photo ? "That's you!" : "Use my photo"}</b>
          <small>${choice.photo ? "Tap to change. You'll walk the road yourself." : "Walk the road as yourself. Stays on this computer, never sent to AI."}</small></span>
        <input type="file" accept="image/*" hidden>
      </label>
      <p class="or">or pick a character</p>
      <div class="avgrid">${chars.map((c) =>
        `<button type="button" class="avopt ${choice.character === c && !choice.photo ? "on" : ""}" data-c="${c}">${ico(CHARACTER_ICON[c])}</button>`).join("")}</div>`;
    el.querySelectorAll("[data-c]").forEach((b) => (b.onclick = () => { choice = { character: b.dataset.c }; draw(); }));
    el.querySelector("input[type=file]").onchange = async (e) => {
      const file = e.target.files[0];
      if (file) { choice = { photo: await shrink(file, 256) }; draw(); }
    };
  };
  if (!choice.character && !choice.photo) choice = { character: "🦊" };
  draw();
  return () => choice;
}

// square-crop and shrink in the browser so only a small image is stored
function shrink(file, size) {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const side = Math.min(img.width, img.height);
      c.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      ok(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = fail;
    img.src = URL.createObjectURL(file);
  });
}

let readSheetAvatar = null;
function openAvatarSheet() {
  readSheetAvatar = avatarPicker($("av-pick"), S.profile.avatar || {});
  $("av-err").textContent = "";
  $("avsheet").hidden = false;
}
$("av-cancel").onclick = () => ($("avsheet").hidden = true);
$("av-save").onclick = async () => {
  try {
    await api("/api/avatar", readSheetAvatar());
    $("avsheet").hidden = true;
    refresh();
  } catch (err) {
    $("av-err").textContent = err.message;
  }
};

// ---------- me card ----------

function renderMe() {
  if (PLAIN) return ($("me").innerHTML = "");
  const p = S.profile, t = tier();
  const total = S.habits.reduce((n, h) => n + h.checkins, 0);
  const best = Math.max(0, ...S.habits.map((h) => h.streak));
  const cards = POSTS.kept.length;
  $("me").innerHTML = `
    <div class="me-card sketch">
      <button class="me-av" id="me-av" title="Change who walks the road">${avatarHTML(96)}</button>
      <div class="me-text">
        <p class="hello">${esc(p.name)}, day ${S.day_offset + 1} on the road</p>
        <p class="tier">${TIER_NAME[t]}</p>
        <div class="me-stats">
          <span><b>${total}</b>check-ins</span><span><b>${best}</b>best streak</span><span><b>${cards}</b>postcards</span>
        </div>
        <button class="btn play sketch" id="me-play">${ico("play", "inline")} Play your next 10 years</button>
      </div>
    </div>`;
  $("me-av").onclick = openAvatarSheet;
  $("me-play").onclick = playReel;
}

// ---------- today: hold to check in ----------

const amountText = (h) => (h.unit === "dollars" ? `$${h.amount}` : `${h.amount} min`);

function renderToday() {
  const L = S.level_checkins;
  $("today").innerHTML = `
    <div class="today-card sketch">
      <div class="today-head"><h3>Today</h3><button class="btn add-btn sketch" id="add-habit">+ Add a daily thing</button></div>
      ${S.habits.map((h) => {
        const prev = L[h.level - 1] || 0, next = h.next_level_at;
        const pct = next ? Math.round(((h.checkins - prev) / (next - prev)) * 100) : 100;
        const quest = h.quest && !PLAIN
          ? `<p class="quest">${ico("storm", "inline")} <b>Storm ahead.</b> Check in ${h.quest.target} days in a row to clear it: ${h.quest.progress}/${h.quest.target}</p>` : "";
        return `
          <div class="habit-row ${h.checked_today ? "done" : ""}">
            <span class="hr-ico">${hIcon(h)}</span>
            <div class="hr-mid">
              <b>${esc(h.label)} · ${amountText(h)}</b>
              <small>${ico("flame", "inline")} ${h.streak}-day streak${PLAIN ? "" : ` · stop ${Math.max(0, h.allowed_chapter + 1)} of 6`}</small>
              ${PLAIN ? "" : `<div class="prog"><i style="width:${pct}%"></i></div>`}
              ${quest}
            </div>
            ${h.checked_today
              ? `<span class="done-tag">${ico("check", "inline")} done</span>`
              : `<button class="hold sketch" data-hold="${h.id}" ${busy ? "disabled" : ""}><i></i><span>Hold to check in</span></button>`}
          </div>`;
      }).join("")}
    </div>`;
  $("add-habit").onclick = openAdd;
  $("today").querySelectorAll("[data-hold]").forEach(bindHold);
}

// press and hold ~0.9 s: a small ritual instead of a tap
function bindHold(btn) {
  const fill = btn.querySelector("i");
  let t = null, start = 0;
  const go = (e) => {
    e.preventDefault();
    if (busy || t) return;
    start = performance.now();
    btn.classList.add("holding");
    sfx.charge();
    t = setInterval(() => {
      const p = Math.min(1, (performance.now() - start) / 900);
      fill.style.width = `${p * 100}%`;
      if (p >= 1) { clearInterval(t); t = null; btn.classList.remove("holding"); buzz(15); sfx.pop(); checkin(+btn.dataset.hold); }
    }, 16);
  };
  const cancel = () => {
    if (!t) return;
    clearInterval(t);
    t = null;
    btn.classList.remove("holding");
    fill.style.width = "0";
  };
  btn.addEventListener("pointerdown", go);
  ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => btn.addEventListener(ev, cancel));
  btn.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") checkin(+btn.dataset.hold); });
}

async function checkin(id) {
  if (busy) return;
  busy = true;
  roadHabit = id;
  if (PLAIN) {
    await api(`/api/habits/${id}/checkin${Q}`, {}).catch((err) => alert(err.message));
    busy = false;
    return refresh();
  }
  renderToday();
  renderRoad({ transit: true });
  const stop = animateTransit();
  try {
    const t0 = performance.now();
    const r = await api(`/api/habits/${id}/checkin`, {});
    // pre-written postcards come back instantly; keep the "in transit" moment for a beat anyway
    await new Promise((ok) => setTimeout(ok, Math.max(0, 1400 - (performance.now() - t0))));
    stop();
    busy = false;
    await refresh();
    const post = POSTS.kept.find((p) => p.id === r.post_id);
    if (r.kind === "level_up") {
      const h = S.habits.find((x) => x.id === id);
      $("lu-level").textContent = Math.max(1, h.allowed_chapter + 1);
      $("lu-emoji").innerHTML = avatarHTML(104);
      $("lu-title").textContent = h.allowed_milestone ? `Future you ${lower(h.allowed_milestone.milestone)}.` : "A new chapter begins.";
      $("lu-sub").textContent = h.next_milestone ? `Next stop: ${lower(h.next_milestone.milestone)}.` : "You've reached the end of this road.";
      $("lu-dots").innerHTML = Array.from({ length: 6 }, (_, i) =>
        `<i class="${i <= h.allowed_chapter ? "on" : ""} ${i === h.allowed_chapter ? "now" : ""}"></i>`).join("");
      confetti();
      sfx.chime();
      buzz([20, 60, 20, 60, 40]);
      $("levelup").hidden = false;
      $("lu-close").onclick = () => { $("levelup").hidden = true; if (post) openPostcard(post, true); };
    } else if (post) {
      openPostcard(post, true);
    }
  } catch (err) {
    stop();
    busy = false;
    alert(err.message);
    refresh();
  }
}

// While the agents work (~5-10 s) the frontier postcard says what's happening, following the real pipeline.
function animateTransit() {
  const steps = ["Counting your check-ins and pace", "Story agent is writing your next chapter",
    "Reality check: does this fit your real pace?", "Finding a photo for the moment", "Stamping the postcard"];
  let y = +S.today.slice(0, 4), i = 0;
  const yr = setInterval(() => {
    y = y >= 2036 ? +S.today.slice(0, 4) : y + 1;
    if ($("tr-year")) $("tr-year").textContent = y;
  }, 240);
  const st = setInterval(() => {
    i = Math.min(i + 1, steps.length - 1);
    const el = $("tr-step");
    if (el) { el.classList.remove("in"); void el.offsetWidth; el.textContent = steps[i]; el.classList.add("in"); }
  }, 1800);
  return () => { clearInterval(yr); clearInterval(st); };
}

function confetti() {
  const colors = ["#ffd86b", "#ef7f97", "#9ed39b", "#9cc6f0", "#c9b5f0"];
  $("confetti").innerHTML = Array.from({ length: 40 }, () => {
    const x = Math.random() * 100, d = 0.8 + Math.random() * 1.2, r = Math.random() * 360;
    return `<i style="left:${x}%;background:${colors[Math.floor(Math.random() * 5)]};animation-duration:${d}s;transform:rotate(${r}deg)"></i>`;
  }).join("");
}

// ---------- the road to 2036 ----------
// Home → six stops (one per chapter) → 2036. Each stop shows the year you'd reach it at your
// real pace; kept postcards are pinned above their stop, the road not taken runs below.

const STOP_COLORS = ["#f7b6c2", "#ffd86b", "#9ed39b", "#9cc6f0", "#c9b5f0", "#f6a15b"];
const KIND_LABEL = { level_up: "new stop!", life_event: "plot twist", boss: "slump", comeback: "comeback", combo: "combo" };
const prevYears = JSON.parse(localStorage.getItem("ff-stop-years") || "{}");
const lastPos = JSON.parse(localStorage.getItem("ff-piece") || "{}");

function renderRoad(opts = {}) {
  const wrap = $("roadwrap");
  if (PLAIN || !S.habits.length) { wrap.hidden = true; return; }
  wrap.hidden = false;
  if (!S.habits.some((h) => h.id === roadHabit)) roadHabit = S.habits[0].id;
  const h = S.habits.find((x) => x.id === roadHabit);

  $("road-tabs").innerHTML = S.habits.length > 1 ? S.habits.map((x) =>
    `<button class="${x.id === h.id ? "on" : ""}" data-road="${x.id}">${hIcon(x, "inline")} ${esc(x.short)}</button>`).join("") : "";
  $("road-tabs").querySelectorAll("[data-road]").forEach((b) => (b.onclick = () => { roadHabit = +b.dataset.road; renderRoad(); }));

  const kept = POSTS.kept.filter((p) => p.habit_id === h.id);
  const stopped = POSTS.stopped.filter((p) => p.habit_id === h.id);
  const frontier = Math.max(0, h.allowed_chapter + (h.next_level_at === h.checkins + 1 ? 1 : 0));
  const was = prevYears[h.id] || [];

  const cols = h.chapters.map((milestone, i) => {
    const mine = kept.filter((p) => (p.chapter ?? 0) === i);
    const ghost = stopped.filter((p) => (p.chapter ?? 0) === i);
    const reached = i <= h.allowed_chapter;
    const y = year(h.chapter_dates[i]);
    const moved = was[i] && was[i] !== y ? (+y < +was[i] ? `<span class="moved up">↑ sooner</span>` : `<span class="moved down">↓ later</span>`) : "";
    let pending = "";
    if (i === frontier && !h.checked_today) {
      pending = opts.transit && h.id === roadHabit
        ? `<div class="postcard transit"><div class="pc-photo"><span id="tr-year">${S.today.slice(0, 4)}</span></div><p id="tr-step" class="in">Counting your check-ins and pace</p></div>`
        : `<div class="postcard locked"><div class="pc-photo">${ico("lock")}</div><p>Hold to check in and this postcard arrives</p></div>`;
    }
    return `
      <div class="stop-col ${reached ? "reached" : ""}" data-i="${i}" style="--ci:${i + 1}">
        <div class="kept-area">${pending}${postcards(mine, "kept", pending ? 1 : 2)}</div>
        <div class="stop">
          <span class="stop-dot" style="--c:${STOP_COLORS[i]}">${i + 1}</span>
          <span class="stop-year">~${y} ${moved}</span>
          <span class="stop-text">${esc(milestone)}</span>
          <span class="stop-tip"><b>Stop ${i + 1} · ~${y}</b>${esc(milestone)}<i>${mine.length ? `${mine.length} postcard${mine.length > 1 ? "s" : ""} from here` : reached ? "reached" : `${Math.max(0, i - h.allowed_chapter)} stop${i - h.allowed_chapter === 1 ? "" : "s"} ahead`}</i></span>
        </div>
        <div class="ghost-area">${postcards(ghost, "stopped")}</div>
      </div>`;
  }).join("");

  $("road").innerHTML = `
    <div class="road-inner" id="road-inner">
      <svg class="road-svg" id="road-svg" aria-hidden="true"></svg>
      <div class="stop-col home"><div class="kept-area"></div>
        <div class="stop"><span class="stop-dot home-dot">${ico("house")}</span><span class="stop-year">${S.today.slice(0, 4)}</span><span class="stop-text">today</span></div>
        <div class="ghost-area"><span class="nt-label">the road not taken</span></div></div>
      ${cols}
      <div class="stop-col end"><div class="kept-area"></div>
        <div class="stop"><span class="stop-dot end-dot">${ico("flag")}</span><span class="stop-year">2036</span><span class="stop-text">ten years on</span></div>
        <div class="ghost-area"></div></div>
      ${h.quest ? `<span class="road-storm" id="road-storm">${ico("storm")}</span>` : ""}
      <span class="road-piece" id="road-piece">${avatarHTML(S.profile.avatar?.photo ? 54 : 48, { tier: 0 })}<b>you</b><span class="say" id="piece-say"></span></span>
    </div>`;

  $("road").querySelectorAll("[data-post]").forEach((el) => (el.onclick = () => {
    const [tl, id] = el.dataset.post.split(":");
    const p = POSTS[tl].find((x) => x.id === +id);
    if (p) openPostcard(p);
  }));
  $("road").querySelectorAll("[data-more]").forEach((el) => (el.onclick = () => openStack(h, +el.dataset.more, el.dataset.tl)));

  prevYears[h.id] = h.chapter_dates.map(year);
  localStorage.setItem("ff-stop-years", JSON.stringify(prevYears));
  requestAnimationFrame(() => layoutRoad(h));
  setTimeout(() => { layoutRoad(h); if (wantIntro) revealRoad(); }, 120);  // once photos/fonts settle
  bindRoadHover();
  if (opts.transit) {
    const col = $("road").querySelector(`.stop-col[data-i="${frontier}"]`);
    col?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }
}

function postcards(list, tl, max = tl === "kept" ? 2 : 1) {
  if (!list.length) return "";
  const shown = list.slice(0, max);
  const more = list.length - shown.length;
  return shown.map((p, k) => `
    <button class="postcard ${tl} ${k % 2 ? "tilt-r" : "tilt-l"}" data-post="${tl}:${p.id}">
      <span class="tape"></span>
      <div class="pc-photo">${photoHTML(p)}</div>
      <p>${esc(p.caption)}</p>
      <span class="pc-year">${year(p.live_date || p.future_date)}</span>
      ${tl === "kept" && KIND_LABEL[p.kind] ? `<span class="pc-kind ${p.kind}">${KIND_LABEL[p.kind]}</span>` : ""}
    </button>`).join("") + (more > 0 ? `<button class="more" data-more="${list[0].chapter ?? 0}" data-tl="${tl}">+${more} more</button>` : "");
}

function photoHTML(p) {
  const fb = `<span class="fb">${iconOfPost(p)}</span>`;
  return p.photo ? `${fb}<img src="${p.photo.url}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : fb;
}

// Draw the hand-drawn road through the stop dots, then walk the piece to where you are.
function layoutRoad(h) {
  const inner = $("road-inner");
  const svg = $("road-svg");
  if (!inner || !svg) return;
  const box = inner.getBoundingClientRect();
  const center = (el) => { const r = el.getBoundingClientRect(); return [r.left - box.left + r.width / 2, r.top - box.top + r.height / 2]; };
  const dots = [...inner.querySelectorAll(".stop-dot")].map(center);
  const ghosts = [...inner.querySelectorAll(".ghost-area")].map((g) => {
    const r = g.getBoundingClientRect();
    return vertical() ? [r.left - box.left + 20, r.top - box.top + r.height / 2] : [r.left - box.left + r.width / 2, r.top - box.top + 26];
  });
  svg.setAttribute("width", inner.scrollWidth);
  svg.setAttribute("height", inner.scrollHeight);
  svg.innerHTML = "";
  const rc = rough.svg(svg);
  svg.appendChild(rc.linearPath(ghosts, { stroke: "#cfc6b8", strokeWidth: 3, roughness: 1.8, strokeLineDash: [6, 9], seed: 301 }));
  svg.appendChild(rc.linearPath(dots, { stroke: "#e2cfae", strokeWidth: 14, roughness: 1.4, seed: 302 }));
  svg.appendChild(rc.linearPath(dots, { stroke: "#fffaf0", strokeWidth: 2, roughness: 1, strokeLineDash: [8, 12], seed: 303 }));

  // piece: between the stop you've reached and the next, by progress toward the next level
  const L = S.level_checkins, lvl = h.level;
  const prev = L[lvl - 1] || 0, next = L[lvl];
  const frac = next && h.allowed_chapter + 1 === lvl ? Math.min(1, (h.checkins - prev) / (next - prev)) : 0;
  const a = dots[Math.max(0, h.allowed_chapter + 1)], b = dots[Math.min(dots.length - 1, h.allowed_chapter + 2)];
  const to = [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac];
  const walked = dots.slice(0, Math.max(0, h.allowed_chapter + 1) + 1).concat([to]);
  svg.appendChild(rc.linearPath(walked, { stroke: "#ef7f97", strokeWidth: 5, roughness: 1.2, seed: 304 }));

  const storm = $("road-storm");
  if (storm) { storm.style.left = `${b[0]}px`; storm.style.top = `${b[1]}px`; }

  const piece = $("road-piece");
  const key = `${h.id}`;
  const from = lastPos[key] || to;
  const place = ([x, y]) => { piece.style.left = `${x}px`; piece.style.top = `${y}px`; };
  if (!piece.dataset.placed) {
    piece.dataset.placed = "1";
    place(from);
    if (Math.abs(from[0] - to[0]) + Math.abs(from[1] - to[1]) > 2) {
      setTimeout(() => { piece.classList.add("moving"); place(to); setTimeout(() => piece.classList.remove("moving"), 1300); }, 90);
    }
  } else {
    place(to);
  }
  lastPos[key] = to;
  localStorage.setItem("ff-piece", JSON.stringify(lastPos));
}

const vertical = () => window.matchMedia("(max-width: 760px)").matches;
let resizeT = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => S?.habits?.length && !PLAIN && layoutRoad(S.habits.find((x) => x.id === roadHabit)), 150);
});

// ---------- postcard viewer ----------

function whenText(p) {
  const live = p.live_date || p.future_date;
  const d = new Date(live + "T12:00:00");
  const yrs = (d - new Date(S.today + "T12:00:00")) / (365 * 864e5);
  const away = yrs < 1 ? `${Math.max(1, Math.round(yrs * 12))} months away` : `${yrs.toFixed(1).replace(".0", "")} years away`;
  const shifted = p.live_date && year(p.live_date) !== year(p.future_date)
    ? ` · first written for ${year(p.future_date)}, your pace moved it` : "";
  return `${d.toLocaleDateString("en-US", { month: "long", year: "numeric" })} · ${away} at your pace${shifted}`;
}

// A postcard is a real card: photo and caption on the front; a handwritten letter from
// future-you, a stamp, and a postmark on the back. New ones arrive in an envelope.

function letterOf(p) {
  if (p.letter) return p.letter;
  const y = year(p.live_date || p.future_date);
  return `Dear ${S.profile.name} of ${S.today.slice(0, 4)}, this is where today's small step led. Keep going. — you, ${y}`;
}

function postmarkOf(p) {
  const d = new Date((p.live_date || p.future_date) + "T12:00:00");
  const place = (p.postmark || p.location || "SOMEWHERE AHEAD").toUpperCase().slice(0, 18);
  return { place, date: d.toLocaleDateString("en-US", { month: "short", year: "numeric" }).toUpperCase() };
}

function cardHTML(p) {
  const stoppedSelf = p.timeline === "stopped";
  const who = stoppedSelf ? S.profile.handle.replace(".2036", ".someday") : S.profile.handle;
  const b = (p.basis || "").replace(/ ?combo:\d+/, "").trim();
  const pm = postmarkOf(p);
  const stampFace = S.profile.avatar?.photo && !stoppedSelf ? `<img src="${S.profile.avatar.photo}" alt="">` : iconOfPost(p);
  return `
    <div class="pc3d ${stoppedSelf ? "stopped" : ""}" id="pc3d">
      <div class="pc-inner" id="pc-inner">
        <div class="pc-face front">
          <span class="tape"></span>
          <div class="pc-big-photo">${photoHTML(p)}</div>
          <div class="pc-note">
            <div class="pc-from">${avatarHTML(34, { gray: stoppedSelf, tier: stoppedSelf ? 0 : undefined })}<b>${esc(who)}</b><span>${esc(p.location || "")}</span></div>
            <p class="pc-caption">${esc(p.caption)}</p>
            ${p.comments.length ? `<div class="pc-notes">${p.comments.map((c) => `<p><b>${esc(c.handle)}</b> ${esc(c.text)}</p>`).join("")}</div>` : ""}
            <p class="pc-meta">${ico("flame", "inline")} ${p.likes} people cheered · ${whenText(p)}</p>
            ${!stoppedSelf && b ? `<p class="pc-meta">Reality check ✓ fits your current pace · ${b === "estimate" ? "milestone is an estimate" : esc(b)}</p>` : ""}
            ${p.photo ? `<p class="pc-meta">Photo: <a href="${esc(p.photo.page)}" target="_blank" rel="noopener">${esc(p.photo.title || "untitled")}</a> by ${esc(p.photo.creator)}, ${esc(p.photo.license)}</p>` : ""}
          </div>
          <span class="turn-hint">tap to turn over ↻</span>
        </div>
        <div class="pc-face back">
          <div class="pc-letter"><p>${esc(stoppedSelf ? p.caption : letterOf(p))}</p></div>
          <div class="pc-right">
            <div class="stamp"><div class="stamp-in">${stampFace}</div><span>${year(p.live_date || p.future_date)}</span></div>
            <div class="postmark"><svg viewBox="0 0 120 120" aria-hidden="true">
                <defs><path id="pm-arc-${p.id}" d="M60 60 m-44 0 a44 44 0 1 1 88 0 a44 44 0 1 1 -88 0"/></defs>
                <circle cx="60" cy="60" r="54" /><circle cx="60" cy="60" r="34" />
                <text><textPath href="#pm-arc-${p.id}" startOffset="2%">${esc(pm.place)} · ${esc(pm.place)} ·</textPath></text>
                <text x="60" y="66" text-anchor="middle" class="pm-date">${esc(pm.date)}</text></svg>
              <svg class="waves" viewBox="0 0 160 40" aria-hidden="true"><path d="M0 8 Q20 0 40 8 T80 8 T120 8 T160 8 M0 20 Q20 12 40 20 T80 20 T120 20 T160 20 M0 32 Q20 24 40 32 T80 32 T120 32 T160 32"/></svg>
            </div>
            <div class="address"><p>To: ${esc(S.profile.name)}</p><p>${S.today.slice(0, 4)}, the start of the road</p></div>
          </div>
        </div>
      </div>
    </div>`;
}

function bindFlip() {
  const inner = $("pc-inner");
  const flip = () => { inner.classList.toggle("flipped"); sfx.paper(); };
  $("pc3d").onclick = (e) => { if (!e.target.closest("a")) flip(); };
  $("pc-turn").onclick = (e) => { e.stopPropagation(); flip(); };
  // a little 3D tilt toward the cursor
  const card = $("pc3d");
  card.onpointermove = (e) => {
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    card.style.setProperty("--rx", `${-y * 8}deg`);
    card.style.setProperty("--ry", `${x * 10}deg`);
    card.style.setProperty("--gx", `${(x + 0.5) * 100}%`);
    card.style.setProperty("--gy", `${(y + 0.5) * 100}%`);
  };
  card.onpointerleave = () => { card.style.setProperty("--rx", "0deg"); card.style.setProperty("--ry", "0deg"); };
}

function openPostcard(p, arrived = false) {
  const head = arrived ? `<p class="arrived">A postcard from ${year(p.live_date || p.future_date)} just arrived</p>` : "";
  const actions = `<div class="pc-actions"><button class="btn sketch" id="pc-turn">Turn it over ↻</button><button class="btn sketch" id="pc-close">Back to the road</button></div>`;
  if (!arrived) {
    $("pc-body").innerHTML = head + cardHTML(p) + actions;
    $("pc").hidden = false;
    sfx.paper();
  } else {
    // envelope drops in, flap opens, the card slides out and settles
    $("pc-body").innerHTML = `${head}
      <div class="envelope" id="env">
        <div class="env-back"></div>
        <div class="env-card">${cardHTML(p)}</div>
        <div class="env-front"></div>
        <div class="env-flap"></div>
        <div class="env-seal">${ico("heart")}</div>
      </div>${actions}`;
    $("pc").hidden = false;
    const env = $("env");
    sfx.paper();
    setTimeout(() => { env.classList.add("open"); sfx.paper(); }, 650);
    setTimeout(() => { env.classList.add("out"); }, 1150);
    setTimeout(() => { env.classList.add("done"); sfx.stamp(); buzz([10, 40, 10]); }, 1900);
  }
  bindFlip();
  $("pc-close").onclick = () => ($("pc").hidden = true);
}

function openStack(h, chapter, tl) {
  const list = POSTS[tl].filter((p) => p.habit_id === h.id && (p.chapter ?? 0) === chapter);
  $("pc-body").innerHTML = `
    <div class="stack sketch">
      <h2>Stop ${chapter + 1}${tl === "stopped" ? " · the road not taken" : ""}</h2>
      <p class="muted">${esc(h.chapters[chapter])}</p>
      <div class="stack-grid">${list.map((p, k) => `
        <button class="postcard ${tl} ${k % 2 ? "tilt-r" : "tilt-l"}" data-post="${tl}:${p.id}"><span class="tape"></span>
          <div class="pc-photo">${photoHTML(p)}</div><p>${esc(p.caption)}</p><span class="pc-year">${year(p.live_date || p.future_date)}</span></button>`).join("")}
      </div>
      <button class="btn sketch" id="pc-close">Back to the road</button>
    </div>`;
  $("pc").hidden = false;
  $("pc-close").onclick = () => ($("pc").hidden = true);
  $("pc-body").querySelectorAll("[data-post]").forEach((el) => (el.onclick = () => {
    const [t, id] = el.dataset.post.split(":");
    openPostcard(POSTS[t].find((x) => x.id === +id));
  }));
}

// ---------- story reel ----------

let reel = null;
async function playReel() {
  const posts = POSTS.kept.filter((p) => p.kind !== "boss")
    .sort((a, b) => (a.live_date || a.future_date).localeCompare(b.live_date || b.future_date));
  if (!posts.length) return alert("Check in first. Your story starts with your first postcard.");
  const slides = [{ intro: true }, ...posts, { outro: true }];
  $("reel-bars").innerHTML = slides.map(() => "<i><b></b></i>").join("");
  $("reel").hidden = false;
  reel = { slides, i: 0, timer: null };
  showSlide();
}

function showSlide() {
  const { slides, i } = reel;
  const s = slides[i];
  clearTimeout(reel.timer);
  [...$("reel-bars").children].forEach((bar, k) => { bar.className = k < i ? "done" : k === i ? "now" : ""; });
  const p = S.profile;
  if (s.intro) {
    $("reel-stage").innerHTML = `<div class="slide intro">${avatarHTML(120, { tier: 0 })}
      <h1>${esc(p.name)}, the next ten years</h1><p>${S.today.slice(0, 4)} → 2036</p></div>`;
  } else if (s.outro) {
    $("reel-stage").innerHTML = `<div class="slide intro">${avatarHTML(120)}
      <h1>This future is on its way.</h1><p>Check in tomorrow to write the next chapter.</p></div>`;
  } else {
    $("reel-stage").innerHTML = `
      <div class="slide">
        ${s.photo ? `<img class="kb" src="${s.photo.url}" alt="" referrerpolicy="no-referrer">` : `<div class="kb fallback">${iconOfPost(s)}</div>`}
        <div class="slide-year">${year(s.live_date || s.future_date)}</div>
        <div class="slide-cap"><div class="slide-who">${avatarHTML(32)}<b>${esc(p.handle)}</b><span>${esc(s.location || "")}</span></div>
          <p>${esc(s.caption)}</p></div>
      </div>`;
  }
  reel.timer = setTimeout(() => step(1), s.intro || s.outro ? 3000 : 5000);
}
function step(d) {
  if (!reel) return;
  const n = reel.i + d;
  if (n < 0) return;
  if (n >= reel.slides.length) return closeReel();
  reel.i = n;
  showSlide();
}
function closeReel() {
  if (reel) clearTimeout(reel.timer);
  reel = null;
  $("reel").hidden = true;
}
$("reel-next").onclick = () => step(1);
$("reel-prev").onclick = () => step(-1);
$("reel-x").onclick = closeReel;
document.addEventListener("keydown", (e) => {
  if (!reel) return;
  if (e.key === "ArrowRight") step(1);
  if (e.key === "ArrowLeft") step(-1);
  if (e.key === "Escape") closeReel();
});

// ---------- menu ----------

document.querySelectorAll(".mi[data-ico]").forEach((m) => (m.innerHTML = ico(m.dataset.ico)));
const closeMenu = () => { $("menu").hidden = true; $("menu-btn").setAttribute("aria-expanded", "false"); };
$("menu-btn").onclick = (e) => {
  e.stopPropagation();
  const open = $("menu").hidden;
  $("menu").hidden = !open;
  $("menu-btn").setAttribute("aria-expanded", String(open));
};
document.addEventListener("click", (e) => { if (!e.target.closest("#menu")) closeMenu(); });
$("menu").addEventListener("click", closeMenu);
$("menu-avatar").onclick = () => (S?.profile ? openAvatarSheet() : null);
$("menu-play").onclick = () => (S?.profile ? playReel() : null);
$("menu-add").onclick = () => (S?.profile ? openAdd() : null);
$("menu-intro").onclick = () => { if (!S?.profile) return; sessionStorage.removeItem("ff-intro"); wantIntro = true; window.scrollTo({ top: 0 }); playIntro(); renderRoad(); };
const soundLabel = () => ($("menu-sound").querySelector("b").textContent = sfx.muted ? "Sound: off" : "Sound: on");
$("menu-sound").onclick = (e) => { e.stopPropagation(); sfx.toggle(); soundLabel(); if (!sfx.muted) sfx.pop(); };
soundLabel();
$("menu-reset").onclick = () => $("demo-reset").click();

// ---------- usage + safety ----------

const EVENT = {
  overclaim_fixed: "Reality check rewrote an overclaim",
  habit_refused: "Ladder agent refused an unsafe habit",
  budget_block: "Daily budget cap hit",
};
$("usage-btn").onclick = async () => {
  const u = await api("/api/usage");
  $("u-today").textContent = `Today: ${u.today_tokens.toLocaleString()} of ${u.daily_cap.toLocaleString()} tokens`;
  $("u-runs").innerHTML = u.runs.map((r) => `<tr><td>${r.t.slice(5, 16)}</td><td>${r.agents.replace(/,/g, " + ")}</td><td>${r.i}</td><td>${r.ca}</td><td>${r.o}</td></tr>`).join("");
  $("u-events").innerHTML = u.events.map((e) => {
    let detail = esc(e.detail);
    try {
      const d = JSON.parse(e.detail);
      if (d.before) detail = `<s>${esc(d.before)}</s><br>→ ${esc(d.after)}<br><i>${esc(d.why)}</i>`;
      else if (d.habit) detail = `“${esc(d.habit)}”<br><i>${esc(d.why)}</i>`;
    } catch {}
    return `<li><b>${EVENT[e.kind] || e.kind}</b> · ${e.created_at.slice(5, 16)}<br>${detail}</li>`;
  }).join("") || "<li>Nothing yet</li>";
  $("usage").hidden = false;
};
$("u-close").onclick = () => ($("usage").hidden = true);

// ---------- demo clock ----------

$("demo-btn").onclick = () => {
  $("demo-date").textContent = S ? S.today : "";
  $("demo-status").textContent = "";
  $("demo").hidden = false;
};
$("demo-close").onclick = () => ($("demo").hidden = true);
document.querySelectorAll("#demo [data-days]").forEach((b) => {
  b.onclick = async () => {
    $("demo-status").textContent = "Moving the clock…";
    const r = await api("/api/demo/advance", { days: +b.dataset.days, rate: +b.dataset.rate });
    $("demo-date").textContent = r.today;
    $("demo-status").textContent = "Done. Checking for slumps and level-ups…";
    await refresh();
    $("demo").hidden = true;
  };
});
$("demo-reset").onclick = async () => {
  if (!confirm("Erase all habits, check-ins, and postcards?")) return;
  await api("/api/demo/reset", {});
  $("demo").hidden = true;
  $("ob-habits").innerHTML = "";
  localStorage.removeItem("ff-piece");
  localStorage.removeItem("ff-stop-years");
  refresh();
};

document.querySelectorAll(".overlay").forEach((o) => o.addEventListener("click", (e) => { if (e.target === o) o.hidden = true; }));

// ---------- motion & delight ----------

// Opening: a handwritten hello, then the road draws itself and the postcards drop in.
let wantIntro = !sessionStorage.getItem("ff-intro") && !PLAIN;
function playIntro() {
  if (!wantIntro || !S?.profile) { wantIntro = false; return; }
  sessionStorage.setItem("ff-intro", "1");
  const el = document.createElement("div");
  el.className = "intro";
  el.innerHTML = `<div class="intro-in">
      <p class="i1">Hi ${esc(S.profile.name)}.</p>
      <p class="i2">Your future self has been writing to you.</p>
      <p class="i3">${S.today.slice(0, 4)} → 2036</p></div>`;
  document.body.appendChild(el);
  sfx.paper();
  setTimeout(() => el.classList.add("bye"), 2300);
  setTimeout(() => el.remove(), 3000);
}

function revealRoad() {
  wantIntro = false;
  const wrap = $("roadwrap");
  wrap.classList.remove("reveal");
  void wrap.offsetWidth;
  wrap.classList.add("reveal");
  // draw every solid road stroke from start to end, like a pen
  $("road-svg").querySelectorAll("path").forEach((p, i) => {
    if (p.getAttribute("stroke-dasharray")) { p.style.animation = "fadein 1s 1.4s both"; return; }
    const len = p.getTotalLength();
    p.style.strokeDasharray = len;
    p.style.strokeDashoffset = len;
    p.style.transition = `stroke-dashoffset 1.6s cubic-bezier(.6, .1, .3, 1) ${0.25 + (i % 3) * 0.15}s`;
    requestAnimationFrame(() => (p.style.strokeDashoffset = 0));
  });
  setTimeout(() => wrap.classList.remove("reveal"), 3600);
}

// Hover: postcards tilt toward the cursor; the walker talks; stops show a tooltip card.
const CHEERS = ["Day {d}! Look how far we've come.", "One more step and the next postcard is ours.",
  "{n}, I can see stop {s} from here.", "Small steps. Big road.", "Future us says thanks.", "Hold the button. I'll walk."];
function bindRoadHover() {
  const road = $("road");
  if (road.dataset.bound) return;
  road.dataset.bound = "1";
  road.addEventListener("pointermove", (e) => {
    const card = e.target.closest(".postcard:not(.locked):not(.transit)");
    if (!card) return;
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    card.style.setProperty("--tx", `${-y * 14}deg`);
    card.style.setProperty("--ty", `${x * 16}deg`);
    card.style.setProperty("--gx", `${(x + 0.5) * 100}%`);
    card.style.setProperty("--gy", `${(y + 0.5) * 100}%`);
  });
  road.addEventListener("pointerout", (e) => {
    const card = e.target.closest(".postcard");
    if (card && !card.contains(e.relatedTarget)) { card.style.setProperty("--tx", "0deg"); card.style.setProperty("--ty", "0deg"); }
  });
  road.addEventListener("pointerover", (e) => {
    const piece = e.target.closest(".road-piece");
    if (!piece || piece.contains(e.relatedTarget)) return;
    const h = S.habits.find((x) => x.id === roadHabit);
    const line = CHEERS[Math.floor(Math.random() * CHEERS.length)]
      .replace("{d}", S.day_offset + 1).replace("{n}", S.profile.name).replace("{s}", Math.min(6, (h?.allowed_chapter ?? 0) + 2));
    $("piece-say").textContent = line;
    sfx.tick();
  });
}

// numbers count up when the card appears
function countUp(root) {
  root.querySelectorAll(".me-stats b").forEach((b) => {
    const end = +b.textContent, t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 700);
      b.textContent = Math.round(end * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    step();
  });
}

// ---------- researcher bar (study mode) ----------

function studyBar() {
  if (!STUDY) return;
  document.body.classList.add("study");
  $("ob-habits").insertAdjacentHTML("beforebegin", '<p class="muted small">Pick one.</p>');
  document.body.insertAdjacentHTML("beforeend", `
    <div class="studybar">
      <span class="who">Researcher<b id="sb-date"></b></span>
      <button data-sb="1">Next day →</button>
      <button data-sb="4">Skip 4 days ⏭</button>
    </div>`);
  document.querySelectorAll("[data-sb]").forEach((b) => (b.onclick = async () => {
    if (busy || !S?.profile) return;
    const label = b.textContent;
    b.disabled = true;
    b.textContent = "…";
    await api("/api/demo/advance", { days: +b.dataset.sb, rate: 0 });
    await refresh();
    b.textContent = label;
    b.disabled = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));
}

if (PLAIN) {  // control group: a neutral habit tracker, nothing about the future
  document.querySelector(".logo").textContent = "Streaks";
  document.querySelector(".tagline").hidden = true;
  document.title = "Streaks";
}
// ?dev exposes a couple of functions for testing animations without spending a check-in
if (new URLSearchParams(location.search).has("dev")) window.ff = { openPostcard, posts: () => POSTS };
studyBar();
refresh();
