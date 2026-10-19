# SkillPilot RBAC — Multi-Department Database Access Control

A runnable full-stack starter project for the SkillPilot task: **design role-based access control for a multi-department database and implement users/roles**.

## Features

- Responsive HTML/CSS/JavaScript dashboard
- Node.js + Express backend and MySQL database
- Departments: Sales, Human Resources, IT, Finance
- Roles: Admin, Manager, Employee, HR Officer
- Password hashing with bcrypt
- Server-side authorization middleware
- Department-scoped user listing for non-admin accounts
- Role/privilege matrix
- Admin-only user creation and audit log
- Session-based login/logout
- Database health check

## Requirements

- Node.js 18 or later
- MySQL 8.0 or later
- npm

## Setup (Windows)

1. Install Node.js and MySQL Server. Start the MySQL service.
2. Open a terminal in this project folder.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Copy `.env.example` to `.env` and set your MySQL details. In PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

5. Import the schema. You can use MySQL Workbench (open `database/schema.sql` and execute it) or terminal:

   ```bash
   mysql -u root -p < database/schema.sql
   ```

   The SQL creates `skillpilot_rbac`, its tables, seed departments/roles, example privilege rows, and a restricted `rbac_app` account. Change the sample database password in `database/schema.sql` before executing it, and use the same value in `.env`.

6. Create your administrator account. Use a strong password of at least 8 characters:

   ```bash
   node scripts/create-admin.js "Project Admin" admin@example.com "StrongPassword123"
   ```

   This command hashes the password before saving it. Do not use the sample password in a real deployment.

7. Start the app:

   ```bash
   npm start
   ```

8. Open **http://localhost:3000** in your browser and sign in with the admin email/password you created.

## Test the role restrictions

1. Sign in as Admin. Open Users and add a test user with a different department and role.
2. Sign out and sign in as that user.
3. A non-admin can only see users from their own department. The API denies admin-only routes such as `/api/audit` and user creation.
4. Open Permissions to review the role-privilege matrix.
5. Check `/api/health` to confirm that the server can connect to MySQL.

## Project structure

```text
skillpilot-rbac-project/
├── database/
│   └── schema.sql
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── scripts/
│   └── create-admin.js
├── .env.example
├── .gitignore
├── package.json
├── server.js
└── README.md
```

## Role-privilege matrix

| Resource | Admin | Manager | Employee | HR Officer |
|---|---|---|---|---|
| Users | Read/Create/Update/Delete | Read/Create/Update in own department | Read in own department | Read/Create/Update in own department |
| Departments | Full access in matrix | Read | Read | Read |
| Role permissions | Full access in matrix | No app route to edit | No app route to edit | No app route to edit |
| Audit logs | Read | No access | No access | No access |

The UI's permissions table reflects the seeded `role_permissions` data. The live application enforces the route restrictions described above.

## Security notes

- This is an educational/local demonstration, not a production-ready identity platform.
- Change all example secrets and passwords.
- For deployment, use HTTPS and set session cookies to `secure: true`; configure a persistent session store rather than Express's in-memory store.
- Add CSRF protection, login rate limiting, password reset/rotation, monitoring, and backups before production use.
- For strict database-enforced row-level isolation, expose carefully filtered SQL views and grant each database role access only to its views. MySQL table grants alone do not provide automatic department row-level security.
- The demo creates optional MySQL-native roles to illustrate `CREATE ROLE`/`GRANT`; application roles are separately stored and checked by the Express server.

## Troubleshooting

- **Database not connected:** verify MySQL is running and `.env` has the correct credentials/database.
- **Access denied for `rbac_app`:** ensure the account password in `database/schema.sql` matches `.env`; re-run the relevant `ALTER USER`/`GRANT` as a MySQL administrator if needed.
- **Cannot create admin:** ensure schema has been imported first and the email is not already in use.
- **Port in use:** change `PORT` in `.env`.
