# Multiverse Arcade — Frontend

Static site, ready for GitHub Pages. Drop this folder into your Pages repo as-is.

- `index.html` — Voyage World hub. Explore to find portals; red/teal portals
  open Horizon Rush / Commit Engine in a new tab. Login, Arcade Tokens
  balance, and the Shop (buy/equip tags) all live in the top-left HUD.
- `horizon-rush/` — full 3D racer, untouched engine + a small badge overlay.
- `commit-engine.html` — full idle clicker, untouched core + token sync.
- `arcade-api.js` — shared client all three pages use to talk to the backend
  (see `/arcade-backend`). Falls back to local-only "guest mode" if a player
  isn't logged in or the backend is unreachable.

## Before you deploy: point it at your live backend

`arcade-api.js` defaults to `http://localhost:8710` for local testing. Once
your backend is live on Render, open `arcade-api.js` and change:

```js
const ARCADE_API_BASE = window.ARCADE_API_BASE || "http://localhost:8710";
```

to your Render URL, e.g. `"https://multiverse-arcade-backend.onrender.com"`.
That's the only edit needed — all three pages read from this one file.

## Local testing

```
python3 -m http.server 8941
```
then open `http://localhost:8941/index.html` (run the backend locally too,
see `/arcade-backend/README.md`, for login/shop to work — otherwise the
games still run fine in guest mode, just without persistence).
