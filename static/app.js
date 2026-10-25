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
  renderTown();
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
  renderTown({ working: id, noAnim: true });
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
    await townMoment(id, r.kind === "level_up");
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
  if (VIEW !== "road") { wrap.hidden = false; return; }  // laid out when its tab opens
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
  return p.photo ? `${fb}<img src="${p.photo.url}" alt="" decoding="async" referrerpolicy="no-referrer" data-thumb="${p.photo.thumb || ""}" onerror="if(this.dataset.thumb&&this.src!==this.dataset.thumb){this.src=this.dataset.thumb}else{this.remove()}">` : fb;
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

document.querySelectorAll("#views [data-view]").forEach((b) => (b.onclick = () => setView(b.dataset.view)));
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

// ---------- your 2036 town ----------
// Every daily thing is a building on your street. Each check-in lights a window; each new
// stop on that habit's road adds a floor. Unbuilt floors are a blueprint you see on hover.

let VIEW = localStorage.getItem("ff-view") || "town";
const FH = 36, BW = 150, ROOF = 64, MAXF = 6, SVGW = BW + 20, SVGH = MAXF * FH + ROOF, LIFT = 56;
const KIND = { guitar: "hall", music: "hall", piano: "hall", dance: "hall", reading: "library", pencil: "library",
  running: "gym", bike: "gym", dumbbell: "gym", wave: "gym", spanish: "cafe", chat: "cafe", pan: "cafe",
  saving: "home", heart: "home", lotus: "garden", sprout: "garden", drop: "garden", moon: "garden", sun: "garden" };
const KIND_NAME = { hall: "Music hall", library: "Library", gym: "Gym", cafe: "Café", home: "Home", garden: "Greenhouse", studio: "Studio" };
// Muted architectural palette: facade, side (in shade), roof, roof in shade, trim.
const PAL = [
  { wall: "#e7b5a1", side: "#c48b77", roof: "#a4524a", roofS: "#7f3c37", trim: "#fbf0e8" },
  { wall: "#efd29d", side: "#c9a96f", roof: "#bf7d3c", roofS: "#955e2a", trim: "#fff7e6" },
  { wall: "#b3caa5", side: "#8aa47f", roof: "#587a56", roofS: "#435f43", trim: "#f3f7ee" },
  { wall: "#a9bfd5", side: "#8199b4", roof: "#4b6a8d", roofS: "#385270", trim: "#eff4f9" },
  { wall: "#cbbbdb", side: "#a594ba", roof: "#766396", roofS: "#5a4b77", trim: "#f6f1fb" },
  { wall: "#ecae8b", side: "#c78764", roof: "#a35b39", roofS: "#7f4428", trim: "#fdf1e8" },
];
const SC = 1.25, INKC = "#3b312b", D = 20, DY = 9, X0 = 12, W = 128;
const seen = JSON.parse(localStorage.getItem("ff-town") || "{}");
let night = new Date().getHours() < 7 || new Date().getHours() >= 19;
const ln = `stroke="${INKC}" stroke-width="1.2" stroke-linejoin="round"`;

// a box face pair: front rectangle plus the shaded side face going back to the right
const box = (x, y, w, h, front, side) =>
  `<path d="M${x + w} ${y} l${D} ${-DY} v${h} l${-D} ${DY} z" fill="${side}" ${ln}/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${front}" ${ln}/>`;

function windowSVG(x, y, on, isNew, w, p) {
  return `<g class="win ${on ? "lit" : ""} ${isNew ? "new-lit" : ""}" style="--w:${w}">
    <rect x="${x}" y="${y}" width="22" height="20" rx="2" fill="url(#${on ? "glow" : night ? "glassN" : "glass"})" ${ln}/>
    <path d="M${x + 11} ${y + 1}v18M${x + 1} ${y + 9}h20" stroke="${p.trim}" stroke-width="1.6"/>
    ${on ? "" : `<path d="M${x + 4} ${y + 16}l6-11M${x + 9} ${y + 17}l4-7" stroke="#fff" stroke-width="1.4" opacity=".55"/>`}
    <rect x="${x - 2}" y="${y + 20}" width="26" height="3" rx="1" fill="${p.trim}" ${ln} stroke-width=".9"/></g>`;
}

