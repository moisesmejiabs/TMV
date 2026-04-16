(function () {
  "use strict";

  const DB_NAME = "tmv_slider_db";
  const DB_VERSION = 1;
  const STORE_NAME = "slider_images";
  const MAX_IMAGES = 10;

  document.addEventListener("DOMContentLoaded", initMediaPage);

  async function initMediaPage() {
    console.log("🟢 media.js loaded");

    const uploadInput = document.getElementById("slider-images");
    const uploadBtn = document.getElementById("upload-images-btn");
    const statusEl = document.getElementById("image-upload-status");
    const listEl = document.getElementById("current-images-list");

    if (!uploadInput || !uploadBtn || !statusEl || !listEl) {
      console.log("⚠️ Required media elements not found.");
      return;
    }

    try {
      const isAdmin = await detectAdmin();

      if (!isAdmin) {
        statusEl.textContent = "Admin access required.";
        uploadInput.disabled = true;
        uploadBtn.disabled = true;
        return;
      }

      await openDb();
      await refreshImageList();

      uploadBtn.addEventListener("click", handleUpload);
    } catch (err) {
      console.error("❌ initMediaPage failed:", err);
      statusEl.textContent = "Failed to initialize media page.";
    }
  }

  async function detectAdmin() {
    try {
      if (window.IS_ADMIN === true) return true;

      const r = await fetch("/api/me", { credentials: "include" });
      if (!r.ok) return false;

      const me = await r.json().catch(() => null);
      return me && me.role === "admin";
    } catch {
      return false;
    }
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      if (window.__tmvMediaDb) return resolve(window.__tmvMediaDb);

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function (event) {
        const db = event.target.result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: "id",
            autoIncrement: true
          });

          store.createIndex("position", "position", { unique: true });
        }
      };

      request.onsuccess = function () {
        window.__tmvMediaDb = request.result;
        resolve(request.result);
      };

      request.onerror = () => reject(request.error);
    });
  }

  function getDb() {
    return window.__tmvMediaDb;
  }

  function clearLocalCache() {
    return new Promise((resolve, reject) => {
      const db = getDb();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  function addImageRecord(record) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.add(record);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // 🚀 UPDATED UPLOAD
async function handleUpload() {
  const input = document.getElementById("slider-images");
  const statusEl = document.getElementById("image-upload-status");

  const files = input && input.files ? Array.from(input.files) : [];

  if (!files.length) {
    if (statusEl) statusEl.textContent = "Please choose at least one image.";
    return;
  }

  try {
    const currentImages = await fetchImagesFromServer();
    const remaining = MAX_IMAGES - currentImages.length;

    console.log("📦 Current images:", currentImages.length);
    console.log("📦 Selected files:", files.length);
    console.log("📦 Remaining slots:", remaining);

    if (remaining <= 0) {
      if (statusEl) statusEl.textContent = `Maximum total images reached (${MAX_IMAGES}).`;
      return;
    }

    if (files.length > remaining) {
      if (statusEl) {
        statusEl.textContent = `You can upload only ${remaining} more image(s). Maximum total is ${MAX_IMAGES}.`;
      }
      return;
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (!file.type.startsWith("image/")) {
        if (statusEl) statusEl.textContent = `File "${file.name}" is not an image.`;
        return;
      }

      console.log("📤 Uploading:", file.name);

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
        console.error("❌ Failed to parse upload response JSON:", jsonErr);
        throw new Error(`Upload failed for "${file.name}" with status ${r.status}`);
      }

      console.log("📥 Upload result:", result);

      if (!r.ok || !result.ok) {
        throw new Error(result?.error || `Upload failed for "${file.name}"`);
      }
    }

    input.value = "";
    if (statusEl) statusEl.textContent = "Images uploaded successfully.";

    await refreshImageList();
  } catch (err) {
    console.error("❌ handleUpload failed:", err);
    if (statusEl) statusEl.textContent = err.message || "Image upload failed.";
  }
}

  async function fetchImagesFromServer() {
    console.log("🌐 fetchImagesFromServer CALLED");

    const r = await fetch("/api/slider-images", {
      credentials: "include"
    });

    if (!r.ok) {
      throw new Error(`Failed to fetch images: ${r.status}`);
    }

    const data = await r.json();
    console.log("📦 fetchImagesFromServer result:", data);

    return Array.isArray(data) ? data : [];
  }

  // 🚀 UPDATED LIST (SERVER FIRST)
  async function refreshImageList() {
    const listEl = document.getElementById("current-images-list");
    const statusEl = document.getElementById("image-upload-status");

    if (!listEl) return;

    try {
      console.log("🌐 Fetching images from backend");

      const r = await fetch("/api/slider-images", {
        credentials: "include"
      });

      const images = await r.json();

      console.log("📦 Server images:", images);

      listEl.innerHTML = "";

      if (!images.length) {
        listEl.innerHTML = "<li>No images uploaded yet.</li>";
      } else {
        // refresh local cache
        await clearLocalCache();

        for (let i = 0; i < images.length; i++) {
          const img = images[i];

          const src =
            img.url ||
            img.originalSrc ||
            img.src ||
            (img.id ? `/api/media/${img.id}` : null);

          await addImageRecord({
            position: i,
            name: img.name || img.original_name,
            alt: img.alt || img.original_name,
            originalSrc: src,
            sourceType: "server"
          });

          const li = document.createElement("li");
          li.textContent = `${i + 1}. ${img.original_name || img.name} → ${src}`;
          listEl.appendChild(li);
        }
      }

      statusEl.textContent = `Current images: ${images.length} / ${MAX_IMAGES}`;
    } catch (err) {
      console.error("❌ refreshImageList failed:", err);
      statusEl.textContent = "Unable to load images.";
    }
  }
})();