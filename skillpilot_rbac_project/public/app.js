const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let currentUser = null;
const panels = ["dashboard", "users", "permissions", "audit"];

function message(el, text, type = "error") {
  el.textContent = text;
  el.className = `message ${type}`;
  el.classList.remove("hidden");
}
function clearMessage(el) { el.classList.add("hidden"); el.textContent = ""; }
async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function showSignedIn(user) {
  currentUser = user;
  $("#login-view").classList.add("hidden");
  $("#content-view").classList.remove("hidden");
  $("#profile").innerHTML = `<div class="avatar">${escapeHtml(user.name.charAt(0).toUpperCase())}</div><div><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.role)} · ${escapeHtml(user.department)}</small></div><button id="logout-btn" class="button ghost">Sign out</button>`;
  $("#logout-btn").addEventListener("click", logout);
  $$(".admin-only").forEach(el => el.classList.toggle("hidden", user.role !== "Admin"));
  navigate("dashboard");
}
function showSignedOut() {
  currentUser = null;
  $("#login-view").classList.remove("hidden");
  $("#content-view").classList.add("hidden");
  $("#profile").innerHTML = '<div class="avatar">?</div><div><strong>Not signed in</strong><small>Sign in to continue</small></div>';
}
function navigate(view) {
  if (!panels.includes(view)) view = "dashboard";
  if (view === "audit" && currentUser?.role !== "Admin") view = "dashboard";
  $$(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.view === view));
  panels.forEach(p => $(`#${p}-panel`).classList.toggle("hidden", p !== view));
  $("#page-title").textContent = ({dashboard:"Dashboard",users:"Users & Roles",permissions:"Permission Matrix",audit:"Audit Logs"})[view];
  if (view === "dashboard") loadDashboard();
  if (view === "users") loadUsers();
  if (view === "permissions") loadPermissions();
  if (view === "audit") loadAudit();
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
}
async function loadDashboard() {
  try {
    const { stats } = await api("/api/dashboard");
    $("#stat-departments").textContent = stats.departments;
    $("#stat-roles").textContent = stats.roles;
    $("#stat-users").textContent = stats.users;
  } catch (e) { notify(e.message, "error"); }
}
async function loadUsers() {
  const body = $("#users-body");
  body.innerHTML = '<tr><td colspan="4">Loading users…</td></tr>';
  try {
    const { users } = await api("/api/users");
    body.innerHTML = users.length ? users.map(u => `<tr>
      <td><div class="user-cell"><span class="user-dot">${escapeHtml(u.name.charAt(0).toUpperCase())}</span><div><strong>${escapeHtml(u.name)}</strong><small>${escapeHtml(u.email)}</small></div></div></td>
      <td>${escapeHtml(u.department)}</td><td><span class="role-badge">${escapeHtml(u.role)}</span></td>
      <td><span class="${u.active ? "active-badge" : "inactive-badge"}">${u.active ? "Active" : "Inactive"}</span></td></tr>`).join("") : '<tr><td colspan="4">No users found.</td></tr>';
    if (currentUser.role === "Admin") await loadMetadata();
  } catch (e) { body.innerHTML = `<tr><td colspan="4">${escapeHtml(e.message)}</td></tr>`; }
}
async function loadMetadata() {
  try {
    const { departments, roles } = await api("/api/metadata");
    $("#new-department").innerHTML = departments.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join("");
    $("#new-role").innerHTML = roles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join("");
  } catch (e) { notify(e.message, "error"); }
}
async function loadPermissions() {
  const body = $("#permissions-body");
  try {
    const { permissions } = await api("/api/permissions");
    body.innerHTML = permissions.map(p => `<tr><td>${escapeHtml(p.role)}</td><td>${escapeHtml(p.resource.replaceAll("_"," "))}</td>${["can_read","can_create","can_update","can_delete"].map(k => `<td><span class="permission ${p[k] ? "yes" : "no"}">${p[k] ? "✓" : "—"}</span></td>`).join("")}</tr>`).join("") || '<tr><td colspan="6">No permission records found.</td></tr>';
  } catch (e) { body.innerHTML = `<tr><td colspan="6">${escapeHtml(e.message)}</td></tr>`; }
}
async function loadAudit() {
  try {
    const { logs } = await api("/api/audit");
    $("#audit-body").innerHTML = logs.length ? logs.map(l => `<tr><td>${escapeHtml(new Date(l.created_at).toLocaleString())}</td><td>${escapeHtml(l.user_name)}</td><td><span class="role-badge">${escapeHtml(l.action)}</span></td><td>${escapeHtml(l.detail)}</td></tr>`).join("") : '<tr><td colspan="4">No audit events yet.</td></tr>';
  } catch (e) { $("#audit-body").innerHTML = `<tr><td colspan="4">${escapeHtml(e.message)}</td></tr>`; }
}
function notify(text, type) {
  const el = $("#notice");
  message(el, text, type);
  setTimeout(() => el.classList.add("hidden"), 4500);
}
async function logout() {
  try { await api("/api/logout", { method: "POST" }); } catch {}
  showSignedOut();
}
$$("[data-view]").forEach(el => el.addEventListener("click", () => navigate(el.dataset.view)));
$("#login-form").addEventListener("submit", async e => {
  e.preventDefault();
  const error = $("#login-error");
  clearMessage(error);
  const button = e.currentTarget.querySelector("button[type=submit]");
  button.disabled = true; button.textContent = "Signing in…";
  try {
    const data = await api("/api/login", { method: "POST", body: JSON.stringify({ email: $("#email").value, password: $("#password").value }) });
    showSignedIn(data.user);
  } catch (err) { message(error, err.message); }
  finally { button.disabled = false; button.innerHTML = 'Sign in <span>→</span>'; }
});
$("#add-user-btn").addEventListener("click", () => {
  $("#user-form-card").classList.remove("hidden");
  $("#user-form-card").scrollIntoView({ behavior: "smooth", block: "start" });
});
$("#cancel-user").addEventListener("click", () => $("#user-form-card").classList.add("hidden"));
$("#user-form").addEventListener("submit", async e => {
  e.preventDefault();
  const msg = $("#user-form-message"); clearMessage(msg);
  const body = {
    name: $("#new-name").value, email: $("#new-email").value, password: $("#new-password").value,
    departmentId: $("#new-department").value, roleId: $("#new-role").value
  };
  try {
    await api("/api/users", { method: "POST", body: JSON.stringify(body) });
    message(msg, "User account created successfully.", "success");
    e.currentTarget.reset();
    await loadUsers();
  } catch (err) { message(msg, err.message, "error"); }
});
$("#today").textContent = new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
(async function init() {
  try {
    const { user } = await api("/api/me");
    if (user) showSignedIn(user); else showSignedOut();
  } catch { showSignedOut(); }
})();
