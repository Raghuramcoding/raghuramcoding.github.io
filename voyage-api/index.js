// ================================================================
//  VOYAGE.DEV — Reading List API
//  Node.js + Express + Postgres (Railway)
// ================================================================

const express  = require("express");
const cors     = require("cors");
const { Pool } = require("pg");

const app  = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// ---- MIDDLEWARE ----
app.use(cors());
app.use(express.json());

// Simple password check — set ADMIN_PASSWORD in Railway variables
function checkAuth(req, res, next) {
    const pw = req.headers["x-admin-password"];
    if (!pw || pw !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
}

// ---- SETUP TABLE on first run ----
async function initDb() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS books (
            id        SERIAL PRIMARY KEY,
            title     TEXT NOT NULL,
            author    TEXT,
            status    TEXT DEFAULT 'read',
            rating    INTEGER DEFAULT 0,
            notes     TEXT,
            added_at  TIMESTAMP DEFAULT NOW()
        )
    `);
    console.log("Database ready.");
}

// ---- ROUTES ----

// GET /books — public, returns all books newest first
app.get("/books", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM books ORDER BY added_at DESC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /books — admin only, add a book
app.post("/books", checkAuth, async (req, res) => {
    const { title, author, status, rating, notes } = req.body;
    if (!title) return res.status(400).json({ error: "Title is required" });
    try {
        const result = await pool.query(
            "INSERT INTO books (title, author, status, rating, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *",
            [title, author || "", status || "read", rating || 0, notes || ""]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /books/:id — admin only
app.delete("/books/:id", checkAuth, async (req, res) => {
    try {
        await pool.query("DELETE FROM books WHERE id = $1", [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---- START ----
const PORT = process.env.PORT || 3000;
initDb().then(() => {
    app.listen(PORT, () => console.log("Voyage API running on port " + PORT));
});
