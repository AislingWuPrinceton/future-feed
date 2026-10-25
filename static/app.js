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
const MAXF = 6;
const KIND = { guitar: "hall", music: "hall", piano: "hall", dance: "hall", reading: "library", pencil: "studio", palette: "studio", camera: "studio", laptop: "studio",
  running: "gym", bike: "gym", dumbbell: "gym", wave: "gym", spanish: "cafe", chat: "cafe", pan: "cafe",
  saving: "home", heart: "home", lotus: "garden", sprout: "garden", drop: "garden", moon: "garden", sun: "garden" };
const KIND_NAME = { hall: "Music hall", library: "Library", gym: "Gym", cafe: "Café", home: "Home", garden: "Greenhouse", studio: "Studio" };
// The town is drawn like an urban sketch: wobbly ink lines (rough.js) over loose watercolor
// washes that bleed a little past the lines, on the same paper as the rest of the app.
const SC = 1.2, X0 = 14, INK = "#2b2420";
const seen = JSON.parse(localStorage.getItem("ff-town") || "{}");
let night = new Date().getHours() < 7 || new Date().getHours() >= 19;
const STYLE = {
  hall: { W: 160, wall: "#efc3b3", alt: "#f1d0a6", trim: "#fbe9df", roof: "#b9675a" },
  library: { W: 150, wall: "#eadfc4", alt: "#dfe3ec", trim: "#faf3e3", roof: "#8fb8a8" },
  cafe: { W: 116, wall: "#f3d197", alt: "#f2c1c6", trim: "#fcecd1", roof: "#7d8ca8" },
  home: { W: 134, wall: "#d5e5c5", alt: "#cfe0ee", trim: "#f5f9ef", roof: "#bd6a4c" },
  gym: { W: 152, wall: "#d7dde3", alt: "#e4dccd", trim: "#f2f4f6", roof: "#e27d6b" },
  garden: { W: 140, wall: "#d2ece0", alt: "#e2efd0", trim: "#eef8f3", roof: "#8fc4ab" },
  studio: { W: 148, wall: "#d39478", alt: "#c9a58c", trim: "#f3dccd", roof: "#77685f" },
};
const WIN_COUNT = { hall: [4, 5], library: [2, 4], cafe: [2, 2], home: [2, 3], gym: [4, 4], garden: [3, 4], studio: [3, 3] };

// a fresh pen for each building; fixed seeds keep every drawing identical between renders
function pen(seed) {
  const host = document.createElementNS("http://www.w3.org/2000/svg", "svg"), rc = rough.svg(host);
  const o = (e = {}) => ({ stroke: INK, strokeWidth: 1.15, roughness: 0.85, bowing: 0.8, seed: ++seed, ...e });
  return {
    rect: (x, y, w, h, e) => rc.rectangle(x, y, w, h, o(e)).outerHTML,
    line: (x1, y1, x2, y2, e) => rc.line(x1, y1, x2, y2, o(e)).outerHTML,
    path: (d, e) => rc.path(d, o(e)).outerHTML,
    circle: (x, y, d, e) => rc.circle(x, y, d, o(e)).outerHTML,
    ellipse: (x, y, w, h, e) => rc.ellipse(x, y, w, h, o(e)).outerHTML,
  };
}
const wr = (x, y, w, h, c, extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}" ${extra}/>`;
const wp = (d, c, extra = "") => `<path d="${d}" fill="${c}" ${extra}/>`;
const arch = (x, y, w, h) => `M${x} ${y + h}V${y + w / 2}A${w / 2} ${w / 2} 0 0 1 ${x + w} ${y + w / 2}V${y + h}Z`;

