const state = new HackerState();
const el = (id) => document.getElementById(id);
let syncTimer = null;
let currentTarget = null;

function fmt(n) {
  n = Math.floor(n);
  if (n < 1000) return String(n);
  const units = ["", "K", "M", "B", "T", "Qa", "Qi"];
  let i = 0;
  let v = n;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return v.toFixed(v < 10 ? 2 : 1) + units[i];
}

function showToast(msg, good = false) {
  const t = document.createElement("div");
  t.className = "toast" + (good ? " good" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4500);
}

function logLine(text, success) {
  const log = el("terminalLog");
  const line = document.createElement("div");
  line.className = "line " + (success ? "success" : "fail");
  const time = new Date().toLocaleTimeString();
  line.innerHTML = `<span class="tag">[${time}]</span> ${text}`;
  log.prepend(line);
  while (log.children.length > 40) log.removeChild(log.lastChild);
}

// ---------- Setup ----------

async function tryLoadSavedUsername() {
  const saved = localStorage.getItem("hacker-engine-username");
  if (!saved) return showSetup();
  try {
    const hacker = await apiGetHacker(saved);
    if (!hacker) return showSetup();
    state.username = saved;
    state.applySnapshot(hacker);
    showGame();
  } catch (e) {
    console.error(e);
    showSetup();
  }
}

function showSetup() {
  el("setupScreen").classList.remove("hidden");
  el("gameScreen").classList.add("hidden");
}

function showGame() {
  el("setupScreen").classList.add("hidden");
  el("gameScreen").classList.remove("hidden");
  el("usernameLabel").textContent = state.username;
  renderAll();
  startLoop();
  refreshTargets();
  refreshLeaderboard();
}

el("createAccountBtn").addEventListener("click", async () => {
  const input = el("usernameInput");
  const name = input.value.trim();
  const errEl = el("setupError");
  errEl.textContent = "";
  if (!/^[a-zA-Z0-9_-]{3,20}$/.test(name)) {
    errEl.textContent = "3-20 chars: letters, numbers, _ or -";
    return;
  }
  try {
    const existing = await apiGetHacker(name);
    if (existing) {
      state.username = name;
      state.applySnapshot(existing);
      localStorage.setItem("hacker-engine-username", name);
      showGame();
      return;
    }
    const hacker = await apiCreateHacker(name);
    state.username = name;
    state.applySnapshot(hacker);
    localStorage.setItem("hacker-engine-username", name);
    showGame();
  } catch (e) {
    errEl.textContent = e.message;
  }
});

// ---------- Rendering ----------

function renderAll() {
  el("powerCount").textContent = fmt(state.power);
  el("creditsCount").textContent = fmt(state.credits);
  el("incomeCount").textContent = state.income.toFixed(1);
  el("successCount").textContent = fmt(state.successful_hacks);
  el("stolenCount").textContent = fmt(state.total_stolen);
  renderTools();
  renderAchievements();
}

function renderAchievements() {
  const container = el("achievementList");
  if (!container) return;
  container.innerHTML = "";
  const unlockedCount = Object.keys(state.achievements).length;
  const total = ALL_ACHIEVEMENTS.length;
  const pct = total > 0 ? Math.round((unlockedCount / total) * 100) : 0;

  const progressWrap = document.createElement("div");
  progressWrap.style.marginBottom = "14px";
  progressWrap.innerHTML = `
    <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--text-dim); margin-bottom:6px;">
      <span>${unlockedCount} / ${total} unlocked</span>
      <span>${pct}%</span>
    </div>
    <div class="ach-progress-bar"><div class="ach-progress-fill" style="width:${pct}%"></div></div>
  `;
  container.appendChild(progressWrap);

  const grid = document.createElement("div");
  grid.className = "badge-list";
  for (const a of ALL_ACHIEVEMENTS) {
    const unlockedAt = state.achievements[a.id];
    const span = document.createElement("span");
    span.className = "badge" + (unlockedAt ? "" : " locked");
    span.textContent = unlockedAt ? a.name : "???";
    span.style.cursor = "pointer";
    span.addEventListener("click", () => openAchievementModal(a, unlockedAt));
    grid.appendChild(span);
  }
  container.appendChild(grid);
}

