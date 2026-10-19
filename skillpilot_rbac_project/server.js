require("dotenv").config();
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const path = require("path");
const mysql = require("mysql2/promise");

const app = express();
const PORT = Number(process.env.PORT || 3000);

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "skillpilot_rbac",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(session({
  name: "skillpilot.sid",
  secret: process.env.SESSION_SECRET || "development-only-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: false, maxAge: 1000 * 60 * 60 * 2 }
}));
app.use(express.static(path.join(__dirname, "public")));

async function audit(userId, action, detail = "") {
  try {
    await pool.execute(
      "INSERT INTO audit_logs (user_id, action, detail) VALUES (?, ?, ?)",
      [userId || null, action, detail]
    );
  } catch (e) {
    console.error("Audit log failed:", e.message);
  }
}
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Please log in first." });
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: "Please log in first." });
    if (!roles.includes(req.session.user.role)) return res.status(403).json({ error: "Access denied for your role." });
    next();
  };
}
function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, department: user.department_name, role: user.role_name };
}

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "error", database: "not connected", hint: "Check .env and run database/schema.sql" });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.name, u.email, u.password_hash, d.name AS department_name,
              r.name AS role_name
       FROM users u JOIN departments d ON d.id = u.department_id
       JOIN roles r ON r.id = u.role_id WHERE u.email = ? AND u.is_active = 1 LIMIT 1`,
      [String(email).trim().toLowerCase()]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(String(password), user.password_hash))) {
      await audit(null, "LOGIN_FAILED", `email=${String(email).slice(0, 120)}`);
      return res.status(401).json({ error: "Invalid email or password." });
    }
    req.session.user = { id: user.id, name: user.name, email: user.email, department: user.department_name, role: user.role_name };
    await audit(user.id, "LOGIN_SUCCESS");
    res.json({ user: req.session.user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not log in. Check database setup." });
  }
});

app.post("/api/logout", requireAuth, async (req, res) => {
  await audit(req.session.user.id, "LOGOUT");
  req.session.destroy(() => res.json({ ok: true }));
});
app.get("/api/me", (req, res) => res.json({ user: req.session.user || null }));

app.get("/api/dashboard", requireAuth, async (req, res) => {
  try {
    const [departments] = await pool.query("SELECT COUNT(*) AS count FROM departments");
    const [roles] = await pool.query("SELECT COUNT(*) AS count FROM roles");
    let userCount;
    if (req.session.user.role === "Admin") {
      const [rows] = await pool.query("SELECT COUNT(*) AS count FROM users");
      userCount = rows[0].count;
    } else {
      const [rows] = await pool.execute(
        "SELECT COUNT(*) AS count FROM users WHERE department_id = (SELECT id FROM departments WHERE name = ?)",
        [req.session.user.department]
      );
      userCount = rows[0].count;
    }
    res.json({ stats: { departments: departments[0].count, roles: roles[0].count, users: userCount }, user: req.session.user });
  } catch (e) { console.error(e); res.status(500).json({ error: "Unable to load dashboard." }); }
});

app.get("/api/users", requireAuth, async (req, res) => {
  try {
    let sql = `SELECT u.id, u.name, u.email, u.is_active, d.name AS department_name, r.name AS role_name
               FROM users u JOIN departments d ON d.id=u.department_id JOIN roles r ON r.id=u.role_id`;
    let params = [];
    if (req.session.user.role !== "Admin") {
      sql += " WHERE d.name = ?";
      params.push(req.session.user.department);
    }
    sql += " ORDER BY u.id";
    const [rows] = await pool.execute(sql, params);
    res.json({ users: rows.map(u => ({ id: u.id, name: u.name, email: u.email, department: u.department_name, role: u.role_name, active: !!u.is_active })) });
  } catch (e) { console.error(e); res.status(500).json({ error: "Unable to load users." }); }
});

app.post("/api/users", requireRole("Admin"), async (req, res) => {
  const { name, email, password, departmentId, roleId } = req.body || {};
  if (!name || !email || !password || !departmentId || !roleId || String(password).length < 8) {
    return res.status(400).json({ error: "Complete all fields. Password must be at least 8 characters." });
  }
  try {
    const hash = await bcrypt.hash(String(password), 12);
    const [result] = await pool.execute(
      "INSERT INTO users (name,email,password_hash,department_id,role_id) VALUES (?,?,?,?,?)",
      [String(name).trim(), String(email).trim().toLowerCase(), hash, Number(departmentId), Number(roleId)]
    );
    await audit(req.session.user.id, "USER_CREATED", `new_user_id=${result.insertId}`);
    res.status(201).json({ ok: true, id: result.insertId });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "That email address is already registered." });
    if (e.code === "ER_NO_REFERENCED_ROW_2") return res.status(400).json({ error: "Choose a valid department and role." });
    console.error(e); res.status(500).json({ error: "Could not create user." });
  }
});

app.get("/api/metadata", requireAuth, async (req, res) => {
  try {
    const [departments] = await pool.query("SELECT id, name FROM departments ORDER BY name");
    const [roles] = await pool.query("SELECT id, name, description FROM roles ORDER BY id");
    res.json({ departments, roles });
  } catch (e) { console.error(e); res.status(500).json({ error: "Unable to load role data." }); }
});

app.get("/api/permissions", requireAuth, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.name AS role, p.resource, p.can_read, p.can_create, p.can_update, p.can_delete
       FROM role_permissions p JOIN roles r ON r.id=p.role_id ORDER BY r.id, p.resource`
    );
    res.json({ permissions: rows });
  } catch (e) { console.error(e); res.status(500).json({ error: "Unable to load permissions." }); }
});

app.get("/api/audit", requireRole("Admin"), async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.id, COALESCE(u.name,'System/Unknown') AS user_name, a.action, a.detail, a.created_at
       FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 50`
    );
    res.json({ logs: rows });
  } catch (e) { console.error(e); res.status(500).json({ error: "Unable to load audit logs." }); }
});

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`SkillPilot RBAC is running at http://localhost:${PORT}`));