function buildingSVG(h, idx, built, lit, fresh) {
  const p = PAL[idx % 6], kind = KIND[h.icon] || "studio", base = SVGH - 8;
  let out = `<ellipse cx="${X0 + W / 2 + 8}" cy="${base + 1}" rx="${W / 2 + 22}" ry="6" fill="#2b2420" opacity=".14"/>`;
  let w = 0;
  for (let f = 0; f < MAXF; f++) {
    const top = base - (f + 1) * FH - (f >= built ? LIFT : 0);  // blueprint floors float above the roof
    if (f >= built) {
      const yr = (h.chapter_dates[f] || "").slice(0, 4);
      out += `<g class="bp"><path d="M${X0} ${top}h${W}v${FH}h${-W}zM${X0 + W} ${top}l${D} ${-DY}v${FH}l${-D} ${DY}" fill="rgba(91,143,209,.07)" stroke="#5b8fd1" stroke-width="1.1" stroke-dasharray="4 4"/>
        <text x="${X0 + W / 2}" y="${top + FH / 2 + 5}" text-anchor="middle" class="bp-t">floor ${f + 1} · ~${yr}</text></g>`;
      continue;
    }
    let g = box(X0, top, W, FH, p.wall, p.side);
    g += `<rect x="${X0}" y="${top + FH - 5}" width="${W}" height="5" fill="${p.side}" opacity=".35"/>`;  // soft shade under the cornice
    const slots = f === 0 ? [X0 + 12, X0 + 94] : [X0 + 14, X0 + 53, X0 + 92];
    for (const sx of slots) { g += windowSVG(sx, top + 7, w < lit, w < lit && w >= fresh.lit, w, p); w++; }
    if (f === 0) {
      const dx = X0 + 50;
      g += `<path d="M${dx} ${top + FH}v-19a14 14 0 0 1 28 0v19z" fill="#5d4232" ${ln}/>
        <path d="M${dx + 14} ${top + FH - 32}v32" stroke="#4a3427" stroke-width="1"/>
        <circle cx="${dx + 19}" cy="${top + FH - 12}" r="1.6" fill="#f2c55c"/>
        <rect x="${dx - 3}" y="${top + FH - 2}" width="34" height="3" fill="${p.trim}" ${ln} stroke-width=".9"/>`;
      if (kind === "cafe") {  // striped awning over the shop windows
        g += `<path d="M${X0 + 4} ${top + 4}h${W - 8}l-4 9h${-(W - 16)}z" fill="url(#stripe${idx % 6})" ${ln}/>`;
      } else {  // window boxes with a little green
        for (const sx of slots) g += `<rect x="${sx - 1}" y="${top + 30}" width="24" height="4" fill="#8a6a4f"/>
          <circle cx="${sx + 5}" cy="${top + 29}" r="3.2" fill="#6f9a62"/><circle cx="${sx + 12}" cy="${top + 28.5}" r="3.6" fill="#7fae70"/><circle cx="${sx + 18}" cy="${top + 29}" r="3" fill="#6f9a62"/>`;
      }
    }
    out += `<g class="floor ${f >= fresh.floors ? "new" : ""}" style="--f:${f}">${g}</g>`;
  }
  // roof on the highest built floor
  const T = base - built * FH, cx = X0 + W / 2;
  let r = "";
  const parapet = `<path d="M${X0 + W + 3} ${T - 6}l${D} ${-DY}v6l${-D} ${DY}z" fill="${p.side}" ${ln}/><rect x="${X0 - 3}" y="${T - 6}" width="${W + 6}" height="6" fill="${p.trim}" ${ln}/>`;
  if (kind === "hall" || kind === "home" || kind === "cafe") {
    const peak = T - 40;
    r += `<path d="M${cx} ${peak}l${D} ${-DY}L${X0 + W + 4 + D} ${T - DY}L${X0 + W + 4} ${T}z" fill="${p.roofS}" ${ln}/>
      <path d="M${X0 - 4} ${T}L${cx} ${peak}L${X0 + W + 4} ${T}z" fill="${p.roof}" ${ln}/>
      <path d="M${X0 + 8} ${T - 3}L${cx} ${peak + 8}L${X0 + W - 8} ${T - 3}" fill="none" stroke="${p.trim}" stroke-width="1.4" opacity=".6"/>`;
    r += kind === "home"
      ? `<path d="M${X0 + W - 10} ${T - 34}v-16h12v26" fill="#9a6b4f" ${ln}/><rect x="${X0 + W - 12}" y="${T - 54}" width="16" height="5" fill="#7c5440" ${ln}/>
         <rect x="${cx - 9}" y="${T - 24}" width="18" height="14" rx="1" fill="url(#${night ? "glow" : "glass"})" ${ln}/>`
      : `<circle cx="${cx}" cy="${T - 16}" r="8" fill="url(#${night ? "glow" : "glass"})" ${ln}/><path d="M${cx - 8} ${T - 16}h16M${cx} ${T - 24}v16" stroke="${p.trim}" stroke-width="1.3"/>`;
  } else if (kind === "library") {
    r += parapet + `<path d="M${X0 + 22} ${T - 6}a42 34 0 0 1 84 0z" fill="${p.roof}" ${ln}/>
      <path d="M${X0 + 36} ${T - 14}a28 22 0 0 1 30 -16" fill="none" stroke="#fff" stroke-width="2.4" opacity=".35" stroke-linecap="round"/>
      <rect x="${cx - 4}" y="${T - 48}" width="8" height="9" fill="${p.trim}" ${ln}/><path d="M${cx} ${T - 48}v-14" stroke="${INKC}" stroke-width="1.2"/>
      <path class="flag" d="M${cx} ${T - 62}l14 4l-14 4z" fill="#e8b04a" ${ln}/>`;
  } else if (kind === "garden") {
    r += `<path d="M${cx} ${T - 34}l${D} ${-DY}L${X0 + W + D} ${T - DY}L${X0 + W} ${T}z" fill="#bcd9d2" ${ln}/>
      <path d="M${X0} ${T}L${cx} ${T - 34}L${X0 + W} ${T}z" fill="#d7ece6" ${ln}/>
      <path d="M${cx} ${T - 34}V${T}M${cx - 32} ${T - 17}V${T}M${cx + 32} ${T - 17}V${T}M${X0 + 16} ${T - 8}H${X0 + W - 16}" stroke="${INKC}" stroke-width=".8" opacity=".6"/>
      <path d="M${X0 + 22} ${T - 6}L${cx - 10} ${T - 26}" stroke="#fff" stroke-width="2" opacity=".7"/>`;
  } else if (kind === "gym") {
    r += parapet + `<path d="M${X0 + 20} ${T - 6}v-42" stroke="${INKC}" stroke-width="1.4"/><path class="flag" d="M${X0 + 20} ${T - 48}l24 6l-24 6z" fill="#d9655b" ${ln}/>
      <rect x="${X0 + 74}" y="${T - 18}" width="34" height="12" rx="2" fill="${p.trim}" ${ln}/><path d="M${X0 + 78} ${T - 12}h26" stroke="${INKC}" stroke-width="1"/>`;
  } else {  // studio: water tower on the roof
    r += parapet + `<path d="M${X0 + 84} ${T - 6}l4-14M${X0 + 108} ${T - 6}l-4-14" stroke="${INKC}" stroke-width="1.2"/>
      <path d="M${X0 + 82} ${T - 20}v-18a14 5 0 0 1 28 0v18a14 5 0 0 1 -28 0z" fill="#b98a62" ${ln}/><path d="M${X0 + 82} ${T - 38}l14-10l14 10" fill="#8f6748" ${ln}/>
      <path d="M${X0 + 24} ${T - 6}v-22" stroke="${INKC}" stroke-width="1.2"/><circle cx="${X0 + 24}" cy="${T - 30}" r="3.5" fill="#e8b04a" ${ln}/>`;
  }
  out += `<g class="roof ${built > fresh.floors ? "new" : ""}" style="--f:${built - 1}">${r}</g>`;
  const defs = `<defs>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3f8fb"/><stop offset="1" stop-color="#a9bccb"/></linearGradient>
    <linearGradient id="glassN" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a5a7c"/><stop offset="1" stop-color="#2c3757"/></linearGradient>
    <linearGradient id="glow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffeab0"/><stop offset="1" stop-color="#ffb34a"/></linearGradient>
    <pattern id="stripe${idx % 6}" width="12" height="10" patternUnits="userSpaceOnUse"><rect width="6" height="10" fill="${p.roof}"/><rect x="6" width="6" height="10" fill="${p.trim}"/></pattern></defs>`;
  return `<svg viewBox="0 0 ${SVGW} ${SVGH}" width="${SVGW * SC}" height="${SVGH * SC}">${defs}${out}</svg>`;
}