function buildingSVG(h, idx, built, checkins, fresh, alt) {
  const kind = KIND[h.icon] || "studio", st = STYLE[kind], Wd = st.W, wall = alt ? st.alt : st.wall;
  const x0 = kind === "cafe" ? 34 : X0, cx = x0 + Wd / 2, SVGW = Wd + x0 + X0 + 6, SVGH = 304, base = SVGH - 10;
  const P = pen(h.id * 131 + idx);
  const total = WIN_COUNT[kind][0] + (built - 1) * WIN_COUNT[kind][1], lit = Math.min(total, checkins);
  let w = 0, out = "";
  const glass = () => (night ? "#55628a" : "#bcd4e4");
  // a window: wash (lit or glass) + ink outline + glazing bars
  const win = (x, y, ww, hh, shape = "rect") => {
    const on = w < lit, isNew = on && w >= fresh.lit, d = shape === "arch" ? arch(x, y, ww, hh) : null;
    const fill = on ? "#ffd36b" : glass();
    const wash = `<g class="win ${on ? "lit" : ""} ${isNew ? "new-lit" : ""}" style="--w:${w}">${d ? wp(d, fill) : wr(x, y, ww, hh, fill)}</g>`;
    const ink = (d ? P.path(d) : P.rect(x, y, ww, hh)) + P.line(x + ww / 2, y + (d ? ww / 2 - 4 : 1), x + ww / 2, y + hh - 1, { strokeWidth: 0.8 })
      + (shape === "rect" ? P.line(x + 1, y + hh * 0.45, x + ww - 1, y + hh * 0.45, { strokeWidth: 0.8 }) : "");
    w++;
    return [wash, ink];
  };
  const floor = (f, wash, ink) => `<g class="floor ${f >= fresh.floors ? "new" : ""}" style="--f:${f}">
      <g class="wash" filter="url(#wc)" transform="translate(1.6 1.2)">${wash}</g><g class="ink">${ink}</g></g>`;

  out += `<ellipse cx="${cx + 4}" cy="${base + 2}" rx="${Wd / 2 + 16}" ry="5" fill="#2b2420" opacity=".12" filter="url(#wc)"/>`;
  for (let f = 0; f < 6; f++) {
    const FH = 36, top = base - (f + 1) * FH - (f >= built ? 58 : 0);
    if (f >= built) {  // blueprint floors float above the roof
      out += `<g class="bp"><rect x="${x0}" y="${top}" width="${Wd}" height="${FH}" fill="rgba(91,143,209,.06)" stroke="#5b8fd1" stroke-width="1.1" stroke-dasharray="5 4"/>
        <text x="${cx}" y="${top + FH / 2 + 6}" text-anchor="middle" class="bp-t">floor ${f + 1} · ~${(h.chapter_dates[f] || "").slice(0, 4)}</text></g>`;
      continue;
    }
    let wash = wr(x0, top, Wd, FH, wall), ink = P.rect(x0, top, Wd, FH);
    const add = ([a, b]) => { wash += a; ink += b; };
    const g = f === 0;
    if (kind === "hall") {
      if (g) {
        [x0 + 12, x0 + 38, x0 + 104, x0 + 130].forEach((x) => add(win(x, top + 9, 18, 25, "arch")));
        wash += wp(arch(cx - 15, top + 6, 30, 30), "#8a5a44");
        ink += P.path(arch(cx - 15, top + 6, 30, 30)) + P.line(cx, top + 21, cx, base);
        wash += wr(cx - 30, top - 4, 60, 10, "#f6d36d");  // marquee with bulbs
        ink += P.rect(cx - 30, top - 4, 60, 10) + `<text x="${cx}" y="${top + 4}" text-anchor="middle" class="sk-t">TONIGHT</text>`
          + [0, 1, 2, 3, 4, 5, 6].map((i) => `<circle cx="${cx - 27 + i * 9}" cy="${top + 8}" r="1.3" fill="#e2a23a"/>`).join("");
      } else {
        [x0 + 12, x0 + 40, x0 + 71, x0 + 102, x0 + 130].forEach((x) => add(win(x, top + 7, 18, 24, "arch")));
        ink += P.line(x0, top + 33, x0 + Wd, top + 33, { strokeWidth: 0.7 });
      }
    } else if (kind === "library") {
      if (g) {
        wash += wr(x0 - 8, base - 6, Wd + 16, 6, "#e3d8c2");
        ink += P.line(x0 - 8, base - 6, x0 + Wd + 8, base - 6) + P.line(x0 - 4, base - 3, x0 + Wd + 4, base - 3);
        [x0 + 16, x0 + 50, x0 + 90, x0 + 124].forEach((x) => {
          wash += wr(x, top + 8, 10, FH - 14, "#f7f0e0");
          ink += P.rect(x, top + 8, 10, FH - 14) + P.rect(x - 2, top + 6, 14, 3, { strokeWidth: 0.9 });
        });
        add(win(x0 + 31, top + 12, 14, 16)); add(win(x0 + 105, top + 12, 14, 16));
        wash += wr(cx - 9, top + 12, 18, FH - 18, "#6e5a4a");
        ink += P.rect(cx - 9, top + 12, 18, FH - 18) + `<text x="${cx}" y="${top + 5}" text-anchor="middle" class="sk-t">LIBRARY</text>`;
      } else {
        [x0 + 20, x0 + 54, x0 + 82, x0 + 116].forEach((x) => {
          add(win(x, top + 8, 14, 24));
          wash += wp(`M${x - 2} ${top + 8}h18l-3 -4h-12z`, st.trim);
          ink += P.path(`M${x - 2} ${top + 8}h18l-3 -4h-12z`, { strokeWidth: 0.8 });
        });
      }
    } else if (kind === "cafe") {
      if (g) {
        add(win(x0 + 8, top + 13, 26, 21)); add(win(x0 + 34, top + 13, 26, 21));
        wash += wr(x0 + 74, top + 8, 20, FH - 8, "#5f8a8b");
        ink += P.rect(x0 + 74, top + 8, 20, FH - 8) + `<circle cx="${x0 + 90}" cy="${top + 22}" r="1.4" fill="${INK}"/>`;
        const aw = `M${x0 + 2} ${top + 2}h${Wd - 4}v8` + Array.from({ length: 9 }, (_, i) => `a${(Wd - 4) / 18} 3 0 0 1 ${-(Wd - 4) / 9} 0`).join("") + "z";
        wash += Array.from({ length: 9 }, (_, i) => wr(x0 + 2 + i * (Wd - 4) / 9, top + 2, (Wd - 4) / 9, 10, i % 2 ? "#fdf4e6" : "#d9655b")).join("");
        ink += P.path(aw);
        wash += `<circle cx="${x0 + Wd + 13}" cy="${top - 8}" r="8" fill="#fdf4e6"/>`;  // hanging cup sign
        ink += P.line(x0 + Wd, top - 18, x0 + Wd + 16, top - 18) + P.circle(x0 + Wd + 13, top - 8, 16)
          + P.path(`M${x0 + Wd + 9} ${top - 11}h8v5a4 4 0 0 1 -8 0zM${x0 + Wd + 17} ${top - 9}a2 2 0 0 1 0 4`, { strokeWidth: 0.9 });
        // a little table outside
        wash += `<ellipse cx="${x0 - 16}" cy="${base - 14}" rx="10" ry="2.5" fill="#fdf4e6"/>`;
        ink += P.ellipse(x0 - 16, base - 14, 20, 5) + P.line(x0 - 16, base - 13, x0 - 16, base) + P.line(x0 - 22, base, x0 - 10, base)
          + P.path(`M${x0 - 30} ${base}v-12h5M${x0 - 30} ${base - 6}h6v6`, { strokeWidth: 0.9 });
      } else {
        [x0 + 16, x0 + Wd - 38].forEach((x) => {
          add(win(x, top + 4, 22, 24, "arch"));
          ink += P.rect(x - 5, top + 24, 32, 9, { strokeWidth: 0.9 })
            + [0, 1, 2, 3, 4, 5].map((i) => P.line(x - 1 + i * 5, top + 24, x - 1 + i * 5, top + 33, { strokeWidth: 0.6 })).join("");
          wash += [0, 1, 2].map((i) => `<circle cx="${x + 2 + i * 9}" cy="${top + 23}" r="3" fill="${["#ef7f97", "#f6a15b", "#ef7f97"][i]}"/>`).join("");
        });
      }
    } else if (kind === "home") {
      ink += [1, 2, 3, 4, 5].map((i) => `<line x1="${x0 + 2}" y1="${top + i * 6}" x2="${x0 + Wd - 2}" y2="${top + i * 6}" stroke="${INK}" stroke-width=".5" opacity=".18"/>`).join("");
      const shut = (x, y, ww, hh) => {
        add(win(x, y, ww, hh));
        wash += wr(x - 6, y, 5, hh, st.roof) + wr(x + ww + 1, y, 5, hh, st.roof);
        ink += P.rect(x - 6, y, 5, hh, { strokeWidth: 0.8 }) + P.rect(x + ww + 1, y, 5, hh, { strokeWidth: 0.8 });
      };
      if (g) {
        shut(x0 + 14, top + 10, 20, 18); shut(x0 + Wd - 34, top + 10, 20, 18);
        wash += wr(cx - 11, top + 8, 22, FH - 8, "#7c9a8e") + wp(`M${cx - 20} ${top + 9}L${cx} ${top - 4}L${cx + 20} ${top + 9}Z`, st.roof);
        ink += P.rect(cx - 11, top + 8, 22, FH - 8) + P.circle(cx, top + 16, 7) + P.path(`M${cx - 20} ${top + 9}L${cx} ${top - 4}L${cx + 20} ${top + 9}Z`)
          + P.line(cx - 17, top + 9, cx - 17, base) + P.line(cx + 17, top + 9, cx + 17, base);
        for (const [a, b] of [[x0 - 8, x0 + 40], [x0 + Wd - 40, x0 + Wd + 8]]) {  // picket fence
          ink += P.line(a, base - 6, b, base - 6, { strokeWidth: 0.8 });
          for (let x = a; x <= b; x += 6) { wash += wp(`M${x} ${base}v-10l2 -3l2 3v10z`, "#fffaf0"); ink += P.path(`M${x} ${base}v-10l2 -3l2 3v10`, { strokeWidth: 0.7 }); }
        }
      } else {
        shut(x0 + 16, top + 8, 20, 20); add(win(cx - 7, top + 9, 14, 16)); shut(x0 + Wd - 36, top + 8, 20, 20);
      }
    } else if (kind === "gym") {
      wash += wr(x0 - 3, top - 1, Wd + 6, 4, "#aab3bd");
      ink += P.rect(x0 - 3, top - 1, Wd + 6, 4, { strokeWidth: 0.9 });
      if (g) {
        [x0 + 8, x0 + 36, x0 + 94, x0 + 122].forEach((x) => add(win(x, top + 8, 24, 26)));
        wash += wr(cx - 14, top + 8, 28, FH - 8, "#cfe3ee") + wr(x0, top + 3, Wd, 4, st.roof);
        ink += P.rect(cx - 14, top + 8, 28, FH - 8) + P.line(cx, top + 8, cx, base) + `<text x="${cx}" y="${top + 7}" text-anchor="middle" class="sk-t">FIT · CLUB</text>`;
      } else {
        const pw = (Wd - 16) / 4;
        [0, 1, 2, 3].forEach((i) => add(win(x0 + 8 + i * pw, top + 9, pw, 18)));
      }
    } else if (kind === "garden") {
      wash = wr(x0, top, Wd, FH, wall, `opacity=".75"`);
      ink += [1, 2, 3, 4, 5, 6].map((i) => `<line x1="${x0 + i * 20}" y1="${top}" x2="${x0 + i * 20}" y2="${top + FH}" stroke="${INK}" stroke-width=".6" opacity=".35"/>`).join("");
      if (g) {
        [x0 + 6, x0 + 36, x0 + 106].forEach((x) => add(win(x, top + 6, 26, 26)));
        wash += wp(arch(cx - 12, top + 6, 24, 30), "#b8dccb");
        ink += P.path(arch(cx - 12, top + 6, 24, 30)) + P.line(cx, top + 18, cx, base);
        for (const x of [x0 - 6, x0 + Wd - 2]) {  // potted plants
          wash += wp(`M${x} ${base - 9}h10l-2 9h-6z`, "#c9805a") + `<circle cx="${x + 5}" cy="${base - 14}" r="6" fill="#7fae70"/>`;
          ink += P.path(`M${x} ${base - 9}h10l-2 9h-6z`, { strokeWidth: 0.9 }) + P.path(`M${x + 5} ${base - 9}c-6 -4 -4 -10 0 -12c4 2 6 8 0 12`, { strokeWidth: 0.8 });
        }
      } else {
        [0, 1, 2, 3].forEach((i) => add(win(x0 + 6 + i * 33, top + 5, 28, 26)));
      }
      wash += [0, 1, 2, 3, 4, 5, 6].map((i) => `<circle cx="${x0 + 6 + i * 21}" cy="${top + FH - 3 - (i % 2) * 3}" r="${4 + (i % 3)}" fill="#7fae70"/>`).join("");
      ink += P.path(`M${x0} ${top + 2}` + [1, 2, 3, 4, 5, 6, 7].map((i) => `Q${x0 + i * 20 - 10} ${top + 9} ${x0 + i * 20} ${top + 2}`).join(""), { stroke: "#4f7d47", strokeWidth: 1 });
    } else {  // studio: brick loft with big factory windows
      wash += wr(x0, top, Wd, FH, "url(#brick)");
      const fw = (x, y, ww, hh, n) => {
        for (let i = 0; i < n; i++) add(win(x + (i * ww) / n, y, ww / n, hh));
        ink += P.path(`M${x - 2} ${y - 1}Q${x + ww / 2} ${y - 7} ${x + ww + 2} ${y - 1}`, { strokeWidth: 1 });
      };
      if (g) {
        fw(x0 + 10, top + 10, 72, 24, 3);
        wash += wr(x0 + 100, top + 8, 26, FH - 8, "#6c7f92");
        ink += P.rect(x0 + 100, top + 8, 26, FH - 8) + [1, 2, 3].map((i) => P.line(x0 + 100, top + 8 + i * 7, x0 + 126, top + 8 + i * 7, { strokeWidth: 0.6 })).join("");
      } else {
        fw(x0 + 10, top + 9, 60, 23, 2); fw(x0 + 80, top + 9, 58, 23, 1);
      }
    }
    out += floor(f, wash, ink);
  }

  // roof on the highest built floor
  const T = base - built * 36;
  let wash = "", ink = "", roofTop = T - 40;
  if (kind === "hall") {
    const d = `M${x0 - 6} ${T}L${cx} ${T - 32}L${x0 + Wd + 6} ${T}Z`;
    wash += wr(x0 - 6, T - 5, Wd + 12, 5, st.trim) + wp(d, st.roof);
    ink += P.rect(x0 - 6, T - 5, Wd + 12, 5) + P.path(d) + P.circle(cx, T - 13, 16) + P.ellipse(cx - 2, T - 9, 6, 4.5)
      + P.path(`M${cx + 1} ${T - 9}V${T - 20}l5 2`, { strokeWidth: 1 });
    wash += `<circle cx="${cx}" cy="${T - 13}" r="8" fill="${st.trim}"/>`;
    roofTop = T - 36;
  } else if (kind === "library") {
    const dome = `M${cx - 40} ${T - 8}A40 32 0 0 1 ${cx + 40} ${T - 8}Z`;
    wash += wr(x0 - 4, T - 8, Wd + 8, 8, st.trim) + wp(dome, st.roof) + wr(cx - 6, T - 50, 12, 10, st.trim);
    ink += P.rect(x0 - 4, T - 8, Wd + 8, 8) + [...Array(18)].map((_, i) => `<line x1="${x0 + 2 + i * 8.4}" y1="${T - 7}" x2="${x0 + 2 + i * 8.4}" y2="${T - 1}" stroke="${INK}" stroke-width=".7"/>`).join("")
      + P.path(dome) + P.path(`M${cx - 20} ${T - 8}Q${cx - 18} ${T - 34} ${cx} ${T - 40}M${cx + 20} ${T - 8}Q${cx + 18} ${T - 34} ${cx} ${T - 40}`, { strokeWidth: 0.8 })
      + P.rect(cx - 6, T - 50, 12, 10) + P.line(cx, T - 50, cx, T - 64) + `<path class="flag" d="M${cx} ${T - 64}l12 3l-12 3z" fill="#e8b04a" stroke="${INK}" stroke-width="1"/>`;
    roofTop = T - 64;
  } else if (kind === "cafe") {
    const m = `M${x0 - 4} ${T}L${x0 + 10} ${T - 30}H${x0 + Wd - 10}L${x0 + Wd + 4} ${T}Z`;
    wash += wp(m, st.roof) + wr(cx - 11, T - 26, 22, 18, st.trim) + wp(`M${cx - 14} ${T - 26}L${cx} ${T - 38}L${cx + 14} ${T - 26}Z`, st.roof)
      + wr(x0 + Wd - 30, T - 44, 7, 16, "#c98d5e") + wr(x0 + Wd - 21, T - 42, 7, 14, "#c98d5e");
    ink += P.path(m) + [1, 2, 3].map((i) => P.line(x0 + 6 - i, T - 8 * i, x0 + Wd - 6 + i, T - 8 * i, { strokeWidth: 0.6 })).join("")
      + P.rect(x0 + Wd - 30, T - 44, 7, 16) + P.rect(x0 + Wd - 21, T - 42, 7, 14)
      + P.rect(cx - 11, T - 26, 22, 18) + P.path(`M${cx - 14} ${T - 26}L${cx} ${T - 38}L${cx + 14} ${T - 26}Z`);
    const [a, b] = win(cx - 6, T - 23, 12, 13); wash += a; ink += b; w--;  // dormer (not counted)
    roofTop = T - 44;
  } else if (kind === "home") {
    const d = `M${x0 - 8} ${T}L${cx} ${T - 48}L${x0 + Wd + 8} ${T}Z`;
    wash += wr(x0 + Wd - 40, T - 46, 12, 26, "#b07c5e") + wp(d, st.roof);
    ink += P.rect(x0 + Wd - 40, T - 46, 12, 26) + P.path(d) + P.circle(cx, T - 18, 14)
      + [1, 2, 3].map((i) => P.line(cx - i * 13, T - 48 + i * 12, cx + i * 13, T - 48 + i * 12, { strokeWidth: 0.6 })).join("")
      + `<path class="smoke" d="M${x0 + Wd - 34} ${T - 50}c-6 -6 6 -10 0 -16s6 -10 0 -16" fill="none" stroke="#8b7f76" stroke-width="1.6" stroke-linecap="round"/>`;
    wash += `<circle cx="${cx}" cy="${T - 18}" r="7" fill="${checkins > 0 && night ? "#ffd36b" : glass()}"/>`;
    roofTop = T - 48;
  } else if (kind === "gym") {
    wash += wr(x0 - 3, T - 6, Wd + 6, 6, "#aab3bd") + `<ellipse cx="${cx}" cy="${T - 16}" rx="60" ry="9" fill="${st.roof}"/><ellipse cx="${cx}" cy="${T - 16}" rx="44" ry="5" fill="#9ed39b"/>`;
    ink += P.rect(x0 - 3, T - 6, Wd + 6, 6) + P.ellipse(cx, T - 16, 120, 18) + P.ellipse(cx, T - 16, 88, 10)
      + P.line(cx - 60, T - 16, cx - 60, T - 6, { strokeWidth: 0.8 }) + P.line(cx + 60, T - 16, cx + 60, T - 6, { strokeWidth: 0.8 })
      + P.line(x0 + Wd - 8, T - 6, x0 + Wd - 8, T - 46) + `<path class="flag" d="M${x0 + Wd - 8} ${T - 46}l-18 5l18 5z" fill="#ef7f97" stroke="${INK}" stroke-width="1"/>`;
    roofTop = T - 46;
  } else if (kind === "garden") {
    const d = `M${x0} ${T}A${Wd / 2} 34 0 0 1 ${x0 + Wd} ${T}Z`;
    wash += wp(d, st.roof, `opacity=".7"`);
    ink += P.path(d) + [-2, -1, 0, 1, 2].map((i) => {
      const x = cx + i * 24, y = T - 34 * Math.sqrt(1 - ((x - cx) / (Wd / 2)) ** 2);
      return `<line x1="${x}" y1="${T}" x2="${x}" y2="${y}" stroke="${INK}" stroke-width=".7" opacity=".6"/>`;
    }).join("") + P.line(cx, T - 34, cx, T - 50) + P.path(`M${cx - 8} ${T - 46}h16l-4 -3m4 3l-4 3`, { strokeWidth: 0.9 });
    roofTop = T - 50;
  } else {  // studio: sawtooth roof with skylights and a water tower
    const tw = Wd / 3;
    for (let i = 0; i < 3; i++) {
      const x = x0 + i * tw, d = `M${x} ${T}L${x + tw} ${T - 20}V${T}Z`;
      wash += wp(d, st.roof) + wr(x + tw - 4, T - 18, 4, 18, "#bcd4e4");
      ink += P.path(d);
    }
    wash += wr(x0 + Wd - 44, T - 58, 26, 18, "#b98a62") + wp(`M${x0 + Wd - 46} ${T - 58}L${x0 + Wd - 31} ${T - 68}L${x0 + Wd - 16} ${T - 58}Z`, "#8f6748");
    ink += P.rect(x0 + Wd - 44, T - 58, 26, 18) + P.path(`M${x0 + Wd - 46} ${T - 58}L${x0 + Wd - 31} ${T - 68}L${x0 + Wd - 16} ${T - 58}Z`)
      + P.line(x0 + Wd - 42, T - 40, x0 + Wd - 44, T - 20) + P.line(x0 + Wd - 20, T - 40, x0 + Wd - 18, T - 20)
      + P.line(x0 + Wd - 43, T - 30, x0 + Wd - 19, T - 30, { strokeWidth: 0.7 });
    roofTop = T - 68;
  }
  out += `<g class="roof ${built > fresh.floors ? "new" : ""}" style="--f:${built - 1}"><g class="wash" filter="url(#wc)" transform="translate(1.6 1.2)">${wash}</g><g class="ink">${ink}</g></g>`;
  return { svg: `<svg viewBox="0 0 ${SVGW} ${SVGH}" width="${SVGW * SC}" height="${SVGH * SC}">${out}</svg>`, total, lit, width: SVGW * SC, signAt: (SVGH - roofTop) * SC };
}