function openAchievementModal(achievement, unlockedAt) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const unlocked = !!unlockedAt;
  const dateStr = unlocked
    ? new Date(unlockedAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
    : null;
  backdrop.innerHTML = `
    <div class="modal">
      <h3>${unlocked ? achievement.name : "??? (locked)"}</h3>
      <p style="color:var(--text-dim); font-size:0.85rem;">${achievement.how}</p>
      ${unlocked
        ? `<p style="color:var(--good); font-size:0.85rem;">Achieved ${dateStr}</p>`
        : `<p style="color:var(--text-dim); font-size:0.8rem;">Not yet unlocked.</p>`}
      <button id="closeAchModal" style="width:100%; margin-top:10px;">Close</button>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector("#closeAchModal").addEventListener("click", () => backdrop.remove());
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });
}

function checkAchievements() {
  const newly = state.checkAchievements();
  for (const a of newly) {
    showToast(`Achievement unlocked: ${a.name}`, true);
    logLine(`achievement unlocked: <b>${a.name}</b>`, true);
  }
  if (newly.length) renderAchievements();
}

function renderTools() {
  const container = el("toolList");
  container.innerHTML = "";
  for (const tool of TOOLS) {
    const owned = state.tools[tool.id] || 0;
    const cost = toolCost(tool, owned);
    const div = document.createElement("div");
    div.className = "upgrade";
    div.innerHTML = `
      <div class="info">
        <div class="name">${tool.name} ${owned ? `<span style="color:var(--text-dim)">x${owned}</span>` : ""}</div>
        <div class="desc">${tool.desc}</div>
      </div>
      <div class="cost">${fmt(cost)} credits</div>
      <button data-id="${tool.id}" ${state.credits < cost ? "disabled" : ""}>Deploy</button>
    `;
    container.appendChild(div);
  }
  container.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.buyTool(btn.dataset.id)) {
        renderAll();
        checkAchievements();
        syncState();
      }
    });
  });
}

// ---------- Targets & leaderboard ----------

let currentTargetsList = [];
let rawTargetsList = [];

async function refreshTargets() {
  try {
    const rows = await apiTargetList(15);
    rawTargetsList = rows;
    currentTargetsList = rows.filter((r) => r.username !== state.username);
    const tbody = el("targetsBody");
    tbody.innerHTML = "";
    rows.forEach((row) => {
      if (row.username === state.username) return;
      const tr = document.createElement("tr");
      const baseOdds = Math.round((state.power / (state.power + row.defense)) * 100);
      tr.innerHTML = `
        <td>${row.username}</td>
        <td>${fmt(row.commits)}</td>
        <td>${row.defense}</td>
        <td style="color: ${baseOdds >= 50 ? "var(--good)" : "var(--red-bright)"};">${baseOdds}%</td>
        <td><button class="target-btn" data-name="${row.username}">Hack</button></td>
      `;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll(".target-btn").forEach((btn) => {
      btn.addEventListener("click", () => openHackModal(btn.dataset.name));
    });
  } catch (e) {
    console.warn("target refresh failed", e);
  }
}

async function refreshLeaderboard() {
  try {
    const rows = await apiHackerLeaderboard(15);
    const tbody = el("leaderboardBody");
    tbody.innerHTML = "";
    rows.forEach((row, i) => {
      const tr = document.createElement("tr");
      if (row.username === state.username) tr.className = "me";
      tr.innerHTML = `
        <td class="rank">#${i + 1}</td>
        <td>${row.username}</td>
        <td>${row.power ?? "-"}</td>
        <td>${fmt(row.successful_hacks)}</td>
        <td>${fmt(row.total_stolen)}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.warn("hacker leaderboard refresh failed", e);
  }
}

// ---------- Hack mini-game (decrypt-scramble) ----------

const CHARS = "ABCDEF0123456789";

function randomKey(len) {
  let s = "";
  for (let i = 0; i < len; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
  return s;
}

function openHackModal(targetName) {
  currentTarget = targetName;
  const keyLen = 6;
  const key = randomKey(keyLen);
  const timeLimit = 8000;

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <h3>Breach attempt: ${targetName}</h3>
      <p style="color:var(--text-dim); font-size:0.85rem;">Retype the security key exactly before time runs out. Accuracy and speed boost your effective power for this attempt.</p>
      <div class="scramble-target">${key}</div>
      <input type="text" class="scramble-input" id="scrambleInput" placeholder="type it here" autocomplete="off" maxlength="${keyLen}" />
      <div class="progress-bar"><div class="fill" id="progressFill" style="width:100%"></div></div>
      <div style="display:flex; gap:10px; margin-top:14px;">
        <button id="submitHackBtn" style="flex:1;">Execute</button>
        <button id="cancelHackBtn" style="flex:1; border-color: var(--text-dim); color: var(--text-dim);">Abort</button>
      </div>
      <div class="odds" id="oddsLine"></div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const input = backdrop.querySelector("#scrambleInput");
  const fill = backdrop.querySelector("#progressFill");
  input.focus();

  const startTime = Date.now();
  let expired = false;
  const timer = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const pct = Math.max(0, 100 - (elapsed / timeLimit) * 100);
    fill.style.width = pct + "%";
    if (elapsed >= timeLimit && !expired) {
      expired = true;
      clearInterval(timer);
      resolveAttempt(0, backdrop, false);
    }
  }, 80);

  backdrop.querySelector("#cancelHackBtn").addEventListener("click", () => {
    clearInterval(timer);
    backdrop.remove();
  });

  backdrop.querySelector("#submitHackBtn").addEventListener("click", () => {
    if (expired) return;
    const elapsed = Date.now() - startTime;
    const typed = input.value.trim().toUpperCase();
    const accuracy = charAccuracy(typed, key);
    const speedFactor = Math.max(0, 1 - elapsed / timeLimit);
    // Bonus scales with accuracy first - if you didn't actually type anything correct,
    // speed alone earns you nothing (this used to be exploitable by hitting Execute instantly).
    const bonus = Math.max(0, Math.min(1, accuracy * (0.7 + 0.3 * speedFactor)));
    expired = true;
    clearInterval(timer);
    resolveAttempt(bonus, backdrop, false);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") backdrop.querySelector("#submitHackBtn").click();
  });
}

