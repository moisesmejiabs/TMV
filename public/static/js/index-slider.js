(function () {
  "use strict";

  const MAX_IMAGES = 10;

  let currentIndex = 0;
  let autoTimer = null;

  document.addEventListener("DOMContentLoaded", initSlider);

  async function initSlider() {
    console.log("🟢 index-slider.js loaded");

    const slidesEl = document.getElementById("slides-container");
    if (!slidesEl) {
      console.log("❌ slides container not found");
      return;
    }

    try {
      const images = await fetchImagesFromServer();

      console.log("📦 images from server =", images.length);

      if (!images.length) {
        slidesEl.innerHTML = "<p>No images available</p>";
        return;
      }

      renderImages(slidesEl, images);
      setupControls();
      startAutoSlide();
    } catch (err) {
      console.error("❌ initSlider error:", err);
      slidesEl.innerHTML = "<p>Unable to load images.</p>";
    }
  }

  async function fetchImagesFromServer() {
    console.log("🌐 index-slider fetchImagesFromServer CALLED");

    const r = await fetch("/api/slider-images", {
      credentials: "include"
    });

    if (!r.ok) {
      throw new Error(`Failed to fetch slider images: ${r.status}`);
    }

    const data = await r.json();
    console.log("📦 index-slider server data =", data);

    const rows = Array.isArray(data) ? data : [];

    return rows
      .map((img, index) => ({
        id: img.id,
        position: typeof img.position === "number" ? img.position : index,
        src:
          img.url ||
          img.originalSrc ||
          img.src ||
          (img.id ? `/api/media/${img.id}` : ""),
        alt: img.alt || img.original_name || img.name || `Slide ${index + 1}`
      }))
      .filter((img) => !!img.src)
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .slice(0, MAX_IMAGES);
  }

  function renderImages(container, images) {
    container.innerHTML = "";

    images.forEach((imgData, i) => {
      const img = document.createElement("img");
      img.src = imgData.src;
      img.alt = imgData.alt || `Slide ${i + 1}`;
      img.loading = "lazy";
      img.dataset.mediaId = imgData.id != null ? String(imgData.id) : "";
      container.appendChild(img);
    });

    currentIndex = 0;
    updatePosition();
  }

  function updatePosition() {
    const slides = document.getElementById("slides-container");
    if (!slides) return;

    const total = slides.children.length;

    if (!total) return;

    if (currentIndex < 0) currentIndex = total - 1;
    if (currentIndex >= total) currentIndex = 0;

    slides.style.transform = `translateX(-${currentIndex * 100}%)`;
  }

  function next() {
    currentIndex++;
    updatePosition();
  }

  function prev() {
    currentIndex--;
    updatePosition();
  }

  function setupControls() {
    document.querySelector(".next")?.addEventListener("click", () => {
      stopAuto();
      next();
      startAutoSlide();
    });

    document.querySelector(".prev")?.addEventListener("click", () => {
      stopAuto();
      prev();
      startAutoSlide();
    });
  }

  function startAutoSlide() {
    stopAuto();
    autoTimer = setInterval(next, 4000);
  }

  function stopAuto() {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
  }
})();