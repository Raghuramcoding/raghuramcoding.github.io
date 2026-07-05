const UPGRADES = [
  { id: "linter", name: "Autolinter", desc: "+1 commit/sec", baseCost: 15, cpsGain: 1 },
  { id: "intern", name: "Hire an Intern", desc: "+5 commits/sec", baseCost: 100, cpsGain: 5 },
  { id: "cicd", name: "CI/CD Pipeline", desc: "+20 commits/sec", baseCost: 600, cpsGain: 20 },
  { id: "monorepo", name: "Monorepo Migration", desc: "+90 commits/sec", baseCost: 3500, cpsGain: 90 },
  { id: "aiagent", name: "AI Coding Agent", desc: "+400 commits/sec", baseCost: 20000, cpsGain: 400 },
  { id: "datacenter", name: "Dedicated Datacenter", desc: "+2000 commits/sec", baseCost: 120000, cpsGain: 2000 },
];

const ACHIEVEMENTS = [
  { id: "first_commit", name: "Hello World", check: (s) => s.commits >= 1 },
  { id: "hundred", name: "Century", check: (s) => s.commits >= 100 },
  { id: "thousand", name: "Kilocommit", check: (s) => s.commits >= 1000 },
  { id: "million", name: "Unicorn Repo", check: (s) => s.commits >= 1000000 },
  { id: "first_upgrade", name: "Tooling Up", check: (s) => Object.keys(s.upgrades).length >= 1 },
  { id: "all_upgrades", name: "Fully Automated", check: (s) => Object.keys(s.upgrades).length >= UPGRADES.length },
  { id: "survivor", name: "Breach Survivor", check: (s) => s.hack_count_against >= 1 },
  { id: "fortress", name: "Fort Knox", check: (s) => s.defense >= 50 },
];

function upgradeCost(upgrade, ownedCount) {
  return Math.floor(upgrade.baseCost * Math.pow(1.15, ownedCount));
}

class GameState {
  constructor() {
    this.username = null;
    this.commits = 0;
    this.cps = 0;
    this.upgrades = {}; // { id: count }
    this.achievements = [];
    this.defense = 10;
    this.hack_count_against = 0;
    this.dirty = false;
  }

  clickCommit() {
    this.commits += 1;
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
    this.defense += 1; // every upgrade slightly hardens your defense
    this.dirty = true;
    return true;
  }

  checkAchievements() {
    const newly = [];
    for (const a of ACHIEVEMENTS) {
      if (!this.achievements.includes(a.id) && a.check(this)) {
        this.achievements.push(a.id);
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
    this.achievements = remote.achievements || [];
    this.defense = remote.defense ?? 10;
    this.hack_count_against = remote.hack_count_against ?? 0;
  }

  toPatch() {
    return {
      commits: Math.floor(this.commits),
      cps: Math.floor(this.cps),
      upgrades: this.upgrades,
      achievements: this.achievements,
      defense: Math.floor(this.defense),
    };
  }
}
