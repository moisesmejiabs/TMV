function sharePage() {
  const url = window.location.href;
  const title = document.title;
  if (navigator.share) {
    navigator.share({ title, url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(url).then(() => alert("Link copied."));
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function api(path, opts = {}) {
  const r = await fetch(path, {
    credentials: "include",
    headers: {
      ...(opts.body ? { "Content-Type": "application/json" } : {})
    },
    ...opts
  });

  const ct = r.headers.get("content-type") || "";
  const body = ct.includes("application/json")
      ? await r.json().catch(() => null)
      : await r.text().catch(() => null);

    if (!r.ok) {
      const msg = (body && body.error)
        ? body.error
        : (typeof body === "string" ? body : "Request failed");
      throw new Error(msg);
    }

    return body;
  }

  const ADMIN_VIEW_MODE_KEY = "tmv_admin_view_mode";

  function getAdminViewMode(me) {
    const role = String(me?.role || "").trim().toLowerCase();
    if (role !== "admin") return "user";
    return localStorage.getItem(ADMIN_VIEW_MODE_KEY) === "user" ? "user" : "admin";
  }

  function isAdminViewingAsUser(me) {
    return String(me?.role || "").trim().toLowerCase() === "admin" && getAdminViewMode(me) === "user";
  }

  function canUseAdminControls(me) {
    const role = String(me?.role || "").trim().toLowerCase();
    if (role === "admin") return !isAdminViewingAsUser(me);
    return role === "instructor";
  }

  function setLanguage(lang) {
    localStorage.setItem("lang", lang);
    console.log("setLanguage", lang);
    updateLanguage(lang);
  }

  function updateLanguage(lang) {
    document.querySelectorAll("[data-en][data-es]").forEach(el => {
      const value = lang === "es" ? el.dataset.es : el.dataset.en;

      // 🔥 KEY CHANGE HERE
      el.innerHTML = value;
    });

    localStorage.setItem("lang", lang);
  }

  function renderGuestLinks(container) {
    container.innerHTML = `
      <a href="/login.html" class="nav-btn">
        <span data-en="Login" data-es="Iniciar sesión">Login</span>
      </a>
      <a href="/register.html" class="nav-btn">
        <span data-en="Register" data-es="Registrarse">Register</span>
      </a>
    `;
  }

function renderAuthLinks(me) {
  const container = document.getElementById("auth-links");

  console.log("renderAuthLinks: container =", container);

  if (!container) {
    console.log("renderAuthLinks: #auth-links NOT FOUND");
    return;
  }

  container.innerHTML = "";

  if (!me || !me.role) {
    console.log("renderAuthLinks: guest mode");
    renderGuestLinks(container);
    const lang = localStorage.getItem("lang") || "en";
    updateLanguage(lang);
    return;
  }

  const role = String(me.role || "").trim().toLowerCase();
  const viewMode = getAdminViewMode(me);
  console.log("renderAuthLinks: normalized role =", role);

  let html = `
    <a href="/milk-giveaway" class="nav-btn">
      <span data-en="Milk registration" data-es="Registro de leche">Milk registration</span>
    </a>
  `;

  if (role === "admin") {
    console.log("renderAuthLinks: ADMIN detected");
    if (viewMode === "admin") {
      html += `
        <a href="/admin.html" class="nav-btn">
          <span data-en="Admin" data-es="Admin">Admin</span>
        </a>
        <a href="/media" class="nav-btn">
          <span data-en="Media" data-es="Medios"></span>
        </a>
      `;
    } else {
      html += `
        <a href="/adminuser.html" class="nav-btn">
            <span data-en="Profile" data-es="Perfil"></span>
        </a>
      `;
    }

    html += `
      <button type="button" id="admin-view-toggle" class="nav-btn admin-view-toggle">
        <span
          data-en="${viewMode === "admin" ? "View as User" : "View as Admin"}"
          data-es="${viewMode === "admin" ? "Ver como Usuario" : "Ver como Admin"}">
          ${viewMode === "admin" ? "View as User" : "View as Admin"}
        </span>
      </button>
    `;
  } else {
    console.log("renderAuthLinks: NON-ADMIN detected");
    html += `
      <a href="/adminuser.html" class="nav-btn">
          <span data-en="Profile" data-es="Perfil"></span>
      </a>
    `;
  }

  html += `
    <a href="#" id="logout-link" class="nav-btn">
      <span data-en="Logout" data-es="Salir">Logout</span>
    </a>
  `;

  container.innerHTML = html;

  const logoutLink = document.getElementById("logout-link");
  if (logoutLink) {
    logoutLink.addEventListener("click", async (e) => {
      e.preventDefault();
      console.log("LOGOUT CLICKED");

      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include"
      });

      location.reload();
    });
  }

  const adminViewToggle = document.getElementById("admin-view-toggle");
  if (adminViewToggle) {
    adminViewToggle.addEventListener("click", () => {
      const nextMode = getAdminViewMode(me) === "admin" ? "user" : "admin";
      localStorage.setItem(ADMIN_VIEW_MODE_KEY, nextMode);
      if (nextMode === "user" && document.body?.dataset?.pageType === "admin") {
        window.location.href = "/";
        return;
      }
      location.reload();
    });
  }

  const lang = localStorage.getItem("lang") || "en";
    updateLanguage(lang);
  }

  function listCards(items, hrefFn, field) {
    const arr = items?.items || items || [];
    if (!arr.length) return "<p>No items found.</p>";

    return arr.map(item => `
      <a class="card-link" href="${hrefFn(item)}">
        <div class="card">
          <strong>${item[field] || ""}</strong>
        </div>
      </a>
    `).join("");
  }

function positionCurrentUserBesideLanguage(meEl) {
  if (!meEl) return;

  const languageToggle = document.querySelector(".lang-toggle");
  const languageRow = languageToggle?.parentElement;
  if (!languageToggle || !languageRow) return;

  languageRow.classList.add("language-user-row");
  meEl.classList.remove("section-card");
  meEl.classList.add("current-user-compact");
  languageRow.appendChild(meEl);
}

function ensureLanguageToggleRow() {
  const existing = document.querySelector(".lang-toggle");
  if (existing) return existing;

  const row = document.createElement("div");
  row.className = "top-row utility-language-row";
  row.innerHTML = `
    <span class="lang-toggle" aria-label="Language selector">
      <button type="button" class="lang-btn" data-language="en">🇺🇸 EN</button>
      <span class="lang-sep">|</span>
      <button type="button" class="lang-btn" data-language="es">🇲🇽 ES</button>
    </span>
  `;

  row.querySelectorAll("[data-language]").forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.dataset.language));
  });

  const header = document.querySelector("header");
  const main = document.querySelector("main");
  if (header) {
    header.insertAdjacentElement("afterend", row);
  } else if (main) {
    main.insertAdjacentElement("beforebegin", row);
  } else {
    document.body.prepend(row);
  }

  return row.querySelector(".lang-toggle");
}

