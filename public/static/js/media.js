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

  async function handleUpload() {
    console.log("🚀 handleUpload ENTER");

    const input = document.getElementById("slider-images");
    const statusEl = document.getElementById("image-upload-status");
    const overwriteEl = document.getElementById("OverwriteAllow");

    console.log("🔍 input element:", input);
    console.log("🔍 statusEl element:", statusEl);
    console.log("🔍 overwriteEl element:", overwriteEl);

    const files = input && input.files ? Array.from(input.files) : [];
    console.log("📂 files array:", files);
    console.log("📂 files length:", files.length);

    if (!files.length) {
      console.warn("⚠️ No files selected");
      if (statusEl) statusEl.textContent = "Please choose at least one image.";
      return;
    }

    try {
      console.log("📡 About to call fetchImagesFromServer()");
      const currentImages = await fetchImagesFromServer();
      console.log("📥 currentImages:", currentImages);

      const overwrite = overwriteEl ? overwriteEl.checked : false;
      console.log("♻️ overwrite checked:", overwrite);

      const remaining = MAX_IMAGES - currentImages.length;

      console.log("📦 Current images:", currentImages.length);
      console.log("📦 Selected files:", files.length);
      console.log("📦 Remaining slots:", remaining);

      if (!overwrite) {
        if (remaining <= 0) {
          console.warn("❌ remaining <= 0");
          if (statusEl) statusEl.textContent = `Maximum total images reached (${MAX_IMAGES}).`;
          return;
        }

        if (files.length > remaining) {
          console.warn("❌ files.length > remaining");
          if (statusEl) {
            statusEl.textContent = `You can upload only ${remaining} more image(s). Maximum total is ${MAX_IMAGES}.`;
          }
          return;
        }
      } else {
        console.log("♻️ Overwrite enabled → skipping max-image block");
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(`📤 Processing file ${i + 1}/${files.length}:`, file.name, file.type, file.size);

        if (!file.type.startsWith("image/")) {
          console.warn("❌ Not an image:", file.name, file.type);
          if (statusEl) statusEl.textContent = `File "${file.name}" is not an image.`;
          return;
        }

        const formData = new FormData();
        formData.append("image", file);
        formData.append("overwrite", overwrite && i === 0 ? "true" : "false");

        console.log("🌐 POST /api/upload-image for:", file.name);

        const r = await fetch("/api/upload-image", {
          method: "POST",
          body: formData,
          credentials: "include"
        });

        console.log("📡 Response status for", file.name, ":", r.status);

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

      if (statusEl) {
        statusEl.textContent = overwrite
          ? "Images overwritten successfully."
          : "Images uploaded successfully.";
      }

      console.log("🔄 Refreshing image list");
      await refreshImageList();
      console.log("✅ handleUpload COMPLETE");

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