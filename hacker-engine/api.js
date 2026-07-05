async function apiCreateHacker(username) {
  const res = await fetch(`${API_BASE}/hackers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create hacker");
  return data;
}

async function apiGetHacker(username) {
  const res = await fetch(`${API_BASE}/hackers/${encodeURIComponent(username)}`);
  if (res.status === 404) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch hacker");
  return data;
}

async function apiUpdateHacker(username, patch) {
  const res = await fetch(`${API_BASE}/hackers/${encodeURIComponent(username)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to update hacker");
  return data;
}

async function apiHackerLeaderboard(limit = 20) {
  const res = await fetch(`${API_BASE}/hackers?limit=${limit}`);
  return res.json();
}

async function apiTargetList(limit = 20) {
  const res = await fetch(`${API_BASE}/accounts?limit=${limit}`);
  return res.json();
}

async function apiAttemptHack(hacker, target, puzzleBonus) {
  const res = await fetch(`${API_BASE}/hack`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hacker, target, puzzleBonus }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Hack attempt failed");
  return data;
}