async function initApp() {
  console.log("🚀 initApp START");

  const initialLanguage = localStorage.getItem("lang") || "en";
  updateLanguage(initialLanguage);

  let me = null;

  // ---------- AUTH ----------
  try {
    console.log("🌐 Fetching /api/me...");
    me = await api("/api/me");

    console.log("✅ /api/me response:", me);

    // normalize unexpected shape
    if (me && me.user === null) {
      console.warn("⚠️ me.user === null → treating as not logged in");
      me = null;
    }
  } catch (e) {
    console.warn("⚠️ Not logged in or /api/me failed:", e);
    me = null;
  }

  const pageType = document.body?.dataset?.pageType || 'public';
  if (me && me.pending_agreements_count > 0 && pageType !== 'user') {
    console.log('Redirecting to agreement acknowledgement because pending documents exist.');
    window.location.href = '/adminuser.html?pending=1';
    return;
  }

  // ---------- AUTH NAV ----------
  try {
    console.log("🧩 Rendering auth links...");
    renderAuthLinks(me);
  } catch (e) {
    console.error("❌ renderAuthLinks failed:", e);
  }

  // ---------- ME DISPLAY ----------
  ensureLanguageToggleRow();
  let meEl = document.getElementById("me");
  console.log("🔍 #me element:", meEl);

  if (!meEl && me && document.querySelector(".lang-toggle")) {
    meEl = document.createElement("aside");
    meEl.id = "me";
    meEl.innerHTML = `
      <h3>Current User</h3>
      <p><b>Name:</b> <span id="me-name"></span></p>
      <p><b>Email:</b> <span id="me-email"></span></p>
    `;
  }

  if (meEl) {
    if (me) {
      const nameSpan = meEl.querySelector('#me-name');
      const emailSpan = meEl.querySelector('#me-email');
      if (nameSpan) nameSpan.textContent = me.name || me.first_name || 'Unknown';
      if (emailSpan) emailSpan.textContent = me.email;
    } else {
      meEl.innerHTML = '<h3>Unregistered</h3>';
    }

    positionCurrentUserBesideLanguage(meEl);
  }

  
  // ---------- LANGUAGE ----------
  try {
    const lang = localStorage.getItem("lang") || "en";
    console.log("🌐 Setting language:", lang);
    updateLanguage(lang);
  } catch (e) {
    console.error("❌ updateLanguage failed:", e);
  }

  /***********************************************
   * BEGIN Initialize individual pages
   */

  console.log("🔐 pageType =", pageType);

  if (pageType === "user" && !me) {
    console.warn("🚫 user page but not logged in → redirecting");
    window.location.href = "/login.html";
    return;
  }

  console.log("Checking if page calling app.js has courseForm")
  if (document.getElementById("courseForm") || document.getElementById("workshopForm")) {
    console.log("about to call redirect if not admin user")
    // admin page: must be logged in and admin
    if ((pageType === "admin"|| pageType === "public") && (!me || me.role !== "admin")) {
      console.warn("🚫 admin page but user is not admin → redirecting");
      window.location.href = "/";
      return;
    }
    // nothing to call yet
  }

  console.log("Checking if page calling app.js has coursesListDeletion")
  if (document.getElementById("coursesListDeletion")) {
    console.log("about to call loadCoursesForDeletion() if admin user")
    // admin page: must be logged in and admin
    if (pageType === "admin" && (!me || me.role !== "admin")) {
      console.warn("🚫 admin page but user is not admin → redirecting");
      window.location.href = "/";
      return;
    }
    loadCoursesForDeletion();
  }
  /******************
   * check if page is to delete events
   */
  console.log("Checking if page calling app.js has #events-list.event-list-delete")
  if (document.querySelector("#events-list.event-list-delete")) {
    console.log("about to call loadEventsForDeletion()")
    // admin page: must be logged in and admin
    if (pageType === "admin" && (!me || me.role !== "admin")) {
      console.warn("🚫 admin page but user is not admin → redirecting");
      window.location.href = "/";
      return;
    }
    loadEventsForDeletion();
  }

  if (document.querySelector("#workshops-list.workshop-list-delete")) {
    if (pageType === "admin" && (!me || me.role !== "admin")) {
      console.warn("🚫 admin page but user is not admin → redirecting");
      window.location.href = "/";
      return;
    }
    loadWorkshopsForDeletion();
  }

  /******************
   * if events page is calling, load feedback for event
   */
  console.log("Checking if page calling app.js has event-feedback-list")
  if (document.querySelector("#event-feedback-list")) {
    console.log("about to call loadEventFeedback()")
    // admin page: must be logged in and admin
    if (pageType === "admin" && (!me || me.role !== "admin")) {
      console.warn("🚫 admin page but user is not admin → redirecting");
      window.location.href = "/";
      return;
    }
    loadEventFeedback();
    initFeedbackSubmit();
  }

  console.log("Checking if page calling app.js has #course-feedback-list");
  if (
    document.getElementById("course-feedback-list") ||
    document.getElementById("course-feedback-form")
  ) {
    console.log("about to call loadCourseFeedback() and initCourseFeedbackSubmit()");
    loadCourseFeedback();
    initCourseFeedbackSubmit();
  }

  if (document.getElementById("testimonials-list")) {
    console.log("about to call loadTestimonials()");
    loadTestimonials();
  }

  if (document.getElementById("workshops-list") && !document.querySelector("#workshops-list.workshop-list-delete")) {
    console.log("about to call loadWorkshops()");
    loadWorkshops();
  }

  if (document.getElementById("youtube-slider")) {
    console.log("about to call loadYoutubeSlider()");
    loadYoutubeSlider();
  }
    
  /* All pages should init menu */
  initMenu()
   
  /***********************************************
   * END Initialize individual pages
   */

  console.log("✅ initApp COMPLETE");
}

// SAFE INIT
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

/*****************************************************************************
 * END  BIND Event Save Cancel Feedback
 ***************************************************************************/
function bindFeedbackSaveCancel(item, feedbackId, originalText) {
  const saveBtn = item.querySelector(".save-feedback-btn");
  const cancelBtn = item.querySelector(".cancel-feedback-btn");
  const textWrap = item.querySelector(".feedback-text");

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const ta = item.querySelector(".edit-feedback-textarea");
      const newText = ta ? ta.value.trim() : "";

      if (!newText) {
        alert("Feedback cannot be empty.");
        return;
      }

      try {
        const r = await fetch(`/api/event-feedback/${feedbackId}`, {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ feedback: newText })
        });

        const data = await r.json().catch(() => null);

        if (!r.ok || !data?.ok) {
          throw new Error(data?.error || "Failed to update feedback");
        }

        await loadEventFeedback();
      } catch (err) {
        console.error("❌ save feedback failed:", err);
        alert(err.message || "Failed to update feedback.");
      }
    });
  }

  if (cancelBtn && textWrap) {
    cancelBtn.addEventListener("click", () => {
      textWrap.textContent = originalText;
      loadEventFeedback();
    });
  }
}

/*****************************************************************************
 * END  BIND Event Save Cancel Feedback
 ***************************************************************************/

/*****************************************************************************
 * END  BIND Event  Feedback
 ***************************************************************************/
