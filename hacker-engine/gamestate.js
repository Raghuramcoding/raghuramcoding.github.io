function formatDuration(totalSeconds) {
  totalSeconds = Math.floor(totalSeconds);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

const TOOLS = [
  { id: "portscanner", name: "Port Scanner", desc: "+1 power, +0.3 credits/sec", baseCost: 20, powerGain: 1, incomeGain: 0.3 },
  { id: "keylogger", name: "Keylogger Kit", desc: "+4 power, +1.2 credits/sec", baseCost: 120, powerGain: 4, incomeGain: 1.2 },
  { id: "botnet", name: "Botnet Rental", desc: "+15 power, +5 credits/sec", baseCost: 700, powerGain: 15, incomeGain: 5 },
  { id: "zeroday", name: "Zero-Day Exploit", desc: "+60 power, +20 credits/sec", baseCost: 4000, powerGain: 60, incomeGain: 20 },
  { id: "quantum", name: "Quantum Cracker", desc: "+250 power, +80 credits/sec", baseCost: 25000, powerGain: 250, incomeGain: 80 },
  { id: "aicracker", name: "AI-Assisted Cracker", desc: "+500 power, +150 credits/sec", baseCost: 150000, powerGain: 500, incomeGain: 150 },
  { id: "supercomputer", name: "Supercomputer Cluster", desc: "+1200 power, +400 credits/sec", baseCost: 900000, powerGain: 1200, incomeGain: 400 },
  { id: "nationstate", name: "Nation-State Backing", desc: "+3500 power, +1200 credits/sec", baseCost: 6000000, powerGain: 3500, incomeGain: 1200 },
  { id: "agi", name: "Rogue AGI Assistant", desc: "+9000 power, +4000 credits/sec", baseCost: 40000000, powerGain: 9000, incomeGain: 4000 },
];

const BASE_INCOME = 0.1; // "selling scraps on the dark web" - a trickle even with zero tools, so you're never fully stuck

function toolCost(tool, owned) {
  return Math.floor(tool.baseCost * Math.pow(1.18, owned));
}

function computeIncome(tools) {
  let income = BASE_INCOME;
  for (const tool of TOOLS) {
    const owned = tools[tool.id] || 0;
    income += owned * tool.incomeGain;
  }
  return income;
}

// ---------- Achievements ----------
// Each achievement: { id, name, how (description of what unlocks it), check(state) }
// state.achievements is stored as a map: { [id]: isoTimestampString } once unlocked.

function fmtStatic(n) {
  if (n < 1000) return String(n);
  const units = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc"];
  let i = 0, v = n;
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
  return v.toFixed(v < 10 ? 1 : 0) + units[i];
}

function powerMilestone(id, name, threshold) {
  return { id, name, how: `Reach ${fmtStatic(threshold)} power.`, check: (s) => s.power >= threshold };
}
function successMilestone(id, name, threshold) {
  return { id, name, how: `Land ${fmtStatic(threshold)} successful hack${threshold > 1 ? "s" : ""}.`, check: (s) => s.successful_hacks >= threshold };
}
function failMilestone(id, name, threshold) {
  return { id, name, how: `Fail ${fmtStatic(threshold)} hack attempt${threshold > 1 ? "s" : ""}.`, check: (s) => s.failed_hacks >= threshold };
}
function stolenMilestone(id, name, threshold) {
  return { id, name, how: `Steal ${fmtStatic(threshold)} total commits across all hacks.`, check: (s) => s.total_stolen >= threshold };
}
function creditsMilestone(id, name, threshold) {
  return { id, name, how: `Hold ${fmtStatic(threshold)} credits at once.`, check: (s) => s.credits >= threshold };
}
function incomeMilestone(id, name, threshold) {
  return { id, name, how: `Reach ${fmtStatic(threshold)} passive credits/sec from your tools.`, check: (s) => s.income >= threshold };
}
function toolOwnedMilestone(id, name, toolId, threshold) {
  const tool = TOOLS.find((t) => t.id === toolId);
  return { id, name, how: `Own ${threshold}x ${tool.name}.`, check: (s) => (s.tools[toolId] || 0) >= threshold };
}
function totalToolsMilestone(id, name, threshold) {
  return {
    id, name, how: `Own ${threshold} tools total, combined across all types.`,
    check: (s) => Object.values(s.tools).reduce((a, b) => a + b, 0) >= threshold,
  };
}
function attemptsMilestone(id, name, threshold) {
  return { id, name, how: `Make ${fmtStatic(threshold)} total hack attempts (successful or not).`, check: (s) => (s.successful_hacks + s.failed_hacks) >= threshold };
}
function manualHackMilestone(id, name, threshold) {
  return { id, name, how: `Manually run the hack mini-puzzle ${fmtStatic(threshold)} time${threshold > 1 ? "s" : ""} (not counting auto-hacks).`, check: (s) => (s.manualHacks || 0) >= threshold };
}
function autoHackMilestone(id, name, threshold) {
  return { id, name, how: `Land ${fmtStatic(threshold)} successful auto-hack${threshold > 1 ? "s" : ""} (the automatic once-a-minute attempts).`, check: (s) => (s.autoHackSuccesses || 0) >= threshold };
}

const ACHIEVEMENTS = [
  { id: "first_hack", name: "Popped the Lock", how: "Land your first successful hack.", check: (s) => s.successful_hacks >= 1 },
  { id: "first_fail", name: "Access Denied", how: "Fail a hack attempt for the first time.", check: (s) => s.failed_hacks >= 1 },
  { id: "first_tool", name: "Kitted Out", how: "Deploy your first tool.", check: (s) => Object.keys(s.tools).length >= 1 },
  { id: "all_tools", name: "Full Arsenal", how: "Own at least one of every tool type.", check: (s) => Object.keys(s.tools).length >= TOOLS.length },
  { id: "clean_sweep", name: "Clean Sweep", how: "Land 5 successful hacks with zero failures.", check: (s) => s.successful_hacks >= 5 && s.failed_hacks === 0 },
  { id: "persistent", name: "Persistent Threat", how: "Fail 3 times, then land a successful hack anyway.", check: (s) => s.failed_hacks >= 3 && s.successful_hacks >= 1 },
  { id: "big_score", name: "Jackpot", how: "Steal 10,000+ commits in a single hack.", check: (s) => (s.biggestSingleSteal || 0) >= 10000 },
  { id: "night_owl", name: "3AM Intrusion", how: "Have hacker-engine open past midnight local time.", check: () => { const h = new Date().getHours(); return h === 0; } },
  { id: "completionist_50", name: "Halfway There", how: "Unlock 50 achievements.", check: (s) => Object.keys(s.achievements).length >= 50 },
  { id: "completionist_100", name: "Triple Digits", how: "Unlock 100 achievements.", check: (s) => Object.keys(s.achievements).length >= 100 },
  { id: "completionist_150", name: "Nearly There", how: "Unlock 150 achievements.", check: (s) => Object.keys(s.achievements).length >= 150 },
  { id: "completionist_all", name: "Ghost in the Shell", how: "Unlock every other achievement in the game.", check: (s) => Object.keys(s.achievements).length >= ALL_ACHIEVEMENTS.length - 1 },
  { id: "spender", name: "Big Spender", how: "Spend 10,000+ credits total on tools.", check: (s) => (s.totalCreditsSpent || 0) >= 10000 },
  { id: "spender2", name: "Money Burns a Hole", how: "Spend 100,000+ credits total on tools.", check: (s) => (s.totalCreditsSpent || 0) >= 100000 },
  { id: "spender3", name: "Blank Check", how: "Spend 1,000,000+ credits total on tools.", check: (s) => (s.totalCreditsSpent || 0) >= 1000000 },
  { id: "underdog", name: "Underdog Victory", how: "Land a successful hack with less power than 20.", check: (s) => s.successful_hacks >= 1 && s.power < 20 },
  { id: "overwhelming_force", name: "Overwhelming Force", how: "Reach 1000+ power while having landed at least 1 hack.", check: (s) => s.power >= 1000 && s.successful_hacks >= 1 },
  { id: "efficient", name: "Efficient Operator", how: "Land 10 successful hacks with fewer than 5 failures.", check: (s) => s.successful_hacks >= 10 && s.failed_hacks < 5 },
  { id: "diversified", name: "Diversified Portfolio", how: "Own at least 2 of every tool type.", check: (s) => TOOLS.every((t) => (s.tools[t.id] || 0) >= 2) },
  { id: "one_of_everything", name: "One of Everything", how: "Own at least 3 of every tool type.", check: (s) => TOOLS.every((t) => (s.tools[t.id] || 0) >= 3) },
  { id: "autopilot", name: "Autopilot Engaged", how: "Let hacker-engine run its automatic once-a-minute breach attempt for the first time.", check: (s) => (s.autoHackAttempts || 0) >= 1 },
  { id: "autopilot_success", name: "Set It and Forget It", how: "Land your first successful automatic hack.", check: (s) => (s.autoHackSuccesses || 0) >= 1 },
  { id: "leaderboard_climber", name: "Climbing the Ranks", how: "Successfully hack the #1 account on the commit-engine leaderboard.", check: (s) => !!s.hasHackedRank1 },
];

const POWER_TIERS = [
  ["pow_15", "Warming Up", 15],
  ["pow_25", "Script Kiddie No More", 25],
  ["pow_50", "Getting Dangerous", 50],
  ["pow_100", "Triple Digits", 100],
  ["pow_250", "Serious Threat", 250],
  ["pow_500", "Elite Tier", 500],
  ["pow_1k", "Kilopower", 1000],
  ["pow_2500", "State-Sponsored Vibes", 2500],
  ["pow_5k", "Cyber Warfare Unit", 5000],
  ["pow_10k", "Digital Superweapon", 10000],
  ["pow_25k", "Beyond Firewall", 25000],
  ["pow_50k", "Root of All Systems", 50000],
  ["pow_100k", "Six Figure Power", 100000],
  ["pow_250k", "Quarter Million Power", 250000],
  ["pow_500k", "Half Million Power", 500000],
  ["pow_1m", "Million Power", 1000000],
];

const SUCCESS_TIERS = [
  ["succ_5", "Getting the Hang of It", 5],
  ["succ_10", "Double Digits", 10],
  ["succ_25", "Prolific", 25],
  ["succ_50", "Half Century", 50],
  ["succ_100", "Century Club", 100],
  ["succ_250", "Serial Breacher", 250],
  ["succ_500", "Half a Grand of Breaches", 500],
  ["succ_1k", "Kilo-Hacker", 1000],
  ["succ_2500", "Legendary Intruder", 2500],
  ["succ_5k", "Myth Status", 5000],
  ["succ_10k", "Ten Thousand Breaches", 10000],
];

const FAIL_TIERS = [
  ["fail_5", "Rookie Mistakes", 5],
  ["fail_10", "Still Learning", 10],
  ["fail_25", "Rejected Repeatedly", 25],
  ["fail_50", "Glutton for Punishment", 50],
  ["fail_100", "Never Give Up", 100],
  ["fail_250", "Immune to Shame", 250],
  ["fail_500", "Half a Grand of Rejections", 500],
];

const STOLEN_TIERS = [
  ["st_100", "Petty Theft", 100],
  ["st_1k", "Real Money Now", 1000],
  ["st_10k", "Ten Grand Heist", 10000],
  ["st_50k", "Serious Payday", 50000],
  ["st_100k", "Six Figure Heist", 100000],
  ["st_500k", "Half Million Club", 500000],
  ["st_1m", "Millionaire Hacker", 1000000],
  ["st_5m", "Five Million Stolen", 5000000],
  ["st_10m", "Ten Million Stolen", 10000000],
  ["st_50m", "Fifty Million Stolen", 50000000],
  ["st_100m", "Nine Figure Heist", 100000000],
  ["st_1b", "Billion Commit Bandit", 1000000000],
  ["st_10b", "Ten Billion Stolen", 10000000000],
  ["st_100b", "Hundred Billion Stolen", 100000000000],
  ["st_1t", "Trillion Commit Bandit", 1000000000000],
];

const CREDITS_TIERS = [
  ["cr_100", "First Payday", 100],
  ["cr_1k", "Four Figures", 1000],
  ["cr_10k", "Five Figures", 10000],
  ["cr_100k", "Six Figures", 100000],
  ["cr_1m", "Credit Millionaire", 1000000],
  ["cr_10m", "Credit Baron", 10000000],
  ["cr_100m", "Credit Overlord", 100000000],
  ["cr_1b", "Credit Billionaire", 1000000000],
  ["cr_10b", "Absurd Wealth", 10000000000],
];

const INCOME_TIERS = [
  ["inc_1", "First Trickle", 1],
  ["inc_5", "Steady Drip", 5],
  ["inc_10", "Real Income", 10],
  ["inc_25", "Side Hustle", 25],
  ["inc_50", "Passive Empire", 50],
  ["inc_100", "Triple Digit Flow", 100],
  ["inc_500", "Automated Wealth", 500],
  ["inc_1k", "Kilo Income", 1000],
];

const ATTEMPTS_TIERS = [
  ["att_10", "Ten Attempts", 10],
  ["att_50", "Fifty Attempts", 50],
  ["att_100", "Century of Attempts", 100],
  ["att_500", "Five Hundred Attempts", 500],
  ["att_1k", "Thousand Attempts", 1000],
  ["att_5k", "Five Thousand Attempts", 5000],
];

const AUTO_HACK_TIERS = [
  ["auto_5", "Autopilot Rookie", 5],
  ["auto_25", "Autopilot Veteran", 25],
  ["auto_100", "Autopilot Master", 100],
  ["auto_500", "Autopilot Legend", 500],
];

const MANUAL_HACK_TIERS = [
  ["manual_10", "Hands-On Hacker", 10],
  ["manual_50", "Manual Labor", 50],
  ["manual_100", "Century of Keystrokes", 100],
  ["manual_500", "Dedicated Operator", 500],
  ["manual_1k", "Thousand Keystrokes", 1000],
];

const TOOL_OWN_TIERS = [5, 10, 25, 50];

const TOTAL_TOOLS_TIERS = [
  ["total_tool_10", "Toolkit Filling Up", 10],
  ["total_tool_25", "Well Equipped", 25],
  ["total_tool_50", "Fully Loaded", 50],
  ["total_tool_100", "Maximum Firepower", 100],
  ["total_tool_250", "Overkill", 250],
  ["total_tool_500", "Beyond Overkill", 500],
];

function buildAllAchievements() {
  const list = [...ACHIEVEMENTS];
  for (const [id, name, t] of POWER_TIERS) list.push(powerMilestone(id, name, t));
  for (const [id, name, t] of SUCCESS_TIERS) list.push(successMilestone(id, name, t));
  for (const [id, name, t] of FAIL_TIERS) list.push(failMilestone(id, name, t));
  for (const [id, name, t] of STOLEN_TIERS) list.push(stolenMilestone(id, name, t));
  for (const [id, name, t] of CREDITS_TIERS) list.push(creditsMilestone(id, name, t));
  for (const [id, name, t] of INCOME_TIERS) list.push(incomeMilestone(id, name, t));
  for (const [id, name, t] of ATTEMPTS_TIERS) list.push(attemptsMilestone(id, name, t));
  for (const [id, name, t] of MANUAL_HACK_TIERS) list.push(manualHackMilestone(id, name, t));
  for (const [id, name, t] of AUTO_HACK_TIERS) list.push(autoHackMilestone(id, name, t));
  for (const tool of TOOLS) {
    for (const tier of TOOL_OWN_TIERS) {
      list.push(toolOwnedMilestone(`own_${tool.id}_${tier}`, `${tool.name} x${tier}`, tool.id, tier));
    }
  }
  for (const [id, name, t] of TOTAL_TOOLS_TIERS) list.push(totalToolsMilestone(id, name, t));
  return list;
}

const ALL_ACHIEVEMENTS = buildAllAchievements();

class HackerState {
  constructor() {
    this.username = null;
    this.power = 10; // effective power (includes achievement bonus) - this is what's sent to the server for hack odds
    this.basePower = 10; // power from tools/base only, before achievement bonus
    this.tools = {}; // { id: count }
    this.successful_hacks = 0;
    this.failed_hacks = 0;
    this.total_stolen = 0;
    this.credits = 0;
    this.income = BASE_INCOME; // credits/sec, passive
    this.achievements = {}; // { id: isoTimestamp }
    this.biggestSingleSteal = 0;
    this.totalCreditsSpent = 0;
    this.autoHackAttempts = 0;
    this.autoHackSuccesses = 0;
    this.hasHackedRank1 = false;
    this.manualHacks = 0;
    this.accountCreatedAt = null; // ISO string from server's created_at
    this.dirty = false;
  }

  get accountAgeSeconds() {
    if (!this.accountCreatedAt) return undefined;
    return (Date.now() - new Date(this.accountCreatedAt + "Z").getTime()) / 1000;
  }

  get accountAgeFormatted() {
    const secs = this.accountAgeSeconds;
    if (secs === undefined || isNaN(secs) || secs < 0) return "—";
    return formatDuration(secs);
  }

  // Every unlocked achievement permanently adds +0.5% power, cumulative.
  get achievementBonusMultiplier() {
    return 1 + 0.005 * Object.keys(this.achievements).length;
  }

  recomputePower() {
    this.power = this.basePower * this.achievementBonusMultiplier;
  }

  tick(seconds) {
    if (this.income > 0) {
      this.credits += this.income * seconds;
      this.dirty = true;
    }
  }

  buyTool(id) {
    const tool = TOOLS.find((t) => t.id === id);
    if (!tool) return false;
    const owned = this.tools[id] || 0;
    const cost = toolCost(tool, owned);
    if (this.credits < cost) return false;
    this.credits -= cost;
    this.totalCreditsSpent += cost;
    this.tools[id] = owned + 1;
    this.basePower += tool.powerGain;
    this.recomputePower();
    this.income = computeIncome(this.tools);
    this.dirty = true;
    return true;
  }

  recordHackResult(success, stolen, wasAutoHack, targetWasRank1) {
    if (wasAutoHack) this.autoHackAttempts += 1;
    else this.manualHacks += 1;
    if (success) {
      this.successful_hacks += 1;
      this.total_stolen += stolen;
      this.credits += stolen;
      if (stolen > this.biggestSingleSteal) this.biggestSingleSteal = stolen;
      if (wasAutoHack) this.autoHackSuccesses += 1;
      if (targetWasRank1) this.hasHackedRank1 = true;
    } else {
      this.failed_hacks += 1;
    }
    this.dirty = true;
  }

  checkAchievements() {
    const newly = [];
    const now = new Date().toISOString();
    for (const a of ALL_ACHIEVEMENTS) {
      if (!this.achievements[a.id] && a.check(this)) {
        this.achievements[a.id] = now;
        // One-time reward: roughly 30 seconds worth of your current income, minimum 20 credits.
        const reward = Math.max(20, Math.floor(this.income * 30));
        this.credits += reward;
        a.rewardGiven = reward;
        newly.push(a);
      }
    }
    if (newly.length) {
      this.recomputePower();
      this.dirty = true;
    }
    return newly;
  }

  applySnapshot(remote) {
    this.tools = remote.tools || {};
    this.income = computeIncome(this.tools);
    this.successful_hacks = remote.successful_hacks ?? 0;
    this.failed_hacks = remote.failed_hacks ?? 0;
    this.total_stolen = remote.total_stolen ?? 0;
    this.credits = remote.credits ?? this.credits ?? 0;
    if (Array.isArray(remote.achievements)) {
      const now = new Date().toISOString();
      this.achievements = {};
      for (const id of remote.achievements) this.achievements[id] = now;
    } else {
      this.achievements = remote.achievements || {};
    }
    // remote.power is the effective (bonus-included) value we last persisted. Back out
    // basePower using the current achievement multiplier so future tool purchases add
    // correctly on top - a little rounding drift is possible over many reload cycles but
    // is negligible in practice.
    const persistedPower = remote.power ?? 10;
    this.basePower = persistedPower / this.achievementBonusMultiplier;
    this.power = persistedPower;
    this.manualHacks = remote.manual_hacks ?? this.manualHacks ?? 0;
    this.accountCreatedAt = remote.created_at || this.accountCreatedAt;
  }

  toPatch() {
    return {
      power: this.power,
      tools: this.tools,
      credits: Math.floor(this.credits),
      achievements: this.achievements,
      manualHacks: Math.floor(this.manualHacks),
    };
  }
}
