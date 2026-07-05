async function apiCreateAccount(username) {
  const res = await fetch(`${API_BASE}/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create account");
  return data;
}

async function apiGetAccount(username) {
  const res = await fetch(`${API_BASE}/accounts/${encodeURIComponent(username)}`);
  if (res.status === 404) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch account");
  return data;
}

async function apiUpdateAccount(username, patch) {
  const res = await fetch(`${API_BASE}/accounts/${encodeURIComponent(username)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to update account");
  return data;
}

async function apiLeaderboard(limit = 20) {
  const res = await fetch(`${API_BASE}/accounts?limit=${limit}`);
  return res.json();
}

async function apiHackLog(username) {
  const res = await fetch(`${API_BASE}/hack/log/${encodeURIComponent(username)}`);
  if (!res.ok) return [];
  return res.json();
}
