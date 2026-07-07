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
  syncCycle();
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
  el("manualClickCount").textContent = fmt(state.manualClicks);
  el("accountAge").textContent = state.accountAgeFormatted;
  renderUpgrades();
  renderSecurityUpgrades();
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

function renderSecurityUpgrades() {
  const container = el("securityList");
  if (!container) return;
  container.innerHTML = "";
  for (const sec of SECURITY_UPGRADES) {
    const owned = state.securityUpgrades[sec.id] || 0;
    const cost = securityCost(sec, owned);
    const div = document.createElement("div");
    div.className = "upgrade";
    div.innerHTML = `
      <div class="info">
        <div class="name">${sec.name} ${owned ? `<span style="color:var(--text-dim)">x${owned}</span>` : ""}</div>
        <div class="desc">${sec.desc}</div>
      </div>
      <div class="cost">${fmt(cost)} commits</div>
      <button data-id="${sec.id}" ${state.commits < cost ? "disabled" : ""}>Buy</button>
    `;
    container.appendChild(div);
  }
  container.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.buySecurityUpgrade(btn.dataset.id)) {
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
      <p style="color:var(--text-dim); font-size:0.75rem;">Every achievement grants a one-time commit bonus plus +0.5% production, permanently.</p>
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
    const rewardText = a.rewardGiven ? ` (+${fmt(a.rewardGiven)} commits, +0.5% production forever)` : "";
    showToast(`Achievement unlocked: ${a.name}${rewardText}`);
    logLine(`achievement unlocked: <b>${a.name}</b>${rewardText}`);
  }
  if (newly.length) {
    renderAchievements();
    el("commitCount").textContent = fmt(state.commits);
    el("cpsCount").textContent = fmt(state.cps);
  }
}

// ---------- Loop ----------

el("commitBtn").addEventListener("click", () => {
  state.clickCommit();
  el("commitCount").textContent = fmt(state.commits);
  el("manualClickCount").textContent = fmt(state.manualClicks);
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

  // Catch idle-earned achievements (commit/cps milestones) even without clicking anything
  setInterval(() => {
    checkAchievements();
  }, 1500);

  setInterval(() => {
    el("accountAge").textContent = state.accountAgeFormatted;
  }, 1000);

  // Combined hack-check + sync cycle. Hack-check MUST run before any outgoing push,
  // otherwise a routine sync could overwrite a server-side theft with our stale local
  // (unaffected) commit count and silently "undo" the hack.
  syncTimer = setInterval(syncCycle, 5000);

  setInterval(refreshLeaderboard, 20000);
}

async function syncCycle() {
  if (!state.username) return;
  try {
    const account = await apiGetAccount(state.username);
    if (account && account.hack_count_against > state.hack_count_against) {
      // We were hacked since our last known state. Adopt the server's numbers as truth
      // (this sacrifices a few seconds of unsynced idle gain, but guarantees the theft sticks)
      // instead of pushing our local total back up and erasing the hack.
      const logs = await apiHackLog(state.username);
      state.applySnapshot(account);
      state.dirty = false;
      renderAll();
      checkAchievements();
      if (logs[0]) {
        showToast(`You were hacked by ${logs[0].hacker}! Lost ${fmt(logs[0].stolen)} commits.`, true);
        logLine(`INTRUSION by <b>${logs[0].hacker}</b> — stole ${fmt(logs[0].stolen)} commits`, true);
      } else {
        showToast(`You were breached! Lost commits to an unknown attacker.`, true);
        logLine(`INTRUSION detected — breach count increased`, true);
      }
      return; // skip the push this cycle; we just adopted server state
    }
    // Not hacked (or no change) - safe to push our local progress up.
    if (state.dirty) {
      state.dirty = false;
      await apiUpdateAccount(state.username, state.toPatch());
    }
  } catch (e) {
    console.warn("sync cycle failed", e);
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
