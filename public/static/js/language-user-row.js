(function () {
  async function initializeLanguageUserRow() {
    let header = document.querySelector("header");
    const main = document.querySelector("main");

    if (!header) {
      header = document.createElement("header");
      header.className = "top";
      header.innerHTML = `
        <div class="brand">
          <img src="/static/images/TuMejorVersionBird.png" alt="" class="brand-img flipped">
          <h1 class="nav-gold">Tu<br>Mejor<br>Versión</h1>
          <img src="/static/images/TuMejorVersionBird.png" alt="" class="brand-img">
        </div>
      `;
      if (main) main.insertAdjacentElement("beforebegin", header);
      else document.body.prepend(header);
    }

    let languageToggle = document.querySelector(".lang-toggle");

    if (!languageToggle) {
      const row = document.createElement("div");
      row.className = "top-row utility-language-row";
      row.innerHTML = `
        <span class="lang-toggle" aria-label="Language selector">
          <button type="button" class="lang-btn" data-utility-language="en">🇺🇸 EN</button>
          <span class="lang-sep">|</span>
          <button type="button" class="lang-btn" data-utility-language="es">🇲🇽 ES</button>
        </span>
      `;

      if (header) header.insertAdjacentElement("afterend", row);
      else if (main) main.insertAdjacentElement("beforebegin", row);
      else document.body.prepend(row);

      languageToggle = row.querySelector(".lang-toggle");
      row.querySelectorAll("[data-utility-language]").forEach((button) => {
        button.addEventListener("click", () => {
          const language = button.dataset.utilityLanguage;
          localStorage.setItem("lang", language);
          if (typeof window.setLanguage === "function") window.setLanguage(language);
        });
      });
    }

    const response = await fetch("/api/me", { credentials: "include" }).catch(() => null);
    if (!response || !response.ok) return;
    const user = await response.json().catch(() => null);
    if (!user || user.user === null) return;

    let badge = document.getElementById("me");
    if (!badge) {
      badge = document.createElement("aside");
      badge.id = "me";
    }

    badge.classList.remove("section-card");
    badge.classList.add("current-user-compact");
    badge.innerHTML = `
      <h3>Current User</h3>
      <p><b>Name:</b> <span id="me-name"></span></p>
      <p><b>Email:</b> <span id="me-email"></span></p>
    `;
    badge.querySelector("#me-name").textContent = user.name || user.first_name || "Unknown";
    badge.querySelector("#me-email").textContent = user.email || "";

    const row = languageToggle.parentElement;
    row.classList.add("language-user-row");
    row.appendChild(badge);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeLanguageUserRow, { once: true });
  } else {
    initializeLanguageUserRow();
  }
})();
