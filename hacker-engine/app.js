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
  el("successCount").textContent = fmt(state.successful_hacks);
  el("stolenCount").textContent = fmt(state.total_stolen);
  renderTools();
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
        syncState();
      }
    });
  });
}

// ---------- Targets & leaderboard ----------

async function refreshTargets() {
  try {
    const rows = await apiTargetList(15);
    const tbody = el("targetsBody");
    tbody.innerHTML = "";
    rows.forEach((row) => {
      if (row.username === state.username) return;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.username}</td>
        <td>${fmt(row.commits)}</td>
        <td>${row.defense}</td>
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
      resolveAttempt(0, backdrop);
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
    const bonus = Math.max(0, Math.min(1, accuracy * 0.7 + speedFactor * 0.3));
    expired = true;
    clearInterval(timer);
    resolveAttempt(bonus, backdrop);
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

async function resolveAttempt(puzzleBonus, backdrop) {
  const oddsLine = backdrop.querySelector("#oddsLine");
  const submitBtn = backdrop.querySelector("#submitHackBtn");
  submitBtn.disabled = true;
  if (oddsLine) oddsLine.textContent = "Executing...";

  try {
    const result = await apiAttemptHack(state.username, currentTarget, puzzleBonus);
    if (result.success) {
      state.successful_hacks += 1;
      state.total_stolen += result.stolen;
      state.credits += result.stolen;
      showToast(`Breach successful! Stole ${fmt(result.stolen)} commits from ${currentTarget}.`, true);
      logLine(`breach on <b>${currentTarget}</b> succeeded (${result.successChance}% odds) — stole ${fmt(result.stolen)}`, true);
    } else {
      state.failed_hacks += 1;
      showToast(`Breach failed against ${currentTarget}. Defenses held.`);
      logLine(`breach on <b>${currentTarget}</b> failed (${result.successChance}% odds)`, false);
    }
    renderAll();
    syncState();
    refreshLeaderboard();
    refreshTargets();
  } catch (e) {
    showToast(e.message);
  } finally {
    setTimeout(() => backdrop.remove(), 900);
  }
}

// ---------- Sync loop ----------

function startLoop() {
  syncTimer = setInterval(() => {
    if (state.dirty) syncState();
  }, 6000);
  setInterval(refreshTargets, 20000);
  setInterval(refreshLeaderboard, 20000);
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
