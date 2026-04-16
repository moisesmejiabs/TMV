(function () {
  "use strict";

  const MAX_IMAGES = 10;

  let currentIndex = 0;
  let sliderTimer = null;

  document.addEventListener("DOMContentLoaded", initSliderManager);

  async function initSliderManager() {
    console.log("🟢 image-slider-admin.js loaded");

    const slider = document.querySelector(".image-slider");
    const slides = slider ? slider.querySelector(".slides") : null;

    if (!slider || !slides) {
      console.log("⚠️ Slider container not found.");
      return;
    }

    try {
      await renderSlider();
      setupPrevNextButtons();
      startAutoSlide();

      const isAdmin = await detectAdmin();
      console.log("🔐 Admin detected:", isAdmin);

      if (isAdmin) {
        buildAdminUploadPanel(slider);
      }
    } catch (err) {
      console.error("❌ initSliderManager failed:", err);
    }
  }

  async function detectAdmin() {
    try {
      if (window.IS_ADMIN === true) return true;

      const bodyFlag = document.body.getAttribute("data-is-admin");
      if (bodyFlag && bodyFlag.toLowerCase() === "true") return true;

      const r = await fetch("/api/me", { credentials: "include" });
      if (!r.ok) return false;

      const me = await r.json().catch(() => null);
      if (!me) return false;

      // supports either { role: "admin" } or { user: { role: "admin" } }
      const role = (me.role || me.user?.role || "").toLowerCase();
      return role === "admin";
    } catch (err) {
      console.log("ℹ️ detectAdmin fallback used:", err);
      return false;
    }
  }

  async function fetchImagesFromServer() {
    console.log("🌐 fetchImagesFromServer CALLED");

    const r = await fetch("/api/slider-images", {
      credentials: "include"
    });

    if (!r.ok) {
      throw new Error(`Failed to fetch slider images: ${r.status}`);
    }

    const data = await r.json();
    console.log("📦 slider images from server:", data);

    const rows = Array.isArray(data) ? data : [];

    return rows
      .map((img, index) => ({
        id: img.id,
        position: typeof img.position === "number" ? img.position : index,
        name: img.name || img.original_name || `Slide ${index + 1}`,
        alt: img.alt || img.original_name || img.name || `Slide ${index + 1}`,
        originalSrc:
          img.url ||
          img.originalSrc ||
          img.src ||
          (img.id ? `/api/media/${img.id}` : ""),
        sourceType: "server"
      }))
      .filter((img) => !!img.originalSrc)
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .slice(0, MAX_IMAGES);
  }

  async function renderSlider() {
    const slides = document.querySelector(".image-slider .slides");
    if (!slides) return;

    const rows = await fetchImagesFromServer();

    slides.innerHTML = "";

    if (!rows.length) {
      slides.innerHTML = '<div class="no-slider-images">No images available</div>';
      return;
    }

    rows.forEach((row, idx) => {
      const img = document.createElement("img");
      img.src = row.originalSrc;
      img.alt = row.alt || `Slide ${idx + 1}`;
      img.loading = "lazy";
      img.dataset.mediaId = row.id != null ? String(row.id) : "";
      slides.appendChild(img);
    });

    currentIndex = 0;
    updateSliderPosition();

    console.log("✅ Slider rendered with", rows.length, "server image(s)");
  }

  function updateSliderPosition() {
    const slides = document.querySelector(".image-slider .slides");
    const total = document.querySelectorAll(".image-slider .slides img").length;

    if (!slides || !total) return;

    if (currentIndex < 0) currentIndex = total - 1;
    if (currentIndex >= total) currentIndex = 0;

    slides.style.transform = `translateX(-${currentIndex * 100}%)`;
  }

  function nextSlide() {
    currentIndex += 1;
    updateSliderPosition();
  }

  function prevSlide() {
    currentIndex -= 1;
    updateSliderPosition();
  }

  function startAutoSlide() {
    stopAutoSlide();
    sliderTimer = setInterval(() => {
      nextSlide();
    }, 4000);
  }

  function stopAutoSlide() {
    if (sliderTimer) {
      clearInterval(sliderTimer);
      sliderTimer = null;
    }
  }

  function setupPrevNextButtons() {
    const prevBtn = document.querySelector(".image-slider .prev");
    const nextBtn = document.querySelector(".image-slider .next");

    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        stopAutoSlide();
        prevSlide();
        startAutoSlide();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        stopAutoSlide();
        nextSlide();
        startAutoSlide();
      });
    }
  }

  function buildAdminUploadPanel(slider) {
    if (document.getElementById("slider-admin-panel")) return;

    const panel = document.createElement("div");
    panel.id = "slider-admin-panel";
    panel.style.marginTop = "16px";
    panel.style.padding = "16px";
    panel.style.background = "rgba(255,255,255,0.10)";
    panel.style.border = "1px solid rgba(255,255,255,0.20)";
    panel.style.borderRadius = "12px";

    panel.innerHTML = `
      <div style="display:grid; gap:10px;">
        <strong>Admin Image Upload</strong>
        <div id="slider-admin-status">Checking image count...</div>
        <input id="slider-admin-files" type="file" accept="image/*" multiple />
        <button id="slider-admin-upload" type="button" class="btn">Upload Images</button>
      </div>
    `;

    slider.insertAdjacentElement("afterend", panel);

    const uploadBtn = document.getElementById("slider-admin-upload");
    if (uploadBtn) {
      uploadBtn.addEventListener("click", handleAdminUpload);
    }

    updateAdminStatus();
  }

  async function updateAdminStatus() {
    const statusEl = document.getElementById("slider-admin-status");
    if (!statusEl) return;

    try {
      const rows = await fetchImagesFromServer();
      statusEl.textContent = `Current images: ${rows.length} / ${MAX_IMAGES}`;
    } catch (err) {
      statusEl.textContent = "Unable to read current image count.";
      console.error("❌ updateAdminStatus failed:", err);
    }
  }

  async function handleAdminUpload() {
    const input = document.getElementById("slider-admin-files");
    const files = input && input.files ? Array.from(input.files) : [];

    if (!files.length) {
      alert("Please choose at least one image.");
      return;
    }

    try {
      const rows = await fetchImagesFromServer();
      const remaining = MAX_IMAGES - rows.length;

      console.log("📦 Existing images:", rows.length);
      console.log("📦 Selected files:", files.length);
      console.log("📦 Remaining slots:", remaining);

      if (remaining <= 0) {
        alert(`Maximum total images reached (${MAX_IMAGES}).`);
        return;
      }

      if (files.length > remaining) {
        alert(`You can upload only ${remaining} more image(s). Maximum total is ${MAX_IMAGES}.`);
        return;
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (!file.type.startsWith("image/")) {
          alert(`File "${file.name}" is not an image.`);
          return;
        }

        console.log("📤 Uploading image:", file.name);

        const formData = new FormData();
        formData.append("image", file);

        const r = await fetch("/api/upload-image", {
          method: "POST",
          body: formData,
          credentials: "include"
        });

        let result = null;
        try {
          result = await r.json();
        } catch (jsonErr) {
          console.error("❌ Failed to parse upload JSON:", jsonErr);
          throw new Error(`Upload failed for "${file.name}" with status ${r.status}`);
        }

        console.log("📥 Upload result:", result);

        if (!r.ok || !result.ok) {
          throw new Error(result?.error || `Upload failed for "${file.name}"`);
        }
      }

      if (input) input.value = "";

      await renderSlider();
      await updateAdminStatus();
      alert("Images uploaded successfully.");
    } catch (err) {
      console.error("❌ handleAdminUpload failed:", err);
      alert(err.message || "Image upload failed.");
    }
  }
})();