function bindFeedbackEditButtons() {
  document.querySelectorAll(".edit-feedback-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const feedbackId = btn.getAttribute("data-feedback-id");
      if (!feedbackId) return;

      const item = btn.closest("[data-feedback-id]");
      if (!item) return;

      const textEl = item.querySelector(".feedback-text");
      if (!textEl) return;

      const currentText = textEl.textContent.trim();

      textEl.innerHTML = `
        <textarea class="edit-feedback-textarea" rows="4" style="width:100%;">${currentText}</textarea>
        <div style="margin-top:8px; display:flex; gap:8px;">
          <button class="btn save-feedback-btn" data-feedback-id="${feedbackId}">Save</button>
          <button class="btn cancel-feedback-btn" data-original="${encodeURIComponent(currentText)}">Cancel</button>
        </div>
      `;

      bindFeedbackSaveCancel(item, feedbackId, currentText);
    });
  });
}
/*****************************************************************************
 * END  BIND Event  Feedback
 ***************************************************************************/

/*****************************************************************************
 * BEGIN  bind feedback delete buttons
 ***************************************************************************/
function bindFeedbackDeleteButtons() {
  document.querySelectorAll(".delete-feedback-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const feedbackId = btn.getAttribute("data-feedback-id");
      if (!feedbackId) return;

      const ok = confirm("Are you sure you want to delete this feedback?");
      if (!ok) return;

      try {
        const r = await fetch(`/api/event-feedback/${feedbackId}`, {
          method: "DELETE",
          credentials: "include"
        });

        const data = await r.json().catch(() => null);
        console.log("🗑️ delete feedback result:", data);

        if (!r.ok || !data?.ok) {
          throw new Error(data?.error || "Failed to delete feedback");
        }

        await loadEventFeedback();
      } catch (err) {
        console.error("❌ delete feedback failed:", err);
        alert(err.message || "Failed to delete feedback.");
      }
    });
  });
}
/*****************************************************************************
 * END  bind feedback delete buttons
 ***************************************************************************/
/*****************************************************************************
 * BEGIN  Receive Event  Feedback
 ***************************************************************************/
function initFeedbackSubmit() {
  const form = document.getElementById("event-feedback-form");
  const textEl = document.getElementById("event-feedback-text");
  const statusEl = document.getElementById("event-feedback-status");

  if (!form) {
    console.error("❌ event-feedback-form NOT FOUND");
    return;
  }

  form.addEventListener("submit", async (e) => {
    console.log("🚀 Feedback submit START");
    e.preventDefault();

    const params = new URLSearchParams(window.location.search);
    const eventId = params.get("id");

    console.log("📌 eventId =", eventId);
    console.log("📌 current URL =", window.location.href);

    if (!eventId) {
      console.error("❌ Missing event id");
      if (statusEl) statusEl.textContent = "Missing event id.";
      return;
    }

    const feedback = textEl ? textEl.value.trim() : "";

    if (!feedback) {
      if (statusEl) statusEl.textContent = "Please enter feedback.";
      return;
    }

    try {
      if (statusEl) statusEl.textContent = "Submitting...";

      const r = await fetch(`/api/events/${eventId}/feedback`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ feedback })
      });

      const data = await r.json().catch(() => null);
      console.log("📦 submit feedback result:", data);

      if (!r.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to submit feedback");
      }

      if (textEl) textEl.value = "";
      if (statusEl) statusEl.textContent = "Feedback submitted.";

      await loadEventFeedback();
    } catch (err) {
      console.error("❌ submit feedback failed:", err);
      if (statusEl) statusEl.textContent = err.message || "Failed to submit feedback.";
    }

    console.log("🏁 Feedback submit END");
  });
}
/*****************************************************************************
 * END  Receive Event  Feedback
 ***************************************************************************/

/*****************************************************************************
 * BEGIN  Load Event  Feedback
 ***************************************************************************/
