(() => {
  "use strict";

  const messages = {
    en: {
      title: "Tu Mejor Versión — User Profile",
      requestFailed: "Request failed",
      profileUpdated: "Your profile was updated.",
      profileUpdateFailed: "Unable to update your profile.",
      loadingDocuments: "Loading agreement documents...",
      noActiveDocuments: "No agreement documents are currently active.",
      acceptedDocuments: "Accepted documents",
      noAcceptedDocuments: "No documents accepted yet.",
      pendingDocuments: "Pending documents",
      noPendingDocuments: "No pending documents.",
      by: "by",
      download: "Download",
      acknowledge: "Acknowledge",
      acknowledgeFailed: "Unable to acknowledge the document.",
      pendingNotice: "You have pending documents that must be acknowledged before you can continue using the site.",
      documentsFailed: "Unable to load agreement documents.",
      loadingEvents: "Loading your events...",
      noEvents: "No events are associated with your account.",
      eventsFailed: "Unable to load your events.",
      pageFailed: "Unable to load your profile.",
      noPhoto: "No photo selected",
      unknownUser: "Unknown"
    },
    es: {
      title: "Tu Mejor Versión — Perfil de usuario",
      requestFailed: "La solicitud falló",
      profileUpdated: "Su perfil se actualizó.",
      profileUpdateFailed: "No se pudo actualizar su perfil.",
      loadingDocuments: "Cargando los documentos de acuerdos...",
      noActiveDocuments: "Actualmente no hay documentos de acuerdos activos.",
      acceptedDocuments: "Documentos aceptados",
      noAcceptedDocuments: "Aún no ha aceptado ningún documento.",
      pendingDocuments: "Documentos pendientes",
      noPendingDocuments: "No hay documentos pendientes.",
      by: "por",
      download: "Descargar",
      acknowledge: "Aceptar",
      acknowledgeFailed: "No se pudo aceptar el documento.",
      pendingNotice: "Tiene documentos pendientes que debe aceptar antes de continuar usando el sitio.",
      documentsFailed: "No se pudieron cargar los documentos de acuerdos.",
      loadingEvents: "Cargando sus eventos...",
      noEvents: "No hay eventos asociados con su cuenta.",
      eventsFailed: "No se pudieron cargar sus eventos.",
      pageFailed: "No se pudo cargar su perfil.",
      noPhoto: "Ninguna foto seleccionada",
      unknownUser: "Desconocido"
    }
  };

  let agreementDocuments = null;
  let userEvents = null;
  let profileUser = null;
  let statusKey = "";
  let statusDetail = "";

  function language() {
    return localStorage.getItem("lang") === "es" ? "es" : "en";
  }

  function t(key) {
    return messages[language()][key] || messages.en[key] || key;
  }

  function setStatus(key, detail = "") {
    statusKey = key;
    statusDetail = detail;
    const status = document.getElementById("profile-status");
    if (status) status.textContent = key ? `${t(key)}${detail ? ` ${detail}` : ""}` : "";
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
      credentials: "include",
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {})
      },
      ...options
    });

    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : await response.text().catch(() => null);

    if (!response.ok) {
      const detail = body && typeof body === "object" ? body.error : body;
      throw new Error(detail || t("requestFailed"));
    }

    return body;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function safeDownloadUrl(value) {
    try {
      const url = new URL(String(value || ""), window.location.origin);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "#";
    } catch {
      return "#";
    }
  }

  function renderPhotoName() {
    const input = document.getElementById("photo");
    const output = document.getElementById("photo-name");
    if (!input || !output) return;
    output.textContent = input.files?.[0]?.name || t("noPhoto");
  }

  function renderAgreements() {
    const container = document.getElementById("pending-agreements");
    if (!container) return;

    if (agreementDocuments === null) {
      container.textContent = t("loadingDocuments");
      return;
    }

    if (!agreementDocuments.length) {
      container.innerHTML = `<p>${escapeHtml(t("noActiveDocuments"))}</p>`;
      return;
    }

    const pending = agreementDocuments.filter((doc) => !doc.acknowledged);
    const accepted = agreementDocuments.filter((doc) => doc.acknowledged);
    const documentItem = (doc, allowAcknowledge) => `
      <li style="margin-bottom: 10px;">
        ${escapeHtml(doc.title)} ${escapeHtml(t("by"))} ${escapeHtml(doc.author)}
        <a href="${escapeHtml(safeDownloadUrl(doc.download_url))}" target="_blank" rel="noopener noreferrer">
          ${escapeHtml(t("download"))}
        </a>
        ${allowAcknowledge
          ? `<button type="button" data-doc-id="${escapeHtml(doc.id)}" class="acknowledge-doc">${escapeHtml(t("acknowledge"))}</button>`
          : ""}
      </li>`;

    container.innerHTML = `
      ${new URLSearchParams(window.location.search).get("pending") === "1"
        ? `<div style="margin-bottom:16px;padding:12px;border:1px solid #d9534f;background:#f9e6e6;color:#a52824;">${escapeHtml(t("pendingNotice"))}</div>`
        : ""}
      <div style="margin-bottom: 18px;">
        <strong>${escapeHtml(t("acceptedDocuments"))}</strong>
        ${accepted.length
          ? `<ul>${accepted.map((doc) => documentItem(doc, false)).join("")}</ul>`
          : `<p>${escapeHtml(t("noAcceptedDocuments"))}</p>`}
      </div>
      <div>
        <strong>${escapeHtml(t("pendingDocuments"))}</strong>
        ${pending.length
          ? `<ul>${pending.map((doc) => documentItem(doc, true)).join("")}</ul>`
          : `<p>${escapeHtml(t("noPendingDocuments"))}</p>`}
      </div>`;

    container.querySelectorAll(".acknowledge-doc").forEach((button) => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await request(`/api/agreement-docs/${encodeURIComponent(button.dataset.docId)}/acknowledge`, {
            method: "POST"
          });
          await loadAgreements();
        } catch (error) {
          button.disabled = false;
          window.alert(t("acknowledgeFailed"));
        }
      });
    });
  }

  async function loadAgreements() {
    const container = document.getElementById("pending-agreements");
    try {
      agreementDocuments = await request("/api/agreement-docs");
      if (!Array.isArray(agreementDocuments)) agreementDocuments = [];
      renderAgreements();
    } catch (error) {
      agreementDocuments = [];
      if (container) {
        container.textContent = t("documentsFailed");
      }
    }
  }

  function renderEvents() {
    const container = document.getElementById("my-events");
    if (!container) return;

    if (userEvents === null) {
      container.textContent = t("loadingEvents");
      return;
    }

    if (!userEvents.length) {
      container.innerHTML = `<p>${escapeHtml(t("noEvents"))}</p>`;
      return;
    }

    const locale = language() === "es" ? "es-US" : "en-US";
    container.innerHTML = `<ul>${userEvents.map((event) => {
      const date = event.date
        ? new Intl.DateTimeFormat(locale, {
            dateStyle: "medium",
            timeStyle: "short"
          }).format(new Date(event.date))
        : "";
      return `<li>
        <a href="/event.html?id=${encodeURIComponent(event.id)}">${escapeHtml(event.name)}</a>
        ${date ? ` — ${escapeHtml(date)}` : ""}
      </li>`;
    }).join("")}</ul>`;
  }

  async function loadEvents() {
    const container = document.getElementById("my-events");
    try {
      userEvents = await request("/api/user/events");
      if (!Array.isArray(userEvents)) userEvents = [];
      renderEvents();
    } catch {
      userEvents = [];
      if (container) container.textContent = t("eventsFailed");
    }
  }

  function applyPageLanguage() {
    const lang = language();
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-placeholder-en][data-placeholder-es]").forEach((element) => {
      element.placeholder = lang === "es"
        ? element.dataset.placeholderEs
        : element.dataset.placeholderEn;
    });
    document.querySelectorAll("[data-aria-label-en][data-aria-label-es]").forEach((element) => {
      element.setAttribute(
        "aria-label",
        lang === "es" ? element.dataset.ariaLabelEs : element.dataset.ariaLabelEn
      );
    });
    document.title = t("title");
    if (profileUser) {
      document.getElementById("me-name").textContent =
        profileUser.name || profileUser.first_name || t("unknownUser");
    }
    renderPhotoName();
    renderAgreements();
    renderEvents();
    if (statusKey) setStatus(statusKey, statusDetail);
  }

  async function initialize() {
    const form = document.getElementById("admin-user-form");
    const photo = document.getElementById("photo");
    renderAgreements();
    photo?.addEventListener("change", renderPhotoName);

    try {
      const me = await request("/api/me");
      if (!me) {
        window.location.href = "/login.html?next=%2Fadminuser.html";
        return;
      }
      profileUser = me;

      document.getElementById("username").value = me.name || "";
      document.getElementById("email").value = me.email || "";
      document.getElementById("first_name").value = me.first_name || "";
      document.getElementById("last_name").value = me.last_name || "";
      document.getElementById("testimony").value = me.testimony || "";
      document.getElementById("video_url").value = me.video_url || "";
      document.getElementById("me-name").textContent = me.name || me.first_name || t("unknownUser");
      document.getElementById("me-email").textContent = me.email || "";

      form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        setStatus("");

        const password = document.getElementById("password").value;
        const body = {
          username: document.getElementById("username").value,
          first_name: document.getElementById("first_name").value,
          last_name: document.getElementById("last_name").value,
          email: document.getElementById("email").value,
          image_url: document.getElementById("photo").value,
          testimony: document.getElementById("testimony").value,
          video_url: document.getElementById("video_url").value
        };
        if (password) body.password = password;

        try {
          await request("/api/me", {
            method: "PATCH",
            body: JSON.stringify(body)
          });
          document.getElementById("password").value = "";
          setStatus("profileUpdated");
        } catch (error) {
          setStatus("profileUpdateFailed");
        }
      });

      await Promise.all([loadAgreements(), loadEvents()]);
    } catch (error) {
      setStatus("pageFailed");
    }
  }

  const sharedSetLanguage = window.setLanguage;
  window.setLanguage = (lang) => {
    sharedSetLanguage(lang);
    applyPageLanguage();
  };
  applyPageLanguage();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();