function charAccuracy(typed, key) {
  let matches = 0;
  for (let i = 0; i < key.length; i++) {
    if (typed[i] === key[i]) matches++;
  }
  return matches / key.length;
}

async function resolveAttempt(puzzleBonus, backdrop, wasAutoHack) {
  const oddsLine = backdrop.querySelector("#oddsLine");
  const submitBtn = backdrop.querySelector("#submitHackBtn");
  submitBtn.disabled = true;
  if (oddsLine) oddsLine.textContent = "Executing...";

  try {
    const result = await apiAttemptHack(state.username, currentTarget, puzzleBonus);
    const targetWasRank1 = rawTargetsList[0] && rawTargetsList[0].username === currentTarget;
    state.recordHackResult(result.success, result.stolen || 0, wasAutoHack, targetWasRank1);
    if (result.success) {
      showToast(`Breach successful! Stole ${fmt(result.stolen)} commits from ${currentTarget}.`, true);
      logLine(`breach on <b>${currentTarget}</b> succeeded (${result.successChance}% odds) — stole ${fmt(result.stolen)}`, true);
    } else {
      showToast(`Breach failed against ${currentTarget}. Defenses held.`);
      logLine(`breach on <b>${currentTarget}</b> failed (${result.successChance}% odds)`, false);
    }
    renderAll();
    checkAchievements();
    syncState();
    refreshLeaderboard();
    refreshTargets();
  } catch (e) {
    showToast(e.message);
  } finally {
    setTimeout(() => backdrop.remove(), 900);
  }
}

// ---------- Auto-hack: while the tab is open, attempt a breach every 60s,
// cycling down the leaderboard in rank order (#1, #2, #3, ... then wraps back to #1) ----------

let autoHackIndex = 0;

async function autoHackTick() {
  if (!state.username) return;
  if (!currentTargetsList || currentTargetsList.length === 0) {
    // no cached list yet (e.g. just loaded) - try a fresh fetch first
    await refreshTargets();
    if (!currentTargetsList || currentTargetsList.length === 0) return;
  }

  const target = currentTargetsList[autoHackIndex % currentTargetsList.length];
  autoHackIndex = (autoHackIndex + 1) % currentTargetsList.length;
  if (!target) return;

  try {
    const result = await apiAttemptHack(state.username, target.username, 0);
    const targetWasRank1 = rawTargetsList[0] && rawTargetsList[0].username === target.username;
    state.recordHackResult(result.success, result.stolen || 0, true, targetWasRank1);
    if (result.success) {
      showToast(`[AUTO] Breach successful! Stole ${fmt(result.stolen)} commits from ${target.username}.`, true);
      logLine(`[AUTO] breach on <b>${target.username}</b> succeeded (${result.successChance}% odds) — stole ${fmt(result.stolen)}`, true);
    } else {
      logLine(`[AUTO] breach on <b>${target.username}</b> failed (${result.successChance}% odds)`, false);
    }
    renderAll();
    checkAchievements();
    syncState();
    refreshLeaderboard();
    refreshTargets();
  } catch (e) {
    // Likely the 60s per-hacker cooldown was already used by a manual hack this cycle - that's fine, just skip.
    console.warn("auto-hack tick skipped:", e.message);
  }
}

// ---------- Sync loop ----------

let lastTick = Date.now();

function startLoop() {
  lastTick = Date.now();
  setInterval(() => {
    const now = Date.now();
    const dt = (now - lastTick) / 1000;
    lastTick = now;
    state.tick(dt);
    el("creditsCount").textContent = fmt(state.credits);
  }, 200);

  syncTimer = setInterval(() => {
    if (state.dirty) syncState();
  }, 6000);
  setInterval(checkAchievements, 1500);
  setInterval(refreshTargets, 20000);
  setInterval(refreshLeaderboard, 20000);
  setInterval(autoHackTick, 60000);
}

async function syncState() {
  if (!state.username) return;
  state.dirty = false;
  try {
    await apiUpdateHacker(state.username, state.toPatch());
  } catch (e) {
    console.warn("sync failed", e);
  }
}

tryLoadSavedUsername();
