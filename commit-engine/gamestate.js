const UPGRADES = [
  { id: "linter", name: "Autolinter", desc: "+1 commit/sec", baseCost: 15, cpsGain: 1 },
  { id: "intern", name: "Hire an Intern", desc: "+5 commits/sec", baseCost: 100, cpsGain: 5 },
  { id: "cicd", name: "CI/CD Pipeline", desc: "+20 commits/sec", baseCost: 600, cpsGain: 20 },
  { id: "monorepo", name: "Monorepo Migration", desc: "+90 commits/sec", baseCost: 3500, cpsGain: 90 },
  { id: "aiagent", name: "AI Coding Agent", desc: "+400 commits/sec", baseCost: 20000, cpsGain: 400 },
  { id: "datacenter", name: "Dedicated Datacenter", desc: "+2000 commits/sec", baseCost: 120000, cpsGain: 2000 },
  { id: "aicluster", name: "AI Compute Cluster", desc: "+8000 commits/sec", baseCost: 700000, cpsGain: 8000 },
  { id: "quantumcompiler", name: "Quantum Compiler", desc: "+35000 commits/sec", baseCost: 4000000, cpsGain: 35000 },
  { id: "globalcdn", name: "Global CDN Mirror Farm", desc: "+150000 commits/sec", baseCost: 25000000, cpsGain: 150000 },
  { id: "singularity", name: "Code Singularity", desc: "+750000 commits/sec", baseCost: 150000000, cpsGain: 750000 },
];

// Security upgrades are a separate purchase track - they raise defense directly
// instead of production speed, so hardening your account is a deliberate choice.
const SECURITY_UPGRADES = [
  { id: "basicfirewall", name: "Basic Firewall", desc: "+3 defense", baseCost: 50, defGain: 3 },
  { id: "twofa", name: "Two-Factor Auth", desc: "+8 defense", baseCost: 400, defGain: 8 },
  { id: "pentest", name: "Pentest Team", desc: "+20 defense", baseCost: 3000, defGain: 20 },
  { id: "zerotrust", name: "Zero Trust Architecture", desc: "+60 defense", baseCost: 20000, defGain: 60 },
  { id: "aidefense", name: "AI Intrusion Detection", desc: "+200 defense", baseCost: 150000, defGain: 200 },
  { id: "airgap", name: "Air-Gapped Backups", desc: "+600 defense", baseCost: 1200000, defGain: 600 },
];

function upgradeCost(upgrade, ownedCount) {
  return Math.floor(upgrade.baseCost * Math.pow(1.15, ownedCount));
}
function securityCost(upgrade, ownedCount) {
  return Math.floor(upgrade.baseCost * Math.pow(1.16, ownedCount));
}

// A purchase counts as "big" for the speedrunner-style achievement if its base cost clears this bar.
const BIG_UPGRADE_COST_THRESHOLD = 3000;

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

function commitMilestone(id, name, threshold) {
  return { id, name, how: `Reach ${fmtStatic(threshold)} total commits.`, check: (s) => s.commits >= threshold };
}
function cpsMilestone(id, name, threshold) {
  return { id, name, how: `Reach ${fmtStatic(threshold)} commits/sec.`, check: (s) => s.cps >= threshold };
}
function clickMilestone(id, name, threshold) {
  return { id, name, how: `Manually click "git commit" ${fmtStatic(threshold)} times.`, check: (s) => (s.manualClicks || 0) >= threshold };
}
function defenseMilestone(id, name, threshold) {
  return { id, name, how: `Raise your defense stat to ${threshold}.`, check: (s) => s.defense >= threshold };
}
function breachMilestone(id, name, threshold) {
  return { id, name, how: `Get hacked ${threshold} time${threshold > 1 ? "s" : ""} by hacker-engine players.`, check: (s) => s.hack_count_against >= threshold };
}
function upgradeOwnedMilestone(id, name, upgradeId, threshold) {
  const upg = UPGRADES.find((u) => u.id === upgradeId);
  return { id, name, how: `Own ${threshold}x ${upg.name}.`, check: (s) => (s.upgrades[upgradeId] || 0) >= threshold };
}
function securityOwnedMilestone(id, name, secId, threshold) {
  const sec = SECURITY_UPGRADES.find((u) => u.id === secId);
  return { id, name, how: `Own ${threshold}x ${sec.name}.`, check: (s) => (s.securityUpgrades[secId] || 0) >= threshold };
}
function totalUpgradesMilestone(id, name, threshold) {
  return {
    id, name, how: `Own ${threshold} production upgrades total, combined across all types.`,
    check: (s) => Object.values(s.upgrades).reduce((a, b) => a + b, 0) >= threshold,
  };
}
function totalSecurityMilestone(id, name, threshold) {
  return {
    id, name, how: `Own ${threshold} security upgrades total, combined across all types.`,
    check: (s) => Object.values(s.securityUpgrades).reduce((a, b) => a + b, 0) >= threshold,
  };
}

