import { renderAll, ico, HABIT_ICON, CHARACTER_ICON } from "./icons.js";

const $ = (id) => document.getElementById(id);
renderAll();
const hico = (key, cls = "") => ico(HABIT_ICON(key), cls);
let S = null;              // latest /api/state
let timeline = "kept";
let newestPostId = null;    // to animate a freshly written post
let busy = false;
// ?mode=plain = control group for the A/B test: an ordinary streak tracker, no future feed.
const PLAIN = new URLSearchParams(location.search).get("mode") === "plain";
const Q = PLAIN ? "?plain=true" : "";
// ?study=1 (opened from the study console): one habit only, and a researcher bar with the clock buttons.
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

// ---------- boot ----------

async function refresh() {
  S = await api("/api/state" + Q);
  const onboarded = !!S.profile;
  $("onboard").hidden = onboarded;
  $("game").hidden = !onboarded;
  if (!onboarded) return renderOnboard();
  renderStories();
  renderToday();
  renderMe();
  document.querySelector(".seg").hidden = PLAIN;
  if (PLAIN) {
    $("feed").innerHTML = "";
    document.querySelectorAll(".prog, .meta, .lv, .quest, .pace").forEach((el) => (el.hidden = true));
    return;
  }
  await renderFeed();
}

// ---------- onboarding / add habit ----------

const START = ["Brand new", "Tried it a little", "Comfortable with basics", "Already pretty good"];

function pickItem(t, on) {
  const custom = t.key === "custom";
  return `
    <div class="pick-item ${on ? "on" : ""}" data-key="${t.key}">
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
          <input class="goal" maxlength="100" placeholder="${custom ? "e.g. finish a 10-day retreat" : t.goal_hint || "e.g. play at my sister's wedding"}"></label>
      </div>
    </div>`;
}

function pickList(el, preselect) {
  const all = [...S.templates, { key: "custom", label: "Something else", emoji: "✨", unit: "minutes", default_amount: 15 }];
  el.innerHTML = all.map((t) => pickItem(t, t.key === preselect)).join("");
  el.querySelectorAll(".pick-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      if (e.target.closest("input, select, label")) {
        if (e.target.classList.contains("cname") && !item.classList.contains("on")) select(el, item, true);
        return;
      }
      select(el, item, !item.classList.contains("on"));
    });
  });
}