// scenery: soft clouds, a far 2036 skyline, layered hills; trees and lamps between buildings
let CLOUD = "", HILLS = "", TREE = [], LAMP = "", MAILBOX = { up: "", down: "" };
function townArt() {
  if (CLOUD) return;
  CLOUD = `<svg viewBox="0 0 140 50"><path d="M18 44c-12 0-14-14-2-16 0-12 16-16 24-8 4-12 24-14 30-2 10-6 26 0 24 12 14 0 16 14 4 14z" fill="#fff" opacity=".92"/>
    <path d="M20 44h96" stroke="#d9e6ef" stroke-width="3" stroke-linecap="round"/></svg>`;
  const towers = [[60, 70], [95, 110], [120, 58], [180, 92], [215, 130], [250, 76], [900, 84], [935, 126], [965, 66], [1010, 104], [1050, 72], [1180, 96], [1215, 60]]
    .map(([x, hh]) => `<rect x="${x}" y="${190 - hh}" width="30" height="${hh}" rx="2"/>`).join("");
  HILLS = `<svg viewBox="0 0 1400 240" preserveAspectRatio="xMidYMax slice">
    <g class="far" fill="#b9cddc" opacity=".75">${towers}<path d="M1230 190v-170l6-8 6 8v170z"/></g>
    <path class="mid" d="M0 172C180 120 300 150 430 140S700 96 860 132 1150 120 1400 140V240H0z" fill="#bcd3b4"/>
    <path class="near" d="M0 200C220 166 380 196 560 182S900 160 1080 186 1300 176 1400 182V240H0z" fill="#9fc195"/></svg>`;
  for (const [a, b] of [["#7fae70", "#6a9a5d"], ["#8fbb7a", "#739f63"]]) {
    TREE.push(`<svg viewBox="0 0 40 70"><ellipse cx="20" cy="67" rx="14" ry="3" fill="#2b2420" opacity=".14"/>
      <path d="M19 66V40h2v26z" fill="#7a5a43"/>
      <g class="crown"><circle cx="20" cy="28" r="15" fill="${b}"/><circle cx="15" cy="24" r="11" fill="${a}"/><circle cx="24" cy="20" r="8" fill="${a}"/>
      <circle cx="13" cy="20" r="3" fill="#fff" opacity=".18"/></g></svg>`);
  }
  LAMP = `<svg viewBox="0 0 30 90"><circle class="halo" cx="15" cy="14" r="14" fill="#ffd27a"/><path d="M14 88V20h2v68z" fill="#3b312b"/>
    <path d="M9 18h12l-2-9h-8z" fill="#3b312b"/><rect x="11" y="10" width="8" height="8" fill="#ffe6a3"/><rect x="10" y="86" width="10" height="3" fill="#3b312b"/></svg>`;
  for (const up of [true, false]) {
    MAILBOX[up ? "up" : "down"] = `<svg viewBox="0 -10 46 62"><path d="M15 28v24" stroke="${INKC}" stroke-width="2.4"/>
      <path d="M4 16a10 10 0 0 1 10-10h18v22H4z" fill="#5f86ad" ${ln}/><path d="M32 6a8 8 0 0 1 8 8v14h-8z" fill="#4a6d91" ${ln}/>
      <g class="mb-flag">${up ? `<path d="M34 12V-6h9v7h-7" fill="#d9655b" ${ln}/>` : `<path d="M34 20h12v6H34" fill="#d9655b" ${ln}/>`}</g></svg>`;
  }
}