const ACHIEVEMENTS = [
  { id: "first_commit", name: "Hello World", how: "Make your first commit.", check: (s) => s.commits >= 1 },
  { id: "first_upgrade", name: "Tooling Up", how: "Buy your first production upgrade.", check: (s) => Object.keys(s.upgrades).length >= 1 },
  { id: "first_security", name: "Better Safe Than Sorry", how: "Buy your first security upgrade.", check: (s) => Object.keys(s.securityUpgrades).length >= 1 },
  { id: "all_upgrades", name: "Fully Automated", how: "Own at least one of every production upgrade type.", check: (s) => Object.keys(s.upgrades).length >= UPGRADES.length },
  { id: "all_security", name: "Defense in Depth", how: "Own at least one of every security upgrade type.", check: (s) => Object.keys(s.securityUpgrades).length >= SECURITY_UPGRADES.length },
  { id: "survivor", name: "Breach Survivor", how: "Survive your first hack attempt against you.", check: (s) => s.hack_count_against >= 1 },
  { id: "fortress", name: "Fort Knox", how: "Raise your defense stat to 50.", check: (s) => s.defense >= 50 },
  { id: "night_owl", name: "Night Shift", how: "Have the game open past midnight local time.", check: () => { const h = new Date().getHours(); return h === 0; } },
  { id: "typo", name: "git commit -m \"fix typo\"", how: "Make at least 3 commits in one session.", check: (s) => (s.manualClicks || 0) >= 3 },
  { id: "no_ff", name: "Merge Conflict Survivor", how: "Get hacked, then keep playing and earn 1000 more commits.", check: (s) => s.hack_count_against >= 1 && s.commits >= 1000 },
  {
    id: "speedrunner", name: "Speedrunner",
    how: "Earn 5,000+ commits within 5 minutes of buying a big upgrade (3,000+ base cost). Works anytime, not just early game.",
    check: (s) => !!s.lastBigUpgradeAt && (Date.now() - s.lastBigUpgradeAt) <= 5 * 60 * 1000 && (s.commits - (s.lastBigUpgradeBaseline || 0)) >= 5000,
  },
  {
    id: "speedrunner2", name: "Speedrunner II",
    how: "Earn 250,000+ commits within 5 minutes of buying a big upgrade. Repeatable-feel, works late-game too.",
    check: (s) => !!s.lastBigUpgradeAt && (Date.now() - s.lastBigUpgradeAt) <= 5 * 60 * 1000 && (s.commits - (s.lastBigUpgradeBaseline || 0)) >= 250000,
  },
  { id: "completionist_50", name: "Halfway There", how: "Unlock 50 achievements.", check: (s) => Object.keys(s.achievements).length >= 50 },
  { id: "completionist_100", name: "Triple Digits", how: "Unlock 100 achievements.", check: (s) => Object.keys(s.achievements).length >= 100 },
  { id: "completionist_150", name: "Nearly There", how: "Unlock 150 achievements.", check: (s) => Object.keys(s.achievements).length >= 150 },
  { id: "completionist_all", name: "Achievement Hunter", how: "Unlock every other achievement in the game.", check: (s) => Object.keys(s.achievements).length >= ALL_ACHIEVEMENTS.length - 1 },
];

// Commit count milestones (tiered, flavorful names)
const COMMIT_TIERS = [
  ["c_10", "Getting Started", 10],
  ["c_50", "Building Momentum", 50],
  ["c_100", "Century", 100],
  ["c_250", "Quarter-K Club", 250],
  ["c_500", "Half a Grand", 500],
  ["c_1k", "Kilocommit", 1000],
  ["c_2500", "Overachiever", 2500],
  ["c_5k", "Five Grand Strong", 5000],
  ["c_10k", "Ten Thousand Strong", 10000],
  ["c_25k", "Commit Machine", 25000],
  ["c_50k", "Commit Factory", 50000],
  ["c_100k", "Six Figures", 100000],
  ["c_250k", "Commit Empire", 250000],
  ["c_500k", "Halfway to a Million", 500000],
  ["c_1m", "Unicorn Repo", 1000000],
  ["c_2_5m", "Commit Tycoon", 2500000],
  ["c_5m", "Commit Baron", 5000000],
  ["c_10m", "Ten Million Lines Deep", 10000000],
  ["c_25m", "Repository of Legend", 25000000],
  ["c_50m", "Commit Overlord", 50000000],
  ["c_100m", "Nine Figures", 100000000],
  ["c_250m", "Commit Dynasty", 250000000],
  ["c_500m", "Half a Billion Commits", 500000000],
  ["c_1b", "Commit Billionaire", 1000000000],
  ["c_10b", "Ten Billion Club", 10000000000],
  ["c_100b", "Commit Singularity", 100000000000],
  ["c_1t", "Trillion Commit Legend", 1000000000000],
  ["c_10t", "Ten Trillion Commits", 10000000000000],
  ["c_100t", "Hundred Trillion Commits", 100000000000000],
  ["c_1qa", "Quadrillion Commit God", 1000000000000000],
];

