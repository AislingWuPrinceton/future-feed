const $ = (id) => document.getElementById(id);
let S = null;              // latest /api/state
let timeline = "kept";
let newestPostId = null;    // to animate a freshly written post
let busy = false;
// ?mode=plain = control group for the A/B test: an ordinary streak tracker, no future feed.
const PLAIN = new URLSearchParams(location.search).get("mode") === "plain";
const Q = PLAIN ? "?plain=true" : "";

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

function pickList(el, preselect) {
  el.innerHTML = S.templates.map((t) => `
    <label class="pick-item ${t.key === preselect ? "on" : ""}" data-key="${t.key}">
      <input type="checkbox" hidden ${t.key === preselect ? "checked" : ""}>
      <span class="em">${t.emoji}</span><span class="name">${t.label}</span>
      <input type="number" min="1" max="240" value="${t.default_amount}" aria-label="amount">
      <span class="unit">${t.unit === "dollars" ? "$ / day" : "min / day"}</span>
    </label>`).join("");
  el.querySelectorAll(".pick-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      if (e.target.type === "number") return;
      e.preventDefault();
      const box = item.querySelector("input[type=checkbox]");
      box.checked = !box.checked;
      item.classList.toggle("on", box.checked);
    });
  });
}

const picked = (el) => [...el.querySelectorAll(".pick-item")]
  .filter((i) => i.querySelector("input[type=checkbox]").checked)
  .map((i) => ({ key: i.dataset.key, amount: +i.querySelector("input[type=number]").value }));

function renderOnboard() {
  if (!$("ob-habits").children.length) pickList($("ob-habits"), "guitar");
}

$("onboard-form").onsubmit = async (e) => {
  e.preventDefault();
  const habits = picked($("ob-habits"));
  if (!habits.length) return ($("ob-err").textContent = "Pick at least one daily thing.");
  try {
    await api("/api/profile", { name: $("ob-name").value, bestie: $("ob-bestie").value });
    for (const h of habits) await api("/api/habits", h);
    refresh();
  } catch (err) {
    $("ob-err").textContent = err.message;
  }
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
  try {
    for (const h of picked($("add-habits"))) await api("/api/habits", h);
    $("add").hidden = true;
    refresh();
  } catch (err) {
    $("add-err").textContent = err.message;
  }
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
  $("feed").insertAdjacentHTML("afterbegin", `<p class="thinking" id="writing">Writing your future</p>`);
  $("feed").querySelector(".locked")?.remove();
  try {
    const r = await api(`/api/habits/${id}/checkin`, {});
    newestPostId = r.post_id;
    busy = false;
    await refresh();
    if (r.kind === "level_up") {
      const h = S.habits.find((x) => x.id === id);
      $("lu-level").textContent = h.level;
      $("lu-title").textContent = h.allowed_milestone ? `Future you ${h.allowed_milestone.milestone}.` : "A new chapter begins.";
      $("lu-sub").textContent = h.next_milestone ? `Next: ${h.next_milestone.milestone}.` : "You've reached the top of this story.";
      $("levelup").hidden = false;
    }
  } catch (err) {
    busy = false;
    $("writing")?.remove();
    alert(err.message);
    refresh();
  }
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

refresh();