const SUPPORT = ["Go {n}! I can hear you from here.", "Floor {f}! I'm so proud of you.", "Save me a seat at the top, {n}.",
  "Look at this place. You built that.", "See you tomorrow, same time?"];

function renderTown(opts = {}) {
  const wrap = $("townwrap");
  const show = !PLAIN && S.habits.length;
  $("views").hidden = !show;
  if (!show) { wrap.hidden = true; return; }
  $("views").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.view === VIEW));
  wrap.hidden = VIEW !== "town";
  $("roadwrap").classList.toggle("off", VIEW !== "road");
  if (VIEW !== "town") return;
  townArt();
  const name = S.profile.name, friend = S.profile.cast?.[0]?.name || "Mom";
  const sounds = [];
  const lots = S.habits.map((h, idx) => {
    const built = Math.min(MAXF, Math.max(1, h.allowed_chapter + 1));
    const total = built * 3 - 1, lit = Math.min(total, h.checkins);
    const was = seen[h.id] || { floors: built, lit };
    const fresh = opts.noAnim ? { floors: built, lit } : was;
    if (built > fresh.floors) sounds.push("stamp"); else if (lit > fresh.lit) sounds.push("pop");
    seen[h.id] = { floors: built, lit };
    const kind = KIND[h.icon] || "studio";
    const mine = POSTS.kept.filter((p) => p.habit_id === h.id);
    const next = h.chapters[built] ? `<i>Next floor (~${year(h.chapter_dates[built])}): ${esc(lower(h.chapters[built]))}</i>` : `<i>Finished. This one is ten years tall.</i>`;
    const toNext = h.next_level_at ? `${h.next_level_at - h.checkins} check-in${h.next_level_at - h.checkins === 1 ? "" : "s"} to the next floor` : "";
    return `
      <div class="lot ${opts.working === h.id ? "working" : ""} ${h.checked_today ? "done-today" : ""}" data-h="${h.id}" style="--b:${idx}">
        <div class="lot-tip"><b>${KIND_NAME[kind]} · floor ${built} of 6</b>${esc(h.allowed_milestone ? `Future you ${lower(h.allowed_milestone.milestone)}.` : "")}${next}<small>${toNext}${toNext ? " · " : ""}${lit} of ${total} windows lit</small></div>
        ${h.quest ? `<div class="lot-storm">${ico("storm")}<span class="rain"></span><b>Comeback quest ${h.quest.progress}/3</b></div>` : ""}
        <div class="lot-sign" style="bottom:${(built * FH + ROOF - 2) * SC}px">${hIcon(h, "inline")} ${esc(h.short)}</div>
        <div class="lot-work">Building floor ${built + 1}…<br><small>your postcard is on its way</small></div>
        <button class="lot-b" aria-label="${esc(h.short)}: see its postcard road">${buildingSVG(h, idx, built, lit, fresh)}</button>
        <span class="lot-say">${esc(friend)}: “${esc(SUPPORT[(h.checkins + idx) % SUPPORT.length].replace("{n}", name).replace("{f}", built))}”</span>
        <button class="mailbox ${mine.length ? "has" : ""}" data-mail="${h.id}" aria-label="Postcards">${mine.length ? MAILBOX.up : MAILBOX.down}${mine.length ? `<b>${mine.length}</b>` : ""}</button>
        <p class="lot-name">${KIND_NAME[kind]}<small>${esc(h.short)} · ${h.checked_today ? "done today ✓" : "not yet today"}</small></p>
      </div>
      <span class="prop ${idx % 2 ? "lamp" : "tree"}" style="--d:${idx}">${idx % 2 ? LAMP : TREE[idx % 4 === 0 ? 0 : 1]}</span>`;
  }).join("");
  localStorage.setItem("ff-town", JSON.stringify(seen));

  const pop = 1 + (S.profile.cast?.length || 0);
  $("town").className = `town ${night ? "night" : ""}`;
  $("town").innerHTML = `
    <div class="sky">
      <span class="cloud c1">${CLOUD}</span><span class="cloud c2">${CLOUD}</span><span class="cloud c3">${CLOUD}</span>
      ${night ? `<span class="stars"></span>` : ""}
    </div>
    <div class="hills">${HILLS}</div>
    <div class="street-scroll"><div class="street">
      <div class="welcome"><b>${esc(name)}ville</b><small>est. ${S.today.slice(0, 4)} · pop. ${pop}</small></div>
      ${lots}
      <div class="lot empty" id="lot-add"><div class="lot-plot"><span>${ico("sprout")}</span><b>Empty lot</b><small>Add a daily thing<br>and build here</small></div></div>
      <span class="walker" id="walker">${avatarHTML(S.profile.avatar?.photo ? 38 : 36, { tier: 0 })}<span class="say">Day ${S.day_offset + 1} in ${esc(name)}ville.</span></span>
    </div></div>
    <button class="sun" id="sun" aria-label="Day or night" title="${night ? "Back to day" : "See your town at night"}">${night ? "" : "<i></i>"}</button>`;

  const town = $("town");
  town.querySelectorAll(".lot[data-h] .lot-b").forEach((b) => (b.onclick = () => {
    roadHabit = +b.closest(".lot").dataset.h; setView("road");
  }));
  town.querySelectorAll("[data-mail]").forEach((b) => (b.onclick = () => {
    const mine = POSTS.kept.filter((p) => p.habit_id === +b.dataset.mail);
    if (mine.length) { sfx.paper(); openPostcard(mine[0]); } else b.classList.add("nomail");
  }));
  town.querySelectorAll(".lot[data-h]").forEach((l) => (l.onmouseenter = () => {
    sfx.tick();
    const r = l.getBoundingClientRect(), t = town.getBoundingClientRect();  // keep the tip card inside the town
    l.classList.toggle("tip-r", r.right + 230 > t.right);
  }));
  $("lot-add").onclick = openAdd;
  $("sun").onclick = () => { night = !night; sfx.chime(); renderTown({ noAnim: true }); };
  if (!town.dataset.bound) {
    town.dataset.bound = "1";
    town.addEventListener("pointermove", (e) => {  // parallax: the hills and clouds drift against the cursor
      const r = town.getBoundingClientRect();
      town.style.setProperty("--px", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
      town.style.setProperty("--py", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
    });
  }
  if (wantIntro) revealTown();
  else if (sounds.length) setTimeout(() => { sfx[sounds.includes("stamp") ? "stamp" : "pop"](); buzz(30); }, sounds.includes("stamp") ? 700 : 300);
}

function revealTown() {
  wantIntro = false;
  const t = $("town");
  t.classList.add("reveal");
  setTimeout(() => sfx.paper(), 900);
  setTimeout(() => t.classList.remove("reveal"), 4200);
}

function setView(v) {
  VIEW = v;
  localStorage.setItem("ff-view", v);
  sfx.tick();
  renderTown({ noAnim: true });
  if (v === "road") renderRoad();
}

// after a check-in, show the building change before the postcard opens
async function townMoment(id, levelUp) {
  if (VIEW !== "town") return;
  const lot = $("town").querySelector(`.lot[data-h="${id}"]`);
  lot?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  lot?.classList.add("celebrate");
  await new Promise((ok) => setTimeout(ok, levelUp ? 1700 : 1100));
}

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