async function loadEventFeedback() {
  console.log("🚀 loadEventFeedback START");

  const listEl = document.getElementById("event-feedback-list");
  if (!listEl) {
    console.error("❌ #event-feedback-list NOT FOUND");
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const eventId = params.get("id");

  if (!eventId) {
    listEl.innerHTML = `<li class="list-item"><b>Missing event id.</b></li>`;
    return;
  }

  try {
    const me = await api("/api/me").catch(() => null);
    const myId = me?.id || me?.user?.id || null;
    const myRole = (me?.role || me?.user?.role || "").toLowerCase();

    const feedbacks = await api(`/api/events/${eventId}/feedback`);
    const rows = Array.isArray(feedbacks) ? feedbacks : [];

    if (!rows.length) {
      listEl.innerHTML = `<li class="list-item"><b>No feedback yet.</b></li>`;
      return;
    }

    listEl.innerHTML = rows.map((f) => {
      const canEdit =
        (myId && Number(f.user_id) === Number(myId)) ||
        myRole === "admin";

      const canDelete = myRole === "admin";

      return `
        <li class="list-item" data-feedback-id="${f.id}">
          <div>
            <b>${escapeHtml(f.name || "User")}</b>
            <div class="muted">
              <span><b>Date:</b> ${formatDate(f.created_at)}</span>
            </div>

            <div class="feedback-text" style="margin-top:8px;">
              ${escapeHtml(f.feedback || "")}
            </div>

            ${(canEdit || canDelete) ? `
              <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
                ${canEdit ? `
                  <button class="btn edit-feedback-btn" data-feedback-id="${f.id}">
                    Edit
                  </button>
                ` : ""}
                ${canDelete ? `
                  <button class="btn delete-feedback-btn" data-feedback-id="${f.id}">
                    Delete
                  </button>
                ` : ""}
              </div>
            ` : ""}
          </div>
        </li>
      `;
    }).join("");

    bindFeedbackEditButtons();
    bindFeedbackDeleteButtons();

  } catch (err) {
    console.error("❌ loadEventFeedback failed:", err);
    listEl.innerHTML = `<li class="list-item"><b>Error loading feedback.</b></li>`;
  }
}

/*****************************************************************************
 * End Load Event  Feedback
 ***************************************************************************/


/*****************************************************************************
 * BEGIN Creates button for event creation and initializes the event container
 ***************************************************************************/
async function createEventButton() {
  console.log("Create Event Button Start");

  const container = document.getElementById("create-event-container");
  if (!container) {
    console.log("❌ create-event-container NOT FOUND");
    return;
  }

  console.log("CreateEventButton getElement:", container);

  try {
    const me = await api("/api/me");
    console.log("ME:", me);

    if (!me) return;

    const role = (me.role || "").toLowerCase();
    console.log("role is:", role);

    container.innerHTML = "";
    container.style.display = "none";

    if (canUseAdminControls(me)) {
      console.log("AUTHORIZED ROLE:", role);

      container.innerHTML = `
        <a class="btn" href="/create-event.html">Create event</a>
      `;

      container.style.display = "block";
    }

  } catch (e) {
    console.log("CreateEventButton error:", e);
  }
}

/*****************************************************************************
 * END Creates button for event creation and initializes the event container
 ***************************************************************************/

async function createWorkshopButton() {
  const container = document.getElementById("create-workshop-container");
  if (!container) return;

  try {
    const me = await api("/api/me");
    if (!me) return;
    const role = (me.role || "").toLowerCase();

    container.innerHTML = "";
    container.style.display = "none";

    if (canUseAdminControls(me)) {
      container.innerHTML = `<a class="btn" href="/create-workshop.html">Create workshop</a>`;
      container.style.display = "block";
    }
  } catch (e) {
    console.log("CreateWorkshopButton error:", e);
  }
}

/*****************************************************************************
 * BEGIN Creates button for course creation and initializes the course container
 ***************************************************************************/
  async function createCoursebutton() {
    console.log("Create Course Button Start");
    const container = document.getElementById("create-course-container");
    if (!container) return;

    console.log("CreateCourseButton getElement:", container);

    try {
      const me = await api("/api/me");
      console.log("ME:", me);

      if (!me) return;

      const role = (me.role || "").toLowerCase();
      console.log("role is:", role);

      container.innerHTML = "";
      container.style.display = "none";

      if (canUseAdminControls(me)) {
        console.log("AUTHORIZED ROLE:", role);
        container.innerHTML = `
          <a class="btn" href="/create-course.html">Create course</a>
        `;
        container.style.display = "block";
      }

    } catch (e) {
      console.log("CreateCourseButton error:", e);
    }
  }
  

  /*****************************************************************************
 * END Creates button for course creation and initializes the course container
 ***************************************************************************/

  /*****************************************************************************
 * BEGIN load course create list of courses in course container
 ***************************************************************************/
async function loadCourses() {
  console.log("🚀 loadCourses CALLED");

  const list = document.getElementById("courses-list");
  console.log("🔍 courses-list element:", list);

  if (!list) {
    console.error("❌ courses-list NOT FOUND");
    return;
  }

  try {
    const r = await fetch("/api/courses", { credentials: "include" });
    console.log("📡 fetch status:", r.status);

    const data = await r.json();
    console.log("📦 response data:", data);

    const courses = Array.isArray(data) ? data : (data.items || data.courses || []);
    console.log("📚 normalized courses:", courses);
    console.log("📚 courses length:", courses.length);

    if (!courses.length) {
      console.log("⚠️ No courses found → rendering empty message");
      list.innerHTML = "<li>No courses yet.</li>";
      return;
    }

    console.log("🧱 Building HTML for courses...");
    createCoursebutton();
    let html = "";

    courses.forEach((c, index) => {
      try {
        console.log(`➡ Processing course[${index}]:`, c);

        const id = c.id;
        const name = c.name || "";
        const date = c.date;
        const presenter = c.presenter || "";

        console.log(`   id: ${id}`);
        console.log(`   name: ${name}`);
        console.log(`   raw date: ${date}`);

        const formattedDate = formatDate(date);
        console.log(`   formatted date: ${formattedDate}`);

        const safeName = escapeHtml(name);
        const safeDate = escapeHtml(formattedDate);
        const safePresenter = escapeHtml(presenter);
        const safeId = encodeURIComponent(id);
        const safeLocation = escapeHtml(c.location || "");
        const safeDescription = escapeHtml(c.about || "");
        const rawImageUrl = c.image_url
          ? (String(c.image_url).startsWith("/") || /^https?:\/\//i.test(c.image_url)
              ? c.image_url
              : `/static/images/${c.image_url}`)
          : "";
        const safeImageUrl = escapeHtml(rawImageUrl);

        if (document.body.classList.contains("courses-listing-page")) {
          const thumbnail = safeImageUrl ? `
            <a class="course-thumbnail" href="/course.html?id=${safeId}" aria-label="View ${safeName}">
              <img src="${safeImageUrl}" alt="${safeName} course image" loading="lazy">
            </a>
          ` : `
            <div class="course-thumbnail course-thumbnail-placeholder" aria-label="No course image">
              <span>No image</span>
            </div>
          `;

          html += `
            <li class="course-item">
              <div class="course-summary">
                ${thumbnail}
                <div class="course-summary-details">
                  <a href="/course.html?id=${safeId}">
                    <strong>${safeName}</strong>
                  </a>
                  <div class="course-meta">
                    <span><b>Date:</b> ${safeDate}</span><br>
                    <span><b>Presenter:</b> ${safePresenter}</span><br>
                    <span><b>Location:</b> ${safeLocation}</span>
                    ${safeDescription ? `<div class="course-description"><b>Description:</b> ${safeDescription}</div>` : ""}
                  </div>
                </div>
              </div>
            </li>
          `;
          return;
        }

        html += `
          <li class="course-item homepage-summary-card">
            ${safeImageUrl
              ? `<a class="homepage-summary-media" href="/course.html?id=${safeId}"><img src="${safeImageUrl}" alt="${safeName} course image" loading="lazy"></a>`
              : `<div class="homepage-summary-media homepage-summary-placeholder" aria-hidden="true"></div>`}
            <div class="homepage-summary-content">
              <a class="homepage-summary-title" href="/course.html?id=${safeId}">
                <strong>${safeName}</strong>
              </a>
              <div class="course-meta">
                <span><b>Date:</b> ${safeDate}</span><br>
                <span><b>Presenter:</b> ${safePresenter}</span><br>
                <span><b>Location:</b> ${safeLocation}</span>
              </div>
              ${safeDescription ? `<p class="homepage-summary-description">${safeDescription}</p>` : ""}
            </div>
          </li>
        `;
      } catch (innerErr) {
        console.error(`❌ Error processing course[${index}]`, innerErr, c);
      }
      
     
    });

    console.log("🧾 Final HTML:", html);

    try {
      list.innerHTML = html;
      console.log("✅ DOM updated successfully");
    } catch (domErr) {
      console.error("❌ Failed to set innerHTML on list", domErr);
    }

  } catch (err) {
    console.error("❌ loadCourses error:", err);
    if (list) {
      list.innerHTML = "<li>Failed to load courses.</li>";
    }
  }
}

async function loadWorkshops() {
  const list = document.getElementById("workshops-list");
  if (!list || list.classList.contains("workshop-list-delete")) return;

  try {
    createWorkshopButton();
    const workshops = await api("/api/workshops");

    if (!workshops || workshops.length === 0) {
      list.innerHTML = `<li class="list-item"><b>No workshops found.</b></li>`;
      return;
    }

    list.innerHTML = workshops.map((w) => {
      const image = w.image_url ? (String(w.image_url).startsWith("/") || /^https?:\/\//i.test(w.image_url) ? w.image_url : `/static/images/${w.image_url}`) : "";
      return `
        <li class="list-item workshop-summary-card">
          ${image
            ? `<a class="workshop-media-link" href="/workshop.html?id=${encodeURIComponent(w.id)}"><img src="${escapeHtml(image)}" alt="${escapeHtml(w.name || 'Workshop image')}"></a>`
            : `<div class="workshop-media-placeholder" aria-hidden="true"></div>`}
          <div class="workshop-summary-content">
            <a class="workshop-summary-title" href="/workshop.html?id=${encodeURIComponent(w.id)}">
              <strong>${escapeHtml(w.name || "")}</strong>
            </a>
            <div class="muted">
              <span><b>Date:</b> ${formatDate(w.date)}</span><br>
              <span><b>Location:</b> ${escapeHtml(w.location || "")}</span>
            </div>
            ${w.about ? `<p class="workshop-summary-description">${escapeHtml(w.about)}</p>` : ""}
          </div>
        </li>
      `;
    }).join("");
  } catch (e) {
    console.error("ERROR in loadWorkshops:", e);
    list.innerHTML = `<li class="list-item"><b>Error loading workshops.</b></li>`;
  }
}

async function loadYoutubeSlider() {
  const root = document.getElementById("youtube-slider");
  if (!root) return;

  try {
    const videos = await api("/api/youtube-slider");
    if (!videos || !videos.length) {
      root.innerHTML = `<p class="muted">No videos available.</p>`;
      return;
    }

    let index = 0;

    function render() {
      const video = videos[index];
      root.innerHTML = `
        <div class="youtube-slider-frame">
          <iframe
            src="${escapeHtml(video.embed_url)}"
            title="${escapeHtml(video.title || 'YouTube video')}"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen>
          </iframe>
        </div>
        <div class="youtube-slider-controls">
          <button type="button" id="youtube-prev" aria-label="Previous video">&#10094;</button>
          <strong>${escapeHtml(video.title || '')}</strong>
          <button type="button" id="youtube-next" aria-label="Next video">&#10095;</button>
        </div>
      `;

      const prev = document.getElementById("youtube-prev");
      const next = document.getElementById("youtube-next");
      if (prev) prev.disabled = videos.length <= 1;
      if (next) next.disabled = videos.length <= 1;
      if (prev) prev.addEventListener("click", () => {
        index = (index - 1 + videos.length) % videos.length;
        render();
      });
      if (next) next.addEventListener("click", () => {
        index = (index + 1) % videos.length;
        render();
      });
    }

    render();
  } catch (err) {
    console.error("ERROR in loadYoutubeSlider:", err);
    root.innerHTML = `<p class="muted">Error loading videos.</p>`;
  }
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d)) return value;

  return d.toLocaleString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

 /*****************************************************************************
 * END load course create list of courses in course container
 ***************************************************************************/

 /*****************************************************************************
 * BEGIN Menu Init, create, event handler
 ***************************************************************************/
async function initMenu() {
  console.log("🚀 MENU SCRIPT START");

  const toggle = document.getElementById("menu-toggle");
  const menu = document.getElementById("mobile-menu");

  console.log("toggle =", toggle);
  console.log("menu =", menu);

  if (!toggle) {
    console.error("❌ menu-toggle NOT FOUND");
    return;
  }

  if (!menu) {
    console.error("❌ mobile-menu NOT FOUND");
    return;
  }

  function openMenu() {
    console.log("🔥 openMenu called");
    toggle.classList.add("active");
    menu.classList.add("active");
  }

  function closeMenu() {
    console.log("🔥 closeMenu called");
    toggle.classList.remove("active");
    menu.classList.remove("active");
  }

  toggle.addEventListener("click", (e) => {
    console.log("🖱️ CLICK event fired");

    if (menu.classList.contains("active")) {
      console.log("➡ closing menu");
      closeMenu();
    } else {
      console.log("➡ opening menu");
      openMenu();
    }
  });

  menu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });
}

 /*****************************************************************************
 * END Menu Init, create, event handler
 ***************************************************************************/