// scenery in the same pen and washes
let SUN = [], SKY = "", CLOUD = "", HILLS = "", TREE = [], LAMP = "", MAILBOX = { up: "", down: "" }, DEFS = "";
function townArt() {
  if (CLOUD) return;
  DEFS = `<svg class="town-defs" width="0" height="0" aria-hidden="true"><defs>
    <filter id="wc" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency=".04" numOctaves="3" seed="4" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation=".45"/></filter>
    <filter id="wcsoft" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".012" numOctaves="3" seed="9" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="40" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="3"/></filter>
    <pattern id="brick" width="16" height="8" patternUnits="userSpaceOnUse"><rect width="16" height="8" fill="#d39478"/>
      <path d="M0 .5h16M0 4.5h16M4 .5v4M12 4.5v4" stroke="#9c5a40" stroke-width=".6" opacity=".55"/></pattern>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="2"/><feColorMatrix values="0 0 0 0 .17 0 0 0 0 .14 0 0 0 0 .12 0 0 0 .55 0"/></filter>
  </defs></svg>`;
  const P = pen(7);
  CLOUD = `<svg viewBox="0 0 140 54"><path filter="url(#wc)" d="M18 46c-12 0-14-14-2-16 0-12 16-16 24-8 4-12 24-14 30-2 10-6 26 0 24 12 14 0 16 14 4 14z" fill="#fff"/>
    ${P.path("M18 46c-12 0-14-14-2-16 0-12 16-16 24-8 4-12 24-14 30-2 10-6 26 0 24 12 14 0 16 14 4 14z", { strokeWidth: 1, roughness: 1.1 })}</svg>`;
  const towers = [[60, 70], [95, 112], [128, 58], [180, 92], [216, 132], [252, 76], [900, 84], [936, 126], [968, 66], [1010, 104], [1050, 72], [1180, 96], [1216, 60]];
  HILLS = `<svg viewBox="0 0 1400 260" preserveAspectRatio="xMidYMax slice">
    <g class="far">${towers.map(([x, hh]) => wr(x, 200 - hh, 30, hh, "#c9d7e6", `filter="url(#wc)" opacity=".7"`)
      + P.rect(x, 200 - hh, 30, hh, { stroke: "#7f95ad", strokeWidth: 0.8, roughness: 1 })
      + [...Array(Math.floor(hh / 16))].map((_, i) => `<line x1="${x + 6}" x2="${x + 24}" y1="${208 - hh + i * 16}" y2="${208 - hh + i * 16}" stroke="#7f95ad" stroke-width=".6" opacity=".6"/>`).join("")).join("")}</g>
    <g class="mid">${wp("M0 190C180 136 300 168 430 158S700 112 860 150 1150 136 1400 158V260H0z", "#cfe0c3", `filter="url(#wc)"`)}</g>
    <g class="near">${wp("M0 218C220 182 380 214 560 200S900 176 1080 204 1300 192 1400 200V260H0z", "#b2d3a2", `filter="url(#wc)"`)}
      ${P.path("M0 218C220 182 380 214 560 200S900 176 1080 204 1300 192 1400 200", { strokeWidth: 1, roughness: 1.2, stroke: "#5f7f55" })}</g></svg>`;
  SKY = `<svg viewBox="0 0 1400 470" preserveAspectRatio="xMidYMin slice"><g filter="url(#wcsoft)">
    <path class="sky-wash" d="M-60 -60H1460V230C1300 300 1160 220 980 270S640 230 460 290 120 240 -60 300Z"/></g></svg>`;
  SUN = [`<svg viewBox="-40 -40 80 80"><circle r="20" fill="#ffd36b" filter="url(#wc)"/>${P.circle(0, 0, 40, { strokeWidth: 1.3 })}
      <g class="rays">${[...Array(10)].map((_, i) => { const a = (i * Math.PI) / 5; return P.line(Math.cos(a) * 26, Math.sin(a) * 26, Math.cos(a) * 34, Math.sin(a) * 34, { strokeWidth: 1.3 }); }).join("")}</g></svg>`,
    `<svg viewBox="-40 -40 80 80"><mask id="moonm"><rect x="-40" y="-40" width="80" height="80" fill="#fff"/><circle cx="11" cy="-7" r="17" fill="#000"/></mask>
      <circle r="20" fill="#fff4cf" mask="url(#moonm)"/><circle r="20" fill="none" stroke="#f4ecd2" stroke-width="1" stroke-dasharray="3 4" opacity=".4"/></svg>`];
  for (const [a, b] of [["#8fbe7d", "#79a86a"], ["#a3c98a", "#86b070"]]) {
    TREE.push(`<svg viewBox="0 0 46 76"><g class="wash" filter="url(#wc)"><circle cx="23" cy="30" r="17" fill="${a}"/><circle cx="16" cy="24" r="10" fill="${b}"/></g>
      ${P.line(23, 74, 23, 40, { strokeWidth: 2 })}${P.line(23, 52, 30, 44, { strokeWidth: 1 })}
      <g class="crown">${P.circle(23, 30, 34, { fill: b, fillStyle: "hachure", hachureGap: 5, fillWeight: 0.6, hachureAngle: -50, strokeWidth: 1 })}</g></svg>`);
  }
  LAMP = `<svg viewBox="0 0 30 92"><circle class="halo" cx="15" cy="14" r="14" fill="#ffd27a"/>${P.line(15, 90, 15, 20, { strokeWidth: 1.6 })}
    ${P.path("M8 19h14l-3 -9h-8z", { fill: "#fff2c4", fillStyle: "solid" })}${P.line(10, 90, 20, 90)}</svg>`;
  for (const up of [true, false]) {
    MAILBOX[up ? "up" : "down"] = `<svg viewBox="0 -12 46 64"><g filter="url(#wc)">${wp("M4 16a10 10 0 0 1 20 0v12H4z", "#7aa0c4")}${wr(14, 6, 18, 22, "#7aa0c4")}</g>
      ${P.line(14, 28, 14, 52, { strokeWidth: 1.8 })}${P.path("M4 28V16a10 10 0 0 1 10 -10h18v22z")}${P.line(14, 6, 14, 6)}
      <g class="mb-flag">${up ? P.path("M32 12V-8h10v7h-8", { fill: "#d9655b", fillStyle: "solid" }) : P.path("M32 20h12v6H32", { fill: "#d9655b", fillStyle: "solid" })}</g></svg>`;
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
  const sounds = [], usedKinds = new Set();
  const lots = S.habits.map((h, idx) => {
    const built = Math.min(MAXF, Math.max(1, h.allowed_chapter + 1));
    const kind = KIND[h.icon] || "studio";
    const was = seen[h.id] || { floors: built, lit: 999 };
    const fresh = opts.noAnim ? { floors: built, lit: 999 } : was;
    const art = buildingSVG(h, idx, built, h.checkins, fresh, usedKinds.has(kind));
    usedKinds.add(kind);
    const { total, lit } = art;
    if (built > fresh.floors) sounds.push("stamp"); else if (lit > fresh.lit) sounds.push("pop");
    seen[h.id] = { floors: built, lit };
    const mine = POSTS.kept.filter((p) => p.habit_id === h.id);
    const next = h.chapters[built] ? `<i>Next floor (~${year(h.chapter_dates[built])}): ${esc(lower(h.chapters[built]))}</i>` : `<i>Finished. This one is ten years tall.</i>`;
    const toNext = h.next_level_at ? `${h.next_level_at - h.checkins} check-in${h.next_level_at - h.checkins === 1 ? "" : "s"} to the next floor` : "";
    return `
      <div class="lot ${opts.working === h.id ? "working" : ""} ${h.checked_today ? "done-today" : ""}" data-h="${h.id}" style="--b:${idx}; width:${art.width}px">
        <div class="lot-tip"><b>${KIND_NAME[kind]} · floor ${built} of 6</b>${esc(h.allowed_milestone ? `Future you ${lower(h.allowed_milestone.milestone)}.` : "")}${next}<small>${toNext}${toNext ? " · " : ""}${lit} of ${total} windows lit</small></div>
        ${h.quest ? `<div class="lot-storm">${ico("storm")}<span class="rain"></span><b>Comeback quest ${h.quest.progress}/3</b></div>` : ""}
        <div class="lot-sign" style="bottom:${art.signAt + 4}px">${hIcon(h, "inline")} ${esc(h.short)}</div>
        <div class="lot-work">Building floor ${built + 1}…<br><small>your postcard is on its way</small></div>
        <button class="lot-b" aria-label="${esc(h.short)}: see its postcard road">${art.svg}</button>
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
    ${DEFS}
    <div class="sky">${SKY}
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
    <button class="sun" id="sun" aria-label="Day or night" title="${night ? "Back to day" : "See your town at night"}">${SUN[night ? 1 : 0]}</button>
    <div class="grain"><svg width="100%" height="100%"><rect width="100%" height="100%" filter="url(#grain)"/></svg></div>`;

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
if (new URLSearchParams(location.search).has("dev")) window.ff = { openPostcard, posts: () => POSTS, state: () => S, renderTown };
studyBar();
refresh();
