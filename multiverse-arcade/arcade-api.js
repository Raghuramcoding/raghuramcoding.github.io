/* Multiverse Arcade — backend API client + offline mode support.
   Three modes (see ModeAPI below):
   - multiplayer: everything goes through the FastAPI backend (login required)
   - singleplayer / coop: fully offline, no backend calls at all — tokens and
     the shop are tracked entirely in localStorage. */
(function () {
  // ⚠️ Set this to your deployed Render URL once live, e.g.
  // "https://multiverse-arcade-backend.onrender.com"
  const ARCADE_API_BASE = window.ARCADE_API_BASE || "http://localhost:8710";

  const TOKEN_KEY = "ma_jwt";
  const GUEST_TOKENS_KEY = "ma_arcade_tokens";     // local token balance (guest + singleplayer + coop)
  const LOCAL_OWNED_KEY = "ma_local_owned_tags";   // JSON array of owned tag keys
  const LOCAL_EQUIPPED_KEY = "ma_local_equipped_tag";
  const MODE_KEY = "ma_mode";                      // 'multiplayer' | 'singleplayer' | 'coop'

  // Mirrors the backend's seeded shop (see arcade-backend/app/seed.py) so the
  // offline modes have the exact same items without needing the server.
  const LOCAL_TAGS = [
    { key: "bronze_coder", name: "[BRONZE CODER]", description: "A humble cosmetic title.", price: 50, kind: "cosmetic", color: "#cd7f32", effect_hp_bonus: 0, effect_atk_bonus: 0, effect_speed_pct: 0, effect_cps_pct: 0 },
    { key: "silver_racer", name: "[SILVER RACER]", description: "Cosmetic title for the road-worn.", price: 150, kind: "cosmetic", color: "#c0c0c0", effect_hp_bonus: 0, effect_atk_bonus: 0, effect_speed_pct: 0, effect_cps_pct: 0 },
    { key: "gold_legend", name: "[GOLD LEGEND]", description: "Cosmetic title, pure flex.", price: 400, kind: "cosmetic", color: "#ffd700", effect_hp_bonus: 0, effect_atk_bonus: 0, effect_speed_pct: 0, effect_cps_pct: 0 },
    { key: "iron_will", name: "[IRON WILL]", description: "+20 Max HP and +5 ATK in Voyage World.", price: 200, kind: "functional", color: "#8899aa", effect_hp_bonus: 20, effect_atk_bonus: 5, effect_speed_pct: 0, effect_cps_pct: 0 },
    { key: "nitro_core", name: "[NITRO CORE]", description: "+8% top speed in Horizon Rush.", price: 250, kind: "functional", color: "#ff4d4d", effect_hp_bonus: 0, effect_atk_bonus: 0, effect_speed_pct: 8, effect_cps_pct: 0 },
    { key: "autopilot", name: "[AUTOPILOT]", description: "+10% commits/sec in Commit Engine.", price: 250, kind: "functional", color: "#22d3ee", effect_hp_bonus: 0, effect_atk_bonus: 0, effect_speed_pct: 0, effect_cps_pct: 10 },
    { key: "arcade_champion", name: "[ARCADE CHAMPION]", description: "Cosmetic + a little of everything: +10 HP, +5% speed, +5% cps.", price: 750, kind: "both", color: "#a855f7", effect_hp_bonus: 10, effect_atk_bonus: 0, effect_speed_pct: 5, effect_cps_pct: 5 },
  ];

  // ── MODE ──────────────────────────────────────────────────────────
  function getMode() { return localStorage.getItem(MODE_KEY) || null; }
  function setMode(m) { localStorage.setItem(MODE_KEY, m); }
  function isOffline() { const m = getMode(); return m === "singleplayer" || m === "coop"; }

  // ── AUTH (multiplayer only) ───────────────────────────────────────
  function getJwt() { return localStorage.getItem(TOKEN_KEY); }
  function setJwt(t) { localStorage.setItem(TOKEN_KEY, t); }
  function clearJwt() { localStorage.removeItem(TOKEN_KEY); }
  function isLoggedIn() { return !!getJwt(); }

  async function api(path, opts = {}) {
    const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    const jwt = getJwt();
    if (jwt) headers["Authorization"] = "Bearer " + jwt;
    const res = await fetch(ARCADE_API_BASE + path, Object.assign({}, opts, { headers }));
    if (!res.ok) {
      let detail = res.statusText;
      try { detail = (await res.json()).detail || detail; } catch (e) {}
      throw new Error(detail);
    }
    return res.json();
  }

  async function register(username, password) {
    const r = await api("/auth/register", { method: "POST", body: JSON.stringify({ username, password }) });
    setJwt(r.access_token);
    return r;
  }
  async function login(username, password) {
    const r = await api("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
    setJwt(r.access_token);
    return r;
  }
  function logout() { clearJwt(); }
  async function me() { return api("/me"); }

  // ── LOCAL (offline) TOKEN + SHOP STATE ─────────────────────────────
  function localGetTokens() { return parseInt(localStorage.getItem(GUEST_TOKENS_KEY) || "0", 10) || 0; }
  function localAddTokens(n) {
    n = Math.floor(n); if (n <= 0) return localGetTokens();
    const v = localGetTokens() + n; localStorage.setItem(GUEST_TOKENS_KEY, String(v)); return v;
  }
  function localSpendTokens(n) {
    const v = localGetTokens(); if (v < n) return false;
    localStorage.setItem(GUEST_TOKENS_KEY, String(v - n)); return true;
  }
  function localGetOwned() { try { return JSON.parse(localStorage.getItem(LOCAL_OWNED_KEY) || "[]"); } catch (e) { return []; } }
  function localSetOwned(arr) { localStorage.setItem(LOCAL_OWNED_KEY, JSON.stringify(arr)); }
  function localGetEquipped() { return localStorage.getItem(LOCAL_EQUIPPED_KEY) || null; }
  function localSetEquipped(key) { if (key) localStorage.setItem(LOCAL_EQUIPPED_KEY, key); else localStorage.removeItem(LOCAL_EQUIPPED_KEY); }

  function localMePayload() {
    return { username: "you (offline)", tokens: localGetTokens(), equipped_tag: localGetEquipped(), owned_tags: localGetOwned() };
  }
  function localShopList() {
    const owned = new Set(localGetOwned());
    const equipped = localGetEquipped();
    return LOCAL_TAGS.map(t => Object.assign({}, t, { owned: owned.has(t.key), equipped: equipped === t.key }));
  }
  function localBuyTag(tagKey) {
    const tag = LOCAL_TAGS.find(t => t.key === tagKey);
    if (!tag) throw new Error("Tag not found");
    const owned = localGetOwned();
    if (owned.includes(tagKey)) throw new Error("Already owned");
    if (!localSpendTokens(tag.price)) throw new Error("Not enough tokens");
    owned.push(tagKey); localSetOwned(owned);
    return localMePayload();
  }
  function localEquipTag(tagKey) {
    if (tagKey === null) { localSetEquipped(null); return localMePayload(); }
    const owned = localGetOwned();
    if (!owned.includes(tagKey)) throw new Error("You don't own this tag");
    localSetEquipped(tagKey);
    return localMePayload();
  }

  // ── UNIFIED API: routes to backend (multiplayer) or local (singleplayer/coop) ──
  async function addTokens(amount, source) {
    if (isOffline() || !isLoggedIn()) { localAddTokens(amount); return { tokens: localGetTokens(), local: true }; }
    return api("/tokens/add", { method: "POST", body: JSON.stringify({ amount: Math.floor(amount), source: source || "unknown" }) });
  }
  async function getTokens() {
    if (isOffline() || !isLoggedIn()) return localGetTokens();
    try { return (await me()).tokens; } catch (e) { return localGetTokens(); }
  }
  async function getShop() {
    if (isOffline() || !isLoggedIn()) return localShopList();
    return api("/shop");
  }
  async function buyTag(tagKey) {
    if (isOffline() || !isLoggedIn()) return localBuyTag(tagKey);
    return api("/shop/buy", { method: "POST", body: JSON.stringify({ tag_key: tagKey }) });
  }
  async function equipTag(tagKey) {
    if (isOffline() || !isLoggedIn()) return localEquipTag(tagKey);
    return api("/shop/equip", { method: "POST", body: JSON.stringify({ tag_key: tagKey }) });
  }
  async function leaderboard() {
    if (isOffline()) return [];
    return api("/leaderboard");
  }

  // Returns the effect fields of the currently equipped tag (or all-zero if none).
  async function getEquippedEffects() {
    const zero = { effect_hp_bonus: 0, effect_atk_bonus: 0, effect_speed_pct: 0, effect_cps_pct: 0, name: null };
    try {
      if (isOffline() || !isLoggedIn()) {
        const key = localGetEquipped();
        if (!key) return zero;
        return LOCAL_TAGS.find(t => t.key === key) || zero;
      }
      const info = await me();
      if (!info.equipped_tag) return zero;
      const shop = await getShop();
      return shop.find(t => t.key === info.equipped_tag) || zero;
    } catch (e) { return zero; }
  }

  async function getMe() {
    if (isOffline() || !isLoggedIn()) return localMePayload();
    return me();
  }

  window.ArcadeAPI = {
    isLoggedIn, register, login, logout, me, getMe,
    addTokens, getTokens, getShop, buyTag, equipTag, leaderboard, getEquippedEffects,
    BASE: ARCADE_API_BASE,
  };
  window.ModeAPI = { getMode, setMode, isOffline };
})();