/*****************************************************************************
 * BEGIN Supporting API from Index.html for Events and authentication
 ***************************************************************************/
 
  function setAuthNav(me){
    const el = document.getElementById('nav-auth');
    if(!me){
      el.innerHTML = '<a href="/login.html">Login</a> <a href="/register.html">Register</a>';
      return;
    }
    const adminLink = me.role === 'admin' ? ' <a href="/admin.html">Admin</a>' : '';
    el.innerHTML = `<span style="margin-right:10px;">Hi, ${me.name}</span>${adminLink} <a href="#" id="logoutLink">Logout</a>`;
    document.getElementById('logoutLink').addEventListener('click', async (e)=>{
      e.preventDefault();
      await api('/api/auth/logout', {method:'POST'});
      location.reload();
    });
  }

 async function initIndex() {
  let me = null;
  try { me = await api('/api/me'); } catch(e) {}
  setAuthNav(me);

  const eventsEl = document.getElementById('events-list');
  if (eventsEl) {
    const events = await api('/api/events?limit=6');
    eventsEl.innerHTML = listCards(events, e=>`/event.html?id=${e.id}`, 'name');
  }

  const coursesEl = document.getElementById('courses-list');
  if (coursesEl) {
    const courses = await api('/api/courses?limit=6');
    coursesEl.innerHTML = listCards(courses, c=>`/course.html?id=${c.id}`, 'name');
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

/*****************************************************************************
 * END Supporting API from Index.html for Events and authentication
 ***************************************************************************/

 /*****************************************************************************
 * BEGIN load events for normal display
 ***************************************************************************/
    
function handleModifyEvent(eventId) {
  console.log("✏️ handleModifyEvent ENTRY");
  console.log("✏️ eventId =", eventId);

  if (!eventId) {
    console.error("❌ handleModifyEvent: missing eventId");
    alert("Modify failed: missing event ID.");
    return;
  }

  const targetUrl = `/create-event.html?id=${encodeURIComponent(eventId)}`;
  console.log("🌐 Redirecting to:", targetUrl);

  window.location.href = targetUrl;
}

async function handleDeleteEvent(eventId, eventName) {
  console.log("🗑 handleDeleteEvent ENTRY");
  console.log("🗑 eventId =", eventId);
  console.log("🗑 eventName =", eventName);

  if (!eventId) {
    console.error("❌ handleDeleteEvent: missing eventId");
    alert("Delete failed: missing event ID.");
    return;
  }

  const confirmed = confirm(`Delete event "${eventName || eventId}"?`);
  console.log("❓ Delete confirmed:", confirmed);

  if (!confirmed) {
    console.log("🚫 Delete cancelled by user");
    return;
  }

  try {
    console.log("🌐 Sending DELETE request...");
    const result = await api(`/api/events/${eventId}`, {
      method: "DELETE"
    });

    console.log("✅ Delete success result:", result);

    await loadEvents();
  } catch (err) {
    console.error("❌ Delete failed:", err);
    alert(`Delete failed: ${err.message || err}`);
  }
}
function handleModifyEvent(eventId) {
  console.log("✏️ handleModifyEvent ENTRY");
  console.log("✏️ eventId =", eventId);

  if (!eventId) {
    console.error("❌ handleModifyEvent: missing eventId");
    alert("Modify failed: missing event ID.");
    return;
  }

  const targetUrl = `/create-event.html?id=${encodeURIComponent(eventId)}`;
  console.log("🌐 Redirecting to:", targetUrl);

  window.location.href = targetUrl;
}

async function handleDeleteEvent(eventId, eventName) {
  console.log("🗑 handleDeleteEvent ENTRY");
  console.log("🗑 eventId =", eventId);
  console.log("🗑 eventName =", eventName);

  if (!eventId) {
    console.error("❌ handleDeleteEvent: missing eventId");
    alert("Delete failed: missing event ID.");
    return;
  }

  const confirmed = confirm(`Delete event "${eventName || eventId}"?`);
  console.log("❓ Delete confirmed:", confirmed);

  if (!confirmed) {
    console.log("🚫 Delete cancelled by user");
    return;
  }

  try {
    console.log("🌐 Sending DELETE request...");
    const result = await api(`/api/events/${eventId}`, {
      method: "DELETE"
    });

    console.log("✅ Delete success result:", result);

    await loadEvents();
  } catch (err) {
    console.error("❌ Delete failed:", err);
    alert(`Delete failed: ${err.message || err}`);
  }
}
/*****************************************************************************
 * END  load events for normal display
 ***************************************************************************/

/*****************************************************************************
 * BEGIN load courses for normal deletion
 ***************************************************************************/
async function loadCoursesForDeletion() {
  console.log("calling loadCoursesForDeletion()");
  const list = document.getElementById("coursesListDeletion");

  try {
    const courses = await api("/api/courses"); // adjust endpoint if needed

    if (!courses || courses.length === 0) {
      list.innerHTML = `<li class="list-item"><b>No courses found.</b></li>`;
      return;
    }

    list.innerHTML = courses.map(c => `
      <li class="list-item">
        <div>
          <b>${c.name}</b>
          <div class="muted">
            <span><b>ID:</b> ${c.id}</span><br>
            <span><b>Date:</b> ${formatDate(c.date)}</span><br>
            <span><b>Presenter:</b> ${c.presenter}</span>
          </div>
        </div>

        <div style="margin-top: 10px;">
          <a class="btn" href="/course.html?id=${encodeURIComponent(c.id)}">View</a>
          <a class="btn" href="/create-course.html?id=${encodeURIComponent(c.id)}">Edit</a>

          <button class="btn"
            onclick="deleteCourse('${c.id}')">
            Delete
          </button>
        </div>
      </li>
    `).join("");

  } catch (e) {
    console.error("Error loading courses", e);
    list.innerHTML = `<li class="list-item"><b>Error loading courses.</b></li>`;
  }
}

async function loadWorkshopsForDeletion() {
  const list = document.getElementById("workshops-list");
  if (!list) return;

  try {
    const workshops = await api("/api/workshops");
    if (!workshops || workshops.length === 0) {
      list.innerHTML = `<li class="list-item"><b>No workshops found.</b></li>`;
      return;
    }

    list.innerHTML = workshops.map(w => `
      <li class="list-item">
        <div>
          <b>${escapeHtml(w.name || "")}</b>
          <div class="muted">
            <span><b>ID:</b> ${w.id}</span><br>
            <span><b>Date:</b> ${formatDate(w.date)}</span><br>
            <span><b>Presenter:</b> ${escapeHtml(w.presenter || "")}</span>
          </div>
        </div>
        <div style="margin-top: 10px;">
          <a class="btn" href="/workshop.html?id=${encodeURIComponent(w.id)}">View</a>
          <a class="btn" href="/create-workshop.html?id=${encodeURIComponent(w.id)}">Edit</a>
          <button class="btn" onclick="deleteWorkshop('${w.id}')">Delete</button>
        </div>
      </li>
    `).join("");
  } catch (e) {
    console.error("Error loading workshops", e);
    list.innerHTML = `<li class="list-item"><b>Error loading workshops.</b></li>`;
  }
}

async function deleteWorkshop(id) {
  if (!confirm(`Delete workshop ${id}? Feedback will be saved for future display.`)) return;
  try {
    const res = await fetch(`/api/workshops/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include"
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error((data && data.error) || "Delete failed");
    }
    loadWorkshopsForDeletion();
  } catch (err) {
    console.error("Delete failed:", err);
    alert("Failed to delete workshop.");
  }
}
/*****************************************************************************
 * END load courses for normal deletion
 ***************************************************************************/

  /*****************************************************************************
   * BEGIN DELETE courses and supporting date func
   ***************************************************************************/
  async function deleteCourse(id) {
    if (!confirm(`Delete course ${id}? Feedback will be saved for future display.`)) return;

      try {
        const res = await fetch(`/api/courses/${encodeURIComponent(id)}`, {
          method: "DELETE",
          credentials: "include"
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error((data && data.error) || "Delete failed");
        }
        loadCoursesForDeletion();
      } catch (err) {
        console.error("Delete failed:", err);
        alert("Failed to delete course.");
      }
  }

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
/*****************************************************************************
 * END DELETE courses and supporting date func
 ***************************************************************************/

/*****************************************************************************
 * BEGIN DELETE  events
 ***************************************************************************/

async function deleteEvent(id) {
  if (!confirm(`Delete event ${id}? Feedback will be saved for future display.`)) return;

  try {
    const res = await fetch(`/api/events/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include"
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error((data && data.error) || "Delete failed");
    }

    console.log("EVENT ARCHIVE SUCCESS:", id);

    loadEventsForDeletion();

  } catch (e) {
    console.error("EVENT ARCHIVE ERROR:", e);
    alert("Failed to delete event.");
  }
}

async function loadEventsForDeletion() {
  console.log("🔵 START loadEventsForDeletion");

  const list = document.getElementById("events-list");
  console.log("🔍 DOM lookup eventsListDeletion:", list);

  if (!list) {
    console.error("❌ eventsListDeletion NOT FOUND → stopping execution");
    return;
  }

  try {
    console.log("🔍 Calling API /api/events...");

    const events = await api("/api/events");
    console.log("🔍 API returned:", events);

    if (!events) {
      console.error("❌ events is NULL or undefined");
    }

    if (!Array.isArray(events)) {
      console.error("❌ events is NOT an array. Type:", typeof events);
    }

    if (!events || events.length === 0) {
      console.warn("⚠️ No events found or empty array");
      list.innerHTML = `<li class="list-item"><b>No events found.</b></li>`;
      console.log("🟡 Rendered empty state");
      return;
    }

    console.log(`🔍 Rendering ${events.length} events`);

    const html = events.map((e, i) => {
      console.log(`➡️ Processing event index ${i}`, e);

      if (!e) {
        console.error(`❌ event[${i}] is null/undefined`);
      }

      if (!e.id) {
        console.error(`❌ event[${i}] missing id`, e);
      }

      if (!e.name) {
        console.warn(`⚠️ event[${i}] missing title`, e);
      }

      if (!e.date) {
        console.warn(`⚠️ event[${i}] missing date`, e);
      }

      let formattedDate = "";
      try {
        formattedDate = formatDate(e.date);
        console.log(`🕒 formattedDate[${i}]:`, formattedDate);
      } catch (err) {
        console.error(`❌ formatDate FAILED for index ${i}`, e.date, err);
      }

      return `
        <li class="list-item">
          <div>
            <b>${e.name}</b>
            <div class="muted">
              <span><b>ID:</b> ${e.id}</span><br>
              <span><b>Date:</b> ${formattedDate}</span><br>
              <span><b>Location:</b> ${e.location || ""}</span>
            </div>
          </div>

          <div style="margin-top: 10px;">
            <a class="btn" href="/event.html?id=${encodeURIComponent(e.id)}">View</a>
            <a class="btn" href="/create-event.html?id=${encodeURIComponent(e.id)}">Edit</a>

            <button class="btn"
              onclick="deleteEvent('${e.id}')">
              Delete
            </button>
          </div>
        </li>
      `;
    }).join("");

    console.log("🔍 Generated HTML length:", html.length);

    list.innerHTML = html;
    console.log("✅ DOM updated successfully");

  } catch (e) {
    console.error("❌ ERROR in loadEventsForDeletion:", e);

    try {
      list.innerHTML = `<li class="list-item"><b>Error loading events.</b></li>`;
      console.log("🟡 Error state rendered to DOM");
    } catch (domErr) {
      console.error("❌ Failed to update DOM after error:", domErr);
    }
  }

  console.log("🔵 END loadEventsForDeletion");
}
/*****************************************************************************
 * END DELETE  events
 ***************************************************************************/

async function loadEvents() {
  console.log("🔵 START loadEvents");

  const list = document.getElementById("events-list");
  console.log("🔍 DOM lookup eventsListDeletion:", list);

  if (!list) {
    console.error("❌ eventsListDeletion NOT FOUND → stopping execution");
    return;
  }
  createEventButton()
  try {
    console.log("🔍 Calling API /api/events...");

    const events = await api("/api/events");
    console.log("🔍 API returned:", events);

    if (!events) {
      console.error("❌ events is NULL or undefined");
    }

    if (!Array.isArray(events)) {
      console.error("❌ events is NOT an array. Type:", typeof events);
    }

    if (!events || events.length === 0) {
      console.warn("⚠️ No events found or empty array");
      list.innerHTML = `<li class="list-item"><b>No events found.</b></li>`;
      console.log("🟡 Rendered empty state");
      return;
    }

    console.log(`🔍 Rendering ${events.length} events`);

    const html = events.map((e, i) => {
      console.log(`➡️ Processing event index ${i}`, e);

      if (!e) {
        console.error(`❌ event[${i}] is null/undefined`);
      }

      if (!e.id) {
        console.error(`❌ event[${i}] missing id`, e);
      }

      if (!e.name) {
        console.warn(`⚠️ event[${i}] missing title`, e);
      }

      if (!e.date) {
        console.warn(`⚠️ event[${i}] missing date`, e);
      }

      let formattedDate = "";
      try {
        formattedDate = formatDate(e.date);
        console.log(`🕒 formattedDate[${i}]:`, formattedDate);
      } catch (err) {
        console.error(`❌ formatDate FAILED for index ${i}`, e.date, err);
      }

      const safeId = encodeURIComponent(e.id);
      const safeName = escapeHtml(e.name || "");
      const safeDate = escapeHtml(formattedDate);
      const safeLocation = escapeHtml(e.location || "");
      const safeDescription = escapeHtml(e.about || "");
      const rawImageUrl = e.image_url
        ? (String(e.image_url).startsWith("/") || /^https?:\/\//i.test(e.image_url)
            ? e.image_url
            : `/static/images/${e.image_url}`)
        : "";
      const safeImageUrl = escapeHtml(rawImageUrl);

      if (!document.body.classList.contains("events-listing-page")) {
        return `
          <li class="list-item homepage-summary-card">
            ${safeImageUrl
              ? `<a class="homepage-summary-media" href="/event.html?id=${safeId}"><img src="${safeImageUrl}" alt="${safeName} event image" loading="lazy"></a>`
              : `<div class="homepage-summary-media homepage-summary-placeholder" aria-hidden="true"></div>`}
            <div class="homepage-summary-content">
              <a class="homepage-summary-title" href="/event.html?id=${safeId}">
                <strong>${safeName}</strong>
              </a>
              <div class="muted">
                <span><b>Date:</b> ${safeDate}</span><br>
                <span><b>Location:</b> ${safeLocation}</span>
              </div>
              ${safeDescription ? `<p class="homepage-summary-description">${safeDescription}</p>` : ""}
            </div>
          </li>
        `;
      }

      const thumbnail = safeImageUrl ? `
        <a class="event-thumbnail" href="/event.html?id=${safeId}" aria-label="View ${safeName}">
          <img src="${safeImageUrl}" alt="${safeName} event image" loading="lazy">
        </a>
      ` : `
        <div class="event-thumbnail event-thumbnail-placeholder" aria-label="No event image">
          <span>No image</span>
        </div>
      `;

      return `
        <li class="list-item">
          <div class="event-summary">
            ${thumbnail}
            <div class="event-summary-details">
              <a href="/event.html?id=${safeId}">
                <strong>${safeName}</strong>
              </a>
              <div class="muted">
                <span><b>ID:</b> ${escapeHtml(e.id || "")}</span><br>
                <span><b>Date:</b> ${safeDate}</span><br>
                <span><b>Location:</b> ${safeLocation}</span>
                ${safeDescription ? `<div class="event-description"><b>Description:</b> ${safeDescription}</div>` : ""}
              </div>
            </div>
          </div>
        </li>
      `;
    }).join("");

    console.log("🔍 Generated HTML length:", html.length);

    list.innerHTML = html;
    console.log("✅ DOM updated successfully");

  } catch (e) {
    console.error("❌ ERROR in loadEvents:", e);

    try {
      list.innerHTML = `<li class="list-item"><b>Error loading events.</b></li>`;
      console.log("🟡 Error state rendered to DOM");
    } catch (domErr) {
      console.error("❌ Failed to update DOM after error:", domErr);
    }
  }

  console.log("🔵 END loadEventsForDeletion");
}
/*****************************************************************************
 * END DELETE  events
 ***************************************************************************/

/*****************************************************************************
 * BEGIN loadCourseFeedback
 ***************************************************************************/
async function loadCourseFeedback() {
  const listEl = document.getElementById("course-feedback-list");
  if (!listEl) return;

  const params = new URLSearchParams(window.location.search);
  const courseId = params.get("id");

  if (!courseId) {
    listEl.innerHTML = `<li class="list-item"><b>Missing course id.</b></li>`;
    return;
  }

  try {
    const me = await api("/api/me").catch(() => null);
    const myId = me?.id || me?.user?.id || null;
    const myRole = (me?.role || me?.user?.role || "").toLowerCase();

    const feedbacks = await api(`/api/courses/${courseId}/feedback`);
    const rows = Array.isArray(feedbacks) ? feedbacks : [];

    if (!rows.length) {
      listEl.innerHTML = `<li class="list-item"><b>No feedback yet.</b></li>`;
      return;
    }

    listEl.innerHTML = rows.map((f) => {
      const canEdit =
        (myId && Number(f.user_id) === Number(myId)) ||
        myRole === "admin";

      const canDelete = myRole === "admin";

      return `
        <li class="list-item" data-course-feedback-id="${f.id}">
          <div>
            <b>${escapeHtml(f.name || "User")}</b>
            <div class="muted">
              <span><b>Date:</b> ${formatDate(f.created_at)}</span>
            </div>

            <div class="course-feedback-text" style="margin-top:8px;">
              ${escapeHtml(f.feedback || "")}
            </div>

            ${(canEdit || canDelete) ? `
              <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
                ${canEdit ? `
                  <button class="btn edit-course-feedback-btn" data-feedback-id="${f.id}">
                    Edit
                  </button>
                ` : ""}
                ${canDelete ? `
                  <button class="btn delete-course-feedback-btn" data-feedback-id="${f.id}">
                    Delete
                  </button>
                ` : ""}
              </div>
            ` : ""}
          </div>
        </li>
      `;
    }).join("");

    bindCourseFeedbackEditButtons();
    bindCourseFeedbackDeleteButtons();
  } catch (err) {
    console.error("❌ loadCourseFeedback failed:", err);
    listEl.innerHTML = `<li class="list-item"><b>Error loading feedback.</b></li>`;
  }
}
/*****************************************************************************
 * END loadCourseFeedback
 ***************************************************************************/
async function loadTestimonials() {
  const listEl = document.getElementById("testimonials-list");
  if (!listEl) return;

  function escapeHtmlLocal(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function extractYouTubeEmbed(url) {
    try {
      const parsed = new URL(url.trim());
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname;
      if (host.includes('youtu.be')) {
        const id = path.slice(1);
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      if (host.includes('youtube.com')) {
        if (path.startsWith('/watch')) {
          const id = parsed.searchParams.get('v');
          return id ? `https://www.youtube.com/embed/${id}` : null;
        }
        if (path.startsWith('/shorts/')) {
          const id = path.split('/').pop();
          return id ? `https://www.youtube.com/embed/${id}` : null;
        }
        if (path.startsWith('/embed/')) {
          return url;
        }
      }
    } catch (err) {
      return null;
    }
    return null;
  }

  try {
    const testimonials = await api('/api/testimonials');
    const rows = Array.isArray(testimonials) ? testimonials : [];

    if (!rows.length) {
      listEl.innerHTML = `<li class="list-item"><b>No approved testimonials yet.</b></li>`;
      return;
    }

    listEl.innerHTML = rows.map((t) => {
      const videoEmbed = t.video_url && t.video_approved === 1 ? extractYouTubeEmbed(t.video_url) : null;
      return `
        <li class="list-item">
          <div>
            <strong>${escapeHtmlLocal(t.name || 'Anonymous')}</strong>
            <div class="muted">${formatDate(t.created_at)}</div>
            ${t.testimony && t.testimony_approved === 1 ? `<p style="margin-top:8px; white-space:pre-wrap;">${escapeHtmlLocal(t.testimony)}</p>` : ''}
            ${t.video_url && t.video_approved === 1 ? `
              <div style="margin-top: 1rem;">
                ${videoEmbed ? `
                  <div style="position: relative; width: 100%; max-width: 560px; padding-bottom: 56.25%; height: 0;">
                    <iframe src="${escapeHtmlLocal(videoEmbed)}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="position: absolute; width: 100%; height: 100%; left: 0; top: 0;"></iframe>
                  </div>` : `
                  <p><a href="${escapeHtmlLocal(t.video_url)}" target="_blank" rel="noopener noreferrer">Watch video testimony</a></p>`}
              </div>` : ''}
          </div>
        </li>`;
    }).join('');
  } catch (err) {
    console.error("❌ loadTestimonials failed:", err);
    listEl.innerHTML = `<li class="list-item"><b>Error loading testimonials.</b></li>`;
  }
}

function bindCourseFeedbackDeleteButtons() {
  document.querySelectorAll(".delete-course-feedback-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const feedbackId = btn.getAttribute("data-feedback-id");
      if (!feedbackId) return;

      const ok = confirm("Are you sure you want to delete this feedback?");
      if (!ok) return;

      try {
        const r = await fetch(`/api/course-feedback/${feedbackId}`, {
          method: "DELETE",
          credentials: "include"
        });

        const data = await r.json().catch(() => null);
        console.log("🗑️ delete course feedback result:", data);

        if (!r.ok || !data?.ok) {
          throw new Error(data?.error || "Failed to delete feedback");
        }

        await loadCourseFeedback();
      } catch (err) {
        console.error("❌ delete course feedback failed:", err);
        alert(err.message || "Failed to delete feedback.");
      }
    });
  });
}

/*****************************************************************************
 * BEGIN  initCourseFeedbackSubmit
 ***************************************************************************/
function initCourseFeedbackSubmit() {
  console.log("🔥 initCourseFeedbackSubmit CALLED");

  const form = document.getElementById("course-feedback-form");
  const textEl = document.getElementById("course-feedback-text");
  const statusEl = document.getElementById("course-feedback-status");

  console.log("🔍 course feedback form =", form);
  console.log("🔍 course feedback text =", textEl);
  console.log("🔍 course feedback status =", statusEl);

  if (!form) {
    console.error("❌ course-feedback-form NOT FOUND");
    return;
  }

  form.addEventListener("submit", async (e) => {
    console.log("🚨 COURSE FORM SUBMIT HANDLER FIRED");
    e.preventDefault();
    e.stopPropagation();

    const params = new URLSearchParams(window.location.search);
    const courseId = params.get("id");

    console.log("📌 courseId =", courseId);
    console.log("📌 current URL =", window.location.href);

    if (!courseId) {
      console.error("❌ Missing course id");
      if (statusEl) statusEl.textContent = "Missing course id.";
      return;
    }

    const feedback = textEl ? textEl.value.trim() : "";

    if (!feedback) {
      if (statusEl) statusEl.textContent = "Please enter feedback.";
      return;
    }

    try {
      if (statusEl) statusEl.textContent = "Submitting...";

      const r = await fetch(`/api/courses/${courseId}/feedback`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ feedback })
      });

      const data = await r.json().catch(() => null);
      console.log("📦 submit course feedback result =", data);

      if (!r.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to submit feedback");
      }

      if (textEl) textEl.value = "";
      if (statusEl) statusEl.textContent = "Feedback submitted.";

      await loadCourseFeedback();
    } catch (err) {
      console.error("❌ submit course feedback failed:", err);
      if (statusEl) statusEl.textContent = err.message || "Failed to submit feedback.";
    }
  });
}
/*****************************************************************************
 * END  initCourseFeedbackSubmit
 ***************************************************************************/