// CPS milestones
const CPS_TIERS = [
  ["cps_1", "First Automation", 1],
  ["cps_5", "Small Pipeline", 5],
  ["cps_10", "Real Pipeline", 10],
  ["cps_25", "Assembly Line", 25],
  ["cps_50", "Production Grade", 50],
  ["cps_100", "Triple Digit Throughput", 100],
  ["cps_250", "Industrial Scale", 250],
  ["cps_500", "Commit Firehose", 500],
  ["cps_1k", "Kilocommit Per Second", 1000],
  ["cps_2500", "Data Center Grade", 2500],
  ["cps_5k", "Commit Torrent", 5000],
  ["cps_10k", "Ludicrous Throughput", 10000],
  ["cps_25k", "Beyond Ludicrous", 25000],
  ["cps_50k", "Post-Scarcity Codebase", 50000],
  ["cps_100k", "Six Figure Throughput", 100000],
  ["cps_250k", "Compiler Farm Overload", 250000],
  ["cps_500k", "Half Million Per Second", 500000],
  ["cps_1m", "Million Per Second", 1000000],
];

// Manual click milestones
const CLICK_TIERS = [
  ["click_10", "Warming Up", 10],
  ["click_50", "Finger Cramps", 50],
  ["click_100", "Carpal Tunnel Candidate", 100],
  ["click_500", "Clicking Machine", 500],
  ["click_1k", "RSI Incoming", 1000],
  ["click_5k", "Mechanical Keyboard Enjoyer", 5000],
  ["click_10k", "Click Legend", 10000],
];

// Defense milestones
const DEFENSE_TIERS = [
  ["def_15", "Basic Firewall Tier", 15],
  ["def_20", "Locked Down", 20],
  ["def_30", "Hardened", 30],
  ["def_50", "Fort Knox Tier", 50],
  ["def_75", "Bunker Mentality", 75],
  ["def_100", "Impenetrable", 100],
  ["def_150", "Digital Fortress", 150],
  ["def_200", "Paranoid Architecture", 200],
  ["def_300", "Unhackable (Allegedly)", 300],
  ["def_500", "Absolute Zero Trust", 500],
  ["def_1k", "Kilodefense", 1000],
];

// Breach milestones
const BREACH_TIERS = [
  ["breach_1", "First Blood (Theirs)", 1],
  ["breach_5", "Frequent Target", 5],
  ["breach_10", "Most Wanted", 10],
  ["breach_25", "Perpetual Victim", 25],
  ["breach_50", "Living Legend of Losses", 50],
  ["breach_100", "Community Punching Bag", 100],
];

// Per-upgrade "own N" milestones
const UPGRADE_OWN_TIERS = [5, 10, 25, 50];
const SECURITY_OWN_TIERS = [5, 10, 25, 50];

// Total upgrades owned (all types combined)
const TOTAL_UPGRADE_TIERS = [
  ["total_up_10", "Toolbox Filling Up", 10],
  ["total_up_25", "Well Equipped", 25],
  ["total_up_50", "Fully Loaded", 50],
  ["total_up_100", "Maximum Automation", 100],
  ["total_up_250", "Overkill", 250],
  ["total_up_500", "Beyond Overkill", 500],
];
const TOTAL_SECURITY_TIERS = [
  ["total_sec_10", "Security Conscious", 10],
  ["total_sec_25", "Security Focused", 25],
  ["total_sec_50", "Security Obsessed", 50],
  ["total_sec_100", "Paranoid", 100],
  ["total_sec_250", "Certifiably Paranoid", 250],
];

