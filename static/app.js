const $ = (id) => document.getElementById(id);
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
        <span class="em">${t.emoji}</span>
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
      <span class="ring ${h.checked_today ? "done" : ""}"><span>${h.emoji}</span><b class="lv">Lv ${h.level}</b></span>
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
          <span style="font-size:26px">${h.emoji}</span>
          <span class="q">${h.checked_today ? "Done for today" : `${h.label}, ${amountText(h)} today?`}
            <small>🔥 ${h.streak}-day streak · ${h.checkins} check-ins · ${Math.round(h.adherence * 100)}% of days</small></span>
          <button class="go" data-checkin="${h.id}" ${h.checked_today || busy ? "disabled" : ""}>${h.checked_today ? "✓ Done" : "I did it"}</button>
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
      $("lu-emoji").textContent = h.emoji;
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
      <div class="ph"><span class="av"><span>${esc(S.profile.name[0] || "Y")}</span></span>
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
    <article class="locked"><div class="media"><span class="lock">🔒</span>
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
      ? `<img src="${p.photo.url}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'fallback',textContent:'${emojiFor(p.habit_key)}'}))">`
      : `<div class="fallback">${emojiFor(p.habit_key)}</div>`;
    const credit = p.photo ? `Photo: <a href="${esc(p.photo.page)}" target="_blank" rel="noopener">${esc(p.photo.title || "untitled")}</a> by ${esc(p.photo.creator)}, ${esc(p.photo.license)}` : "";
    const b = (p.basis || "").replace(/ ?combo:\d+/, "").trim();
    const basis = timeline === "kept" && b ? `Reality check ✓ fits your current pace · ${b === "estimate" ? "milestone is an estimate" : esc(b)}<br>` : "";
    return `
      <article class="post ${timeline} ${p.id === newestPostId || p.id === newestPostId + 1 ? "new" : ""}">
        <div class="ph"><span class="av"><span>${esc(prof.name[0] || "Y")}</span></span>
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
  return (S.templates.find((t) => t.key === key) || {}).emoji || "✨";
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