/*****************************************************************************
 * BEGIN  bindCourseFeedbackEditButtons
 ***************************************************************************/
function bindCourseFeedbackEditButtons() {
  document.querySelectorAll(".edit-course-feedback-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const feedbackId = btn.getAttribute("data-feedback-id");
      if (!feedbackId) return;

      const item = btn.closest("[data-course-feedback-id]");
      if (!item) return;

      const textEl = item.querySelector(".course-feedback-text");
      if (!textEl) return;

      const currentText = textEl.textContent.trim();

      textEl.innerHTML = `
        <textarea class="edit-course-feedback-textarea" rows="4" style="width:100%;">${currentText}</textarea>
        <div style="margin-top:8px; display:flex; gap:8px;">
          <button class="btn save-course-feedback-btn" data-feedback-id="${feedbackId}">Save</button>
          <button class="btn cancel-course-feedback-btn">Cancel</button>
        </div>
      `;

      bindCourseFeedbackSaveCancel(item, feedbackId, currentText);
    });
  });
}

function bindCourseFeedbackSaveCancel(item, feedbackId, originalText) {
  const saveBtn = item.querySelector(".save-course-feedback-btn");
  const cancelBtn = item.querySelector(".cancel-course-feedback-btn");
  const textWrap = item.querySelector(".course-feedback-text");

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const ta = item.querySelector(".edit-course-feedback-textarea");
      const newText = ta ? ta.value.trim() : "";

      if (!newText) {
        alert("Feedback cannot be empty.");
        return;
      }

      try {
        const r = await fetch(`/api/course-feedback/${feedbackId}`, {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ feedback: newText })
        });

        const data = await r.json().catch(() => null);

        if (!r.ok || !data?.ok) {
          throw new Error(data?.error || "Failed to update feedback");
        }

        await loadCourseFeedback();
      } catch (err) {
        console.error("❌ save course feedback failed:", err);
        alert(err.message || "Failed to update feedback.");
      }
    });
  }

  if (cancelBtn && textWrap) {
    cancelBtn.addEventListener("click", () => {
      textWrap.textContent = originalText;
      loadCourseFeedback();
    });
  }
}
/*****************************************************************************
 * END  bindCourseFeedbackEditButtons
 ***************************************************************************/
