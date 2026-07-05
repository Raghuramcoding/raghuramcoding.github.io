const TOOLS = [
  { id: "portscanner", name: "Port Scanner", desc: "+2 power", baseCost: 20, powerGain: 2 },
  { id: "keylogger", name: "Keylogger Kit", desc: "+8 power", baseCost: 120, powerGain: 8 },
  { id: "botnet", name: "Botnet Rental", desc: "+30 power", baseCost: 700, powerGain: 30 },
  { id: "zeroday", name: "Zero-Day Exploit", desc: "+120 power", baseCost: 4000, powerGain: 120 },
  { id: "quantum", name: "Quantum Cracker", desc: "+500 power", baseCost: 25000, powerGain: 500 },
];

function toolCost(tool, owned) {
  return Math.floor(tool.baseCost * Math.pow(1.18, owned));
}

class HackerState {
  constructor() {
    this.username = null;
    this.power = 10;
    this.tools = {}; // { id: count }
    this.successful_hacks = 0;
    this.failed_hacks = 0;
    this.total_stolen = 0;
    this.dirty = false;
    this.credits = 0; // spendable currency earned from stolen commits (local-only, spent on tools)
  }

  buyTool(id) {
    const tool = TOOLS.find((t) => t.id === id);
    if (!tool) return false;
    const owned = this.tools[id] || 0;
    const cost = toolCost(tool, owned);
    if (this.credits < cost) return false;
    this.credits -= cost;
    this.tools[id] = owned + 1;
    this.power += tool.powerGain;
    this.dirty = true;
    return true;
  }

  applySnapshot(remote) {
    this.power = remote.power ?? 10;
    this.tools = remote.tools || {};
    this.successful_hacks = remote.successful_hacks ?? 0;
    this.failed_hacks = remote.failed_hacks ?? 0;
    this.total_stolen = remote.total_stolen ?? 0;
  }

  toPatch() {
    return {
      power: Math.floor(this.power),
      tools: this.tools,
    };
  }
}
