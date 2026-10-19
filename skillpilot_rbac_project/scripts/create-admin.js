// Create the initial admin login after importing database/schema.sql.
// Usage: node scripts/create-admin.js "Admin Name" admin@example.com "StrongPassword123"
require("dotenv").config();
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");

(async () => {
  const [name, email, password] = process.argv.slice(2);
  if (!name || !email || !password || password.length < 8) {
    console.error('Usage: node scripts/create-admin.js "Admin Name" admin@example.com "Password8+"');
    process.exit(1);
  }
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "skillpilot_rbac"
  });
  try {
    const [[department]] = await db.execute("SELECT id FROM departments WHERE name='IT' LIMIT 1");
    const [[role]] = await db.execute("SELECT id FROM roles WHERE name='Admin' LIMIT 1");
    const hash = await bcrypt.hash(password, 12);
    await db.execute(
      "INSERT INTO users (name,email,password_hash,department_id,role_id) VALUES (?,?,?,?,?)",
      [name, email.toLowerCase(), hash, department.id, role.id]
    );
    console.log(`Admin created: ${email}`);
  } catch (err) {
    console.error("Could not create admin:", err.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
