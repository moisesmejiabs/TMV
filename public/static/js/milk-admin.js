const rowsElement = document.getElementById("registrationRows");
const countElement = document.getElementById("registrationCount");
const messageElement = document.getElementById("adminMessage");
const searchInput = document.getElementById("searchInput");
const formulaFilter = document.getElementById("formulaFilter");
const csvDownload = document.getElementById("csvDownload");

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function currentParams() {
  const params = new URLSearchParams();
  if (searchInput.value.trim()) params.set("q", searchInput.value.trim());
  if (formulaFilter.value) params.set("formula", formulaFilter.value);
  return params;
}

async function api(path) {
  const response = await fetch(path, { credentials: "include" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || "No se pudieron cargar los registros.");
    error.status = response.status;
    throw error;
  }
  return body;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || "") :
    new Intl.DateTimeFormat("es-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function renderRows(registrations) {
  if (!registrations.length) {
    rowsElement.innerHTML = '<tr><td colspan="8">No hay registros que coincidan.</td></tr>';
    return;
  }
  rowsElement.innerHTML = registrations.map((item) => `
    <tr>
      <td>${escapeHtml(formatDate(item.created_at))}</td>
      <td>${escapeHtml(item.full_name)}</td>
      <td><a href="tel:${escapeHtml(item.phone)}">${escapeHtml(item.phone)}</a></td>
      <td>${escapeHtml(item.baby_name)}</td>
      <td>${escapeHtml(item.baby_age_months)} meses</td>
      <td>${escapeHtml(item.formula_type)}${item.formula_other ? `<small>${escapeHtml(item.formula_other)}</small>` : ""}</td>
      <td>${escapeHtml(item.registered_by_name)}<small>${escapeHtml(item.registered_by_email)}</small></td>
      <td>${escapeHtml(item.id)}</td>
    </tr>`).join("");
}

async function loadRegistrations() {
  messageElement.hidden = true;
  const params = currentParams();
  const suffix = params.toString() ? `?${params}` : "";
  csvDownload.href = `/api/admin/milk-registrations.csv${suffix}`;
  try {
    const result = await api(`/api/admin/milk-registrations${suffix}`);
    countElement.textContent = Number(result.total || 0).toLocaleString("es-US");
    renderRows(result.registrations || []);
  } catch (error) {
    if (error.status === 401) return location.replace(`/login.html?next=${encodeURIComponent("/admin-milk-registrations")}`);
    if (error.status === 403) return location.replace("/");
    messageElement.textContent = error.message;
    messageElement.hidden = false;
  }
}

document.getElementById("filterForm").addEventListener("submit", (event) => { event.preventDefault(); loadRegistrations(); });
document.getElementById("clearFilters").addEventListener("click", () => { searchInput.value = ""; formulaFilter.value = ""; loadRegistrations(); });
document.getElementById("refreshButton").addEventListener("click", loadRegistrations);
document.getElementById("logoutButton").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  location.replace("/login.html");
});
loadRegistrations();
