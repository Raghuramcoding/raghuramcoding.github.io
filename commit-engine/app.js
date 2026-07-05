const state = new GameState();
let lastTick = Date.now();
let syncTimer = null;

const el = (id) => document.getElementById(id);

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

function showToast(msg, danger = false) {
  const t = document.createElement("div");
  t.className = "toast" + (danger ? " danger" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4500);
}

function logLine(text, hacked = false) {
  const log = el("terminalLog");
  const line = document.createElement("div");
  line.className = "line" + (hacked ? " hacked" : "");
  const time = new Date().toLocaleTimeString();
  line.innerHTML = `<span class="tag">[${time}]</span> ${text}`;
  log.prepend(line);
  while (log.children.length > 40) log.removeChild(log.lastChild);
}

// ---------- Account setup ----------

async function tryLoadSavedUsername() {
  const saved = localStorage.getItem("commit-engine-username");
  if (!saved) return showSetup();
  try {
    const account = await apiGetAccount(saved);
    if (!account) return showSetup();
    state.username = saved;
    state.applySnapshot(account);
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
  refreshHackLog();
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
    const existing = await apiGetAccount(name);
    if (existing) {
      state.username = name;
      state.applySnapshot(existing);
      localStorage.setItem("commit-engine-username", name);
      showGame();
      return;
    }
    const account = await apiCreateAccount(name);
    state.username = name;
    state.applySnapshot(account);
    localStorage.setItem("commit-engine-username", name);
    showGame();
  } catch (e) {
    errEl.textContent = e.message;
  }
});

// ---------- Rendering ----------

function renderAll() {
  el("commitCount").textContent = fmt(state.commits);
  el("cpsCount").textContent = fmt(state.cps);
  el("defenseCount").textContent = fmt(state.defense);
  el("hackCount").textContent = fmt(state.hack_count_against);
  renderUpgrades();
  renderAchievements();
}

function renderUpgrades() {
  const container = el("upgradeList");
  container.innerHTML = "";
  for (const upg of UPGRADES) {
    const owned = state.upgrades[upg.id] || 0;
    const cost = upgradeCost(upg, owned);
    const div = document.createElement("div");
    div.className = "upgrade";
    div.innerHTML = `
      <div class="info">
        <div class="name">${upg.name} ${owned ? `<span style="color:var(--text-dim)">x${owned}</span>` : ""}</div>
        <div class="desc">${upg.desc}</div>
      </div>
      <div class="cost">${fmt(cost)} commits</div>
      <button data-id="${upg.id}" ${state.commits < cost ? "disabled" : ""}>Buy</button>
    `;
    container.appendChild(div);
  }
  container.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.buyUpgrade(btn.dataset.id)) {
        renderAll();
        checkAchievements();
      }
    });
  });
}

function renderAchievements() {
  const container = el("achievementList");
  container.innerHTML = "";
  const unlockedCount = Object.keys(state.achievements).length;
  const countLabel = document.createElement("div");
  countLabel.style.cssText = "color:var(--text-dim); font-size:0.8rem; margin-bottom:10px;";
  countLabel.textContent = `${unlockedCount} / ${ALL_ACHIEVEMENTS.length} unlocked`;
  container.appendChild(countLabel);

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
    showToast(`Achievement unlocked: ${a.name}`);
    logLine(`achievement unlocked: <b>${a.name}</b>`);
  }
  if (newly.length) renderAchievements();
}

// ---------- Loop ----------

el("commitBtn").addEventListener("click", () => {
  state.clickCommit();
  el("commitCount").textContent = fmt(state.commits);
  checkAchievements();
  renderUpgrades();
});

function startLoop() {
  lastTick = Date.now();
  setInterval(() => {
    const now = Date.now();
    const dt = (now - lastTick) / 1000;
    lastTick = now;
    state.tick(dt);
    el("commitCount").textContent = fmt(state.commits);
    el("cpsCount").textContent = fmt(state.cps);
  }, 200);

  // Sync to backend every 5s if dirty
  syncTimer = setInterval(async () => {
    if (!state.dirty || !state.username) return;
    state.dirty = false;
    try {
      await apiUpdateAccount(state.username, state.toPatch());
    } catch (e) {
      console.warn("sync failed", e);
    }
  }, 5000);

  // Poll for hacks every 15s
  setInterval(refreshHackLog, 15000);
  setInterval(refreshLeaderboard, 20000);
}

let lastSeenHackTimestamp = null;

async function refreshHackLog() {
  if (!state.username) return;
  try {
    const logs = await apiHackLog(state.username);
    // Refresh account in case we were hacked (defense/commits changed server-side)
    const account = await apiGetAccount(state.username);
    if (account) {
      const wasHacked = account.hack_count_against > state.hack_count_against;
      state.applySnapshot(account);
      renderAll();
      if (wasHacked && logs[0]) {
        showToast(`You were hacked by ${logs[0].hacker}! Lost ${fmt(logs[0].stolen)} commits.`, true);
        logLine(`INTRUSION by <b>${logs[0].hacker}</b> — stole ${fmt(logs[0].stolen)} commits`, true);
      }
    }
  } catch (e) {
    console.warn("hack log poll failed", e);
  }
}

async function refreshLeaderboard() {
  try {
    const rows = await apiLeaderboard(15);
    const tbody = el("leaderboardBody");
    tbody.innerHTML = "";
    rows.forEach((row, i) => {
      const tr = document.createElement("tr");
      if (row.username === state.username) tr.className = "me";
      tr.innerHTML = `
        <td class="rank">#${i + 1}</td>
        <td>${row.username}</td>
        <td>${fmt(row.commits)}</td>
        <td>${fmt(row.cps)}/s</td>
        <td>${row.defense}</td>
        <td>${row.hack_count_against}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.warn("leaderboard refresh failed", e);
  }
}

tryLoadSavedUsername();