function select(el, item, on) {
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

function renderOnboard() {
  $("ob-avatar-wrap").hidden = PLAIN;
  if (!PLAIN && !$("ob-avatar").children.length) readOnboardAvatar = avatarPicker($("ob-avatar"));
  if (PLAIN) {  // control group must not hear about the future feed
    document.querySelector(".onboard .kicker").textContent = "Daily habits";
    document.querySelector(".onboard h1").textContent = "Build a streak.";
    document.querySelector(".onboard .muted").textContent = "Pick one small thing to do every day and check in each day you do it.";
    document.querySelector("#onboard-form button[type=submit]").textContent = "Start";
    $("ob-bestie").closest("label").hidden = true;
  }
  if (!$("ob-habits").children.length) pickList($("ob-habits"), "guitar");
}

// Adds each picked habit; a custom one waits on the Ladder agent and may be refused for safety.
async function addHabits(list, errEl, btn) {
  const label = btn.textContent;
  btn.disabled = true;
  const errors = [];
  for (const h of list) {
    btn.textContent = h.key === "custom" ? "Designing your path…" : "Adding…";
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
  $("add-err").textContent = "";
  $("add").hidden = false;
}
$("add-cancel").onclick = () => ($("add").hidden = true);
$("add-save").onclick = async () => {
  const list = picked($("add-habits"));
  if (!list.length) return ($("add-err").textContent = "Pick something to add.");
  if (await addHabits(list, $("add-err"), $("add-save")) && !$("add-err").textContent) $("add").hidden = true;
  refresh();
};

// ---------- stories + today ----------

function renderStories() {
  $("stories").innerHTML = S.habits.map((h) => `
    <button class="story" data-scroll="${h.id}">
      <span class="ring ${h.checked_today ? "done" : ""}"><span>${hico(h.key)}</span><b class="lv">Lv ${h.level}</b></span>
      <span class="slabel">${h.short}</span>
    </button>`).join("") + `
    <button class="story" id="add-story">
      <span class="ring done add-ring"><span>+</span></span><span class="slabel">New</span>
    </button>`;
  $("add-story").onclick = openAdd;
}

function amountText(h) {
  return h.unit === "dollars" ? `$${h.amount}` : `${h.amount} min`;
}

function renderToday() {
  const L = S.level_checkins;
  $("today").innerHTML = S.habits.map((h) => {
    const prev = L[h.level - 1] || 0;
    const next = h.next_level_at;
    const pct = next ? Math.round(((h.checkins - prev) / (next - prev)) * 100) : 100;
    const quest = h.quest ? `
      <div class="quest"><b>Slump detected.</b> Future you is losing momentum.
        Check in ${h.quest.target} days in a row to save the moment: <b>${h.quest.progress}/${h.quest.target}</b></div>` : "";
    const pace = h.capped_by_pace
      ? `<p class="pace">Your story is held back by your pace (${Math.round(h.adherence * 100)}% of days). Check in more often to unlock bigger moments.</p>` : "";
    return `
      <div class="task ${h.checked_today ? "done" : ""}" id="task-${h.id}">
        <div class="top">
          <span class="task-ico">${hico(h.key)}</span>
          <span class="q">${h.checked_today ? "Done for today" : `${h.label}, ${amountText(h)} today?`}
            <small>${ico("flame", "inline")} ${h.streak}-day streak · ${h.checkins} check-ins · ${Math.round(h.adherence * 100)}% of days</small></span>
          <button class="go" data-checkin="${h.id}" ${h.checked_today || busy ? "disabled" : ""}>${h.checked_today ? `${ico("check", "inline")} Done` : "I did it"}</button>
        </div>
        <div class="prog"><i style="width:${pct}%"></i></div>
        <div class="meta"><span>Level ${h.level}</span><span>${next ? `${next - h.checkins} more to Level ${h.level + 1}` : "Max level"}</span></div>
        ${quest}${pace}
      </div>`;
  }).join("");
  $("today").querySelectorAll("[data-checkin]").forEach((b) => (b.onclick = () => checkin(+b.dataset.checkin)));
}

async function checkin(id) {
  if (busy) return;
  busy = true;
  renderToday();
  const habit = S.habits.find((h) => h.id === id);
  if (PLAIN) {
    await api(`/api/habits/${id}/checkin${Q}`, {}).catch((err) => alert(err.message));
    busy = false;
    return refresh();
  }
  timeline = "kept";
  syncSeg();
  $("feed").insertAdjacentHTML("afterbegin", writingCard(habit));
  const stop = animateWriting();
  $("feed").querySelector(".locked")?.remove();
  try {
    const r = await api(`/api/habits/${id}/checkin`, {});
    newestPostId = r.post_id;
    stop();
    busy = false;
    await refresh();
    if (r.kind === "level_up") {
      const h = S.habits.find((x) => x.id === id);
      const lower = (t) => t.charAt(0).toLowerCase() + t.slice(1).replace(/\.$/, "");
      $("lu-level").textContent = h.level;
      $("lu-emoji").innerHTML = avatarHTML(104);
      $("lu-title").textContent = h.allowed_milestone ? `Future you ${lower(h.allowed_milestone.milestone)}.` : "A new chapter begins.";
      $("lu-sub").textContent = h.next_milestone ? `Next chapter: ${lower(h.next_milestone.milestone)}.` : "You've reached the top of this story.";
      $("lu-dots").innerHTML = Array.from({ length: 6 }, (_, i) =>
        `<i class="${i <= h.allowed_chapter ? "on" : ""} ${i === h.allowed_chapter ? "now" : ""}"></i>`).join("");
      confetti();
      $("levelup").hidden = false;
    }
  } catch (err) {
    stop();
    busy = false;
    $("writing")?.remove();
    alert(err.message);
    refresh();
  }
}
// While the agents work (~5-10 s): a post-shaped card, a year counter rolling forward,
// and status lines that follow the real pipeline (game engine -> story -> reality check -> photo).
function writingCard(habit) {
  return `
    <article class="post writing" id="writing">
      <div class="ph">${avatarHTML(36)}
        <span class="who">${esc(S.profile.handle)}<span class="where">traveling through time…</span></span></div>
      <div class="media warp">
        <div class="year" id="w-year">${S.today.slice(0, 4)}</div>
        <div class="wstep" id="w-step">Counting your ${esc(habit.short.toLowerCase())} check-ins</div>
        <div class="wbar"><i></i></div>
      </div>
      <div class="skel"><i style="width:40%"></i><i style="width:90%"></i><i style="width:70%"></i></div>
    </article>`;
}

function animateWriting() {
  const steps = ["Counting your check-ins and pace", "Story agent is writing your next chapter",
    "Reality check: does this fit your real pace?", "Finding a photo for the moment", "Almost there"];
  let year = +S.today.slice(0, 4), i = 0;
  const yr = setInterval(() => {
    year = year >= 2036 ? +S.today.slice(0, 4) : year + 1;
    const el = $("w-year");
    if (el) el.textContent = year;
  }, 260);
  const st = setInterval(() => {
    i = Math.min(i + 1, steps.length - 1);
    const el = $("w-step");
    if (el) { el.classList.remove("in"); void el.offsetWidth; el.textContent = steps[i]; el.classList.add("in"); }
  }, 1800);
  return () => { clearInterval(yr); clearInterval(st); };
}

function confetti() {
  const colors = ["#f9ce34", "#ee2a7b", "#6228d7", "#0095f6", "#1a9c5b"];
  $("confetti").innerHTML = Array.from({ length: 40 }, () => {
    const x = Math.random() * 100, d = 0.8 + Math.random() * 1.2, r = Math.random() * 360;
    return `<i style="left:${x}%;background:${colors[Math.floor(Math.random() * 5)]};animation-duration:${d}s;transform:rotate(${r}deg)"></i>`;
  }).join("");
}

$("lu-close").onclick = () => ($("levelup").hidden = true);

// ---------- feed ----------

const HEART = '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-9-8.6C1.5 8.2 3.6 5 6.8 5c2 0 3.4 1.1 5.2 3 1.8-1.9 3.2-3 5.2-3 3.2 0 5.3 3.2 3.8 6.4C19 15.6 12 20 12 20z"/></svg>';
const BUBBLE = '<svg viewBox="0 0 24 24"><path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.2A8 8 0 1 1 20 11.5z"/></svg>';
const SEND = '<svg viewBox="0 0 24 24"><path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/></svg>';
const BADGE = { level_up: "LEVEL UP", life_event: "PLOT TWIST", boss: "SLUMP", comeback: "COMEBACK", combo: "COMBO" };

function whenText(iso) {
  const d = new Date(iso + "T12:00:00");
  const years = (d - new Date(S.today + "T12:00:00")) / (365 * 864e5);
  const away = years < 1 ? `${Math.max(1, Math.round(years * 12))} months from now` : `${years.toFixed(1).replace(".0", "")} years from now`;
  return `${d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} · ${away}`;
}

async function renderFeed() {
  const posts = await api(`/api/feed?timeline=${timeline}`);
  const prof = S.profile;
  const handle = timeline === "kept" ? prof.handle : prof.handle.replace(".2036", ".someday");
  const pending = S.habits.filter((h) => !h.checked_today);
  const locked = timeline === "kept" && pending.length ? `
    <article class="locked"><div class="media"><span class="lock">${ico("lock")}</span>
      <p>Tomorrow's you is waiting</p><small>Check in on ${pending.map((h) => h.label.toLowerCase()).join(" or ")} to see what happens next.</small>
    </div></article>` : "";
  if (!posts.length) {
    $("feed").innerHTML = locked + `<p class="empty">${timeline === "kept"
      ? "Your 2036 feed is empty. Check in today and your first post appears."
      : "This is the you who stopped. Their feed fills in as yours does."}</p>`;
    return;
  }
  $("feed").innerHTML = locked + posts.map((p) => {
    const photo = p.photo
      ? `<div class="fallback">${emojiFor(p.habit_key)}</div><img src="${p.photo.url}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
      : `<div class="fallback">${emojiFor(p.habit_key)}</div>`;
    const credit = p.photo ? `Photo: <a href="${esc(p.photo.page)}" target="_blank" rel="noopener">${esc(p.photo.title || "untitled")}</a> by ${esc(p.photo.creator)}, ${esc(p.photo.license)}` : "";
    const b = (p.basis || "").replace(/ ?combo:\d+/, "").trim();
    const basis = timeline === "kept" && b ? `Reality check ✓ fits your current pace · ${b === "estimate" ? "milestone is an estimate" : esc(b)}<br>` : "";
    return `
      <article class="post ${timeline} ${p.id === newestPostId || p.id === newestPostId + 1 ? "new" : ""}">
        <div class="ph">${avatarHTML(36, { gray: timeline === "stopped", tier: timeline === "stopped" ? 0 : undefined })}
          <span class="who">${esc(handle)}<span class="where">${esc(p.location || "")}</span></span></div>
        <div class="media">${photo}${BADGE[p.kind] && timeline === "kept" ? `<span class="badge ${p.kind}">${BADGE[p.kind]}</span>` : ""}</div>
        <div class="acts">${HEART}${BUBBLE}${SEND}</div>
        <div class="likes">${p.likes.toLocaleString()} likes</div>
        <div class="cap"><b>${esc(handle)}</b>${esc(p.caption)}</div>
        <div class="cmts">${p.comments.map((c) => `<div><b>${esc(c.handle)}</b>${esc(c.text)}</div>`).join("")}</div>
        <div class="when">${whenText(p.future_date)}</div>
        <div class="basis">${basis}${credit}</div>
      </article>`;
  }).join("");
}

function emojiFor(key) {
  return hico(key);
}

function syncSeg() {
  document.querySelectorAll("#timeline button").forEach((b) => b.classList.toggle("on", b.dataset.tl === timeline));
}
$("timeline").onclick = (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  timeline = b.dataset.tl;
  syncSeg();
  newestPostId = null;
  renderFeed();
};

// ---------- usage + safety ----------

const EVENT = {
  overclaim_fixed: "Reality check rewrote an overclaim",
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
  if (!confirm("Erase all habits, check-ins, and posts?")) return;
  await api("/api/demo/reset", {});
  $("demo").hidden = true;
  $("ob-habits").innerHTML = "";
  refresh();
};

document.querySelectorAll(".overlay").forEach((o) => o.addEventListener("click", (e) => { if (e.target === o) o.hidden = true; }));

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- future-self avatar: evolves with your highest level ----------
// Lv1-2 Instagram ring · Lv3 habit badge · Lv4 gold ring · Lv5 crown · Lv6 animated rainbow ring

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
      ${t >= 3 && top && size >= 44 ? `<span class="avx-badge">${hico(top.key)}</span>` : ""}
      ${t >= 5 && size >= 44 ? `<span class="avx-crown">${ico("crown")}</span>` : ""}
    </span>`;
}

const TIER_NAME = ["Day zero", "Getting started", "Building", "On a roll", "Gold streaker", "Crowned", "Legend"];

function avatarPicker(el, current = {}) {
  let choice = { ...current };
  const draw = () => {
    el.innerHTML = (S?.avatar_characters || ["🦊", "🐼", "🐱", "🐰", "🐻", "🐨", "🐸", "🦁", "🐧", "🙂"]).map((c) =>
      `<button type="button" class="avopt ${choice.character === c && !choice.photo ? "on" : ""}" data-c="${c}">${ico(CHARACTER_ICON[c])}</button>`).join("") +
      `<label class="avopt up ${choice.photo ? "on" : ""}">${choice.photo ? `<img src="${choice.photo}" alt="">` : ico("camera")}<input type="file" accept="image/*" hidden></label>`;
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

let readOnboardAvatar = () => ({ character: "🦊" });

$("av-cancel").onclick = () => ($("avsheet").hidden = true);
let readSheetAvatar = null;
function openAvatarSheet() {
  readSheetAvatar = avatarPicker($("av-pick"), S.profile.avatar || {});
  $("av-err").textContent = "";
  $("avsheet").hidden = false;
}
$("av-save").onclick = async () => {
  try {
    await api("/api/avatar", readSheetAvatar());
    $("avsheet").hidden = true;
    refresh();
  } catch (err) {
    $("av-err").textContent = err.message;
  }
};

// ---------- profile card: sidebar on desktop, header on phones ----------

function renderMe() {
  if (PLAIN) { $("me-top").innerHTML = ""; $("side").innerHTML = ""; return; }
  const p = S.profile, t = tier();
  const total = S.habits.reduce((n, h) => n + h.checkins, 0);
  const best = Math.max(0, ...S.habits.map((h) => h.streak));
  const chapters = S.habits.reduce((n, h) => n + Math.max(0, h.allowed_chapter + 1), 0);
  const stats = `<div class="me-stats"><span><b>${total}</b>check-ins</span><span><b>${best}</b>streak</span><span><b>${chapters}</b>chapters</span></div>`;
  const play = `<button class="btn play" data-play>${ico("play", "inline")} Play your next 10 years</button>`;
  $("me-top").innerHTML = `
    <div class="me-row">
      <button class="me-av" data-avatar title="Change your future self">${avatarHTML(72)}</button>
      <div class="me-info"><b>${esc(p.handle)}</b><span class="tier">${TIER_NAME[t]}</span>${stats}</div>
    </div>${play}`;
  $("side").innerHTML = `
    <div class="side-card">
      <button class="me-av big" data-avatar title="Change your future self">${avatarHTML(112)}</button>
      <h2>${esc(p.name)} <span class="muted">in 2036</span></h2>
      <p class="tier">${TIER_NAME[t]} · Level ${t}</p>
      ${stats}
      ${play}
      <div class="side-habits">${S.habits.map((h) => `
        <div class="sh"><span>${hico(h.key, "inline")} ${esc(h.short)}</span><span class="muted">Lv ${h.level}</span></div>
        <div class="dots small">${Array.from({ length: 6 }, (_, i) => `<i class="${i <= h.allowed_chapter ? "on" : ""}"></i>`).join("")}</div>
        <p class="sh-next">${h.next_milestone ? "Next: " + esc(h.next_milestone.milestone) : "Top of the ladder"}</p>`).join("")}
      </div>
      <p class="muted small">Your avatar levels up with you: ring at Lv1, habit badge at Lv3, gold at Lv4, crown at Lv5.</p>
    </div>`;
  document.querySelectorAll("[data-avatar]").forEach((b) => (b.onclick = openAvatarSheet));
  document.querySelectorAll("[data-play]").forEach((b) => (b.onclick = playReel));
}

// ---------- story reel: the kept-going feed in date order, played like Instagram stories ----------

let reel = null;
async function playReel() {
  const posts = (await api("/api/feed?timeline=kept")).filter((p) => p.kind !== "boss")
    .sort((a, b) => a.future_date.localeCompare(b.future_date));
  const slides = [{ intro: true }, ...posts, { outro: true }];
  if (!posts.length) return alert("Check in first. Your story starts with your first post.");
  $("reel-bars").innerHTML = slides.map(() => "<i><b></b></i>").join("");
  $("reel").hidden = false;
  reel = { slides, i: 0, timer: null };
  showSlide();
}

function showSlide() {
  const { slides, i } = reel;
  const s = slides[i];
  clearTimeout(reel.timer);
  [...$("reel-bars").children].forEach((bar, k) => {
    bar.className = k < i ? "done" : k === i ? "now" : "";
  });
  const p = S.profile;
  if (s.intro) {
    $("reel-stage").innerHTML = `<div class="slide intro">${avatarHTML(120, { tier: 0 })}
      <h1>${esc(p.name)}, the next ten years</h1><p>${S.today.slice(0, 4)} → 2036</p></div>`;
  } else if (s.outro) {
    $("reel-stage").innerHTML = `<div class="slide intro">${avatarHTML(120)}
      <h1>This future is on its way.</h1><p>Check in tomorrow to write the next chapter.</p></div>`;
  } else {
    const year = s.future_date.slice(0, 4);
    $("reel-stage").innerHTML = `
      <div class="slide">
        ${s.photo ? `<img class="kb" src="${s.photo.url}" alt="" referrerpolicy="no-referrer">` : `<div class="kb fallback">${emojiFor(s.habit_key)}</div>`}
        <div class="slide-year">${year}</div>
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

const _refresh = refresh;
refresh = async () => {
  await _refresh();
  if (STUDY && $("sb-date")) $("sb-date").textContent = S.profile ? `Day ${S.day_offset + 1}` : "Onboarding";
};

studyBar();
refresh();