function buildAllAchievements() {
  const list = [...ACHIEVEMENTS];
  for (const [id, name, threshold] of COMMIT_TIERS) list.push(commitMilestone(id, name, threshold));
  for (const [id, name, threshold] of CPS_TIERS) list.push(cpsMilestone(id, name, threshold));
  for (const [id, name, threshold] of CLICK_TIERS) list.push(clickMilestone(id, name, threshold));
  for (const [id, name, threshold] of DEFENSE_TIERS) list.push(defenseMilestone(id, name, threshold));
  for (const [id, name, threshold] of BREACH_TIERS) list.push(breachMilestone(id, name, threshold));
  for (const upg of UPGRADES) {
    for (const tier of UPGRADE_OWN_TIERS) {
      list.push(upgradeOwnedMilestone(`own_${upg.id}_${tier}`, `${upg.name} x${tier}`, upg.id, tier));
    }
  }
  for (const sec of SECURITY_UPGRADES) {
    for (const tier of SECURITY_OWN_TIERS) {
      list.push(securityOwnedMilestone(`own_sec_${sec.id}_${tier}`, `${sec.name} x${tier}`, sec.id, tier));
    }
  }
  for (const [id, name, threshold] of TOTAL_UPGRADE_TIERS) list.push(totalUpgradesMilestone(id, name, threshold));
  for (const [id, name, threshold] of TOTAL_SECURITY_TIERS) list.push(totalSecurityMilestone(id, name, threshold));
  return list;
}

const ALL_ACHIEVEMENTS = buildAllAchievements();

class GameState {
  constructor() {
    this.username = null;
    this.commits = 0;
    this.cps = 0;
    this.upgrades = {}; // { id: count }
    this.securityUpgrades = {}; // { id: count }
    this.achievements = {}; // { id: isoTimestampString }
    this.defense = 10;
    this.hack_count_against = 0;
    this.manualClicks = 0;
    this.accountCreatedAt = null; // ISO string from server's created_at
    this.lastBigUpgradeAt = null; // ms timestamp, for the repeatable speedrunner achievement
    this.lastBigUpgradeBaseline = null; // commits value right after paying for that upgrade
    this.dirty = false;
  }

  get accountAgeSeconds() {
    if (!this.accountCreatedAt) return undefined;
    return (Date.now() - new Date(this.accountCreatedAt + "Z").getTime()) / 1000;
  }

  clickCommit() {
    this.commits += 1;
    this.manualClicks += 1;
    this.dirty = true;
  }

  tick(seconds) {
    if (this.cps > 0) {
      this.commits += this.cps * seconds;
      this.dirty = true;
    }
  }

  buyUpgrade(id) {
    const upg = UPGRADES.find((u) => u.id === id);
    if (!upg) return false;
    const owned = this.upgrades[id] || 0;
    const cost = upgradeCost(upg, owned);
    if (this.commits < cost) return false;
    this.commits -= cost;
    this.upgrades[id] = owned + 1;
    this.cps += upg.cpsGain;
    if (upg.baseCost >= BIG_UPGRADE_COST_THRESHOLD) {
      this.lastBigUpgradeAt = Date.now();
      this.lastBigUpgradeBaseline = this.commits;
    }
    this.dirty = true;
    return true;
  }

  buySecurityUpgrade(id) {
    const sec = SECURITY_UPGRADES.find((u) => u.id === id);
    if (!sec) return false;
    const owned = this.securityUpgrades[id] || 0;
    const cost = securityCost(sec, owned);
    if (this.commits < cost) return false;
    this.commits -= cost;
    this.securityUpgrades[id] = owned + 1;
    this.defense += sec.defGain;
    this.dirty = true;
    return true;
  }

  checkAchievements() {
    const newly = [];
    const now = new Date().toISOString();
    for (const a of ALL_ACHIEVEMENTS) {
      if (!this.achievements[a.id] && a.check(this)) {
        this.achievements[a.id] = now;
        newly.push(a);
      }
    }
    if (newly.length) this.dirty = true;
    return newly;
  }

  applySnapshot(remote) {
    this.commits = remote.commits;
    this.cps = remote.cps;
    this.upgrades = remote.upgrades || {};
    this.securityUpgrades = remote.security || {};
    // Backward-compat: older saves stored achievements as an array of ids.
    if (Array.isArray(remote.achievements)) {
      const now = new Date().toISOString();
      this.achievements = {};
      for (const id of remote.achievements) this.achievements[id] = now;
    } else {
      this.achievements = remote.achievements || {};
    }
    this.defense = remote.defense ?? 10;
    this.hack_count_against = remote.hack_count_against ?? 0;
    this.accountCreatedAt = remote.created_at || this.accountCreatedAt;
  }

  toPatch() {
    return {
      commits: Math.floor(this.commits),
      cps: Math.floor(this.cps),
      upgrades: this.upgrades,
      security: this.securityUpgrades,
      achievements: this.achievements,
      defense: Math.floor(this.defense),
    };
  }
}
