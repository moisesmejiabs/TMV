const rowsElement = document.getElementById("registrationRows");
const countElement = document.getElementById("registrationCount");
const messageElement = document.getElementById("adminMessage");
const searchInput = document.getElementById("searchInput");
const formulaFilter = document.getElementById("formulaFilter");
const csvDownload = document.getElementById("csvDownload");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function currentParams() {
  const params = new URLSearchParams();
  const query = searchInput.value.trim();
  const formula = formulaFilter.value;
  if (query) params.set("q", query);
  if (formula) params.set("formula", formula);
  return params;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    ...options
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || "No se pudieron cargar los registros.");
    error.status = response.status;
    throw error;
  }
  return body;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("es-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function renderRows(registrations) {
  if (!registrations.length) {
    rowsElement.innerHTML =
      '<tr><td colspan="9" class="empty">No hay registros que coincidan con estos filtros.</td></tr>';
    return;
  }

  rowsElement.innerHTML = registrations.map((item) => {
    const formulaDetail = item.formula_type === "Otra fórmula" && item.formula_other
      ? `<span class="milk-admin-subtle">${escapeHtml(item.formula_other)}</span>`
      : "";
    return `
      <tr>
        <td>${escapeHtml(formatDate(item.created_at))}</td>
        <td><span class="milk-admin-person">${escapeHtml(item.full_name)}</span></td>
        <td><a href="tel:${escapeHtml(item.phone)}">${escapeHtml(item.phone)}</a></td>
        <td><span class="milk-admin-person">${escapeHtml(item.baby_name)}</span></td>
        <td>${escapeHtml(item.baby_age_months)} meses</td>
        <td>
          <span class="milk-admin-formula">${escapeHtml(item.formula_type)}</span>
          ${formulaDetail}
        </td>
        <td>
          ${escapeHtml(item.registered_by_name)}
          <span class="milk-admin-subtle">${escapeHtml(item.registered_by_email)}</span>
        </td>
        <td>${escapeHtml(item.id)}</td>
        <td>
          <button
            type="button"
            class="milk-admin-delete"
            data-registration-id="${escapeHtml(item.id)}"
            data-registration-name="${escapeHtml(item.full_name)}">
            Eliminar
          </button>
        </td>
      </tr>
    `;
  }).join("");

  rowsElement.querySelectorAll(".milk-admin-delete").forEach((button) => {
    button.addEventListener("click", async () => {
      const registrationId = button.dataset.registrationId;
      const registrationName = button.dataset.registrationName || `ID ${registrationId}`;
      const confirmed = window.confirm(
        `¿Eliminar permanentemente el registro de ${registrationName}?\n\nEsto elimina solamente este registro de entrega de leche. No elimina la cuenta de usuario.`
      );
      if (!confirmed) return;

      button.disabled = true;
      messageElement.hidden = true;
      try {
        await api(`/api/admin/milk-registrations/${encodeURIComponent(registrationId)}`, {
          method: "DELETE"
        });
        await loadRegistrations();
      } catch (error) {
        button.disabled = false;
        if (error.status === 401) {
          location.replace(`/login.html?next=${encodeURIComponent("/admin-milk-registrations")}`);
          return;
        }
        if (error.status === 403) {
          location.replace("/");
          return;
        }
        messageElement.textContent = "No se pudo eliminar el registro.";
        messageElement.hidden = false;
      }
    });
  });
}

async function loadRegistrations() {
  messageElement.hidden = true;
  rowsElement.innerHTML = '<tr><td colspan="9" class="empty">Cargando registros…</td></tr>';

  const params = currentParams();
  const suffix = params.toString() ? `?${params}` : "";
  csvDownload.href = `/api/admin/milk-registrations.csv${suffix}`;

  try {
    const result = await api(`/api/admin/milk-registrations${suffix}`);
    countElement.textContent = result.total.toLocaleString("es-US");
    renderRows(result.registrations || []);
    if (result.limited) {
      messageElement.textContent =
        "La pantalla muestra los 1,000 registros más recientes. El archivo CSV incluye todos.";
      messageElement.hidden = false;
    }
  } catch (error) {
    if (error.status === 401) {
      location.replace(`/login.html?next=${encodeURIComponent("/admin-milk-registrations")}`);
      return;
    }
    if (error.status === 403) {
      location.replace("/");
      return;
    }
    messageElement.textContent = error.message;
    messageElement.hidden = false;
    rowsElement.innerHTML =
      '<tr><td colspan="9" class="empty">No se pudieron cargar los datos.</td></tr>';
  }
}

document.getElementById("filterForm").addEventListener("submit", (event) => {
  event.preventDefault();
  loadRegistrations();
});

document.getElementById("clearFilters").addEventListener("click", () => {
  searchInput.value = "";
  formulaFilter.value = "";
  loadRegistrations();
});

document.getElementById("refreshButton").addEventListener("click", loadRegistrations);

document.getElementById("logoutButton").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  location.replace("/login.html");
});

loadRegistrations();
