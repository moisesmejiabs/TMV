function shareCourseOnFacebook(e) {
  console.log("🚀 shareCourseOnFacebook CALLED");

  try {
    e.preventDefault();

    // Extract course id from current URL
    const params = new URLSearchParams(window.location.search);
    const courseId = params.get("id");

    if (!courseId) {
      console.error("❌ No course id found in URL");
      return;
    }

    console.log("🔍 Course ID:", courseId);

    // Build OG route URL (this is what Facebook will scrape)
    const ogUrl = `${window.location.origin}/courseog?id=${encodeURIComponent(courseId)}`;
    console.log("🌐 OG URL (for Facebook):", ogUrl);

    // Encode for Facebook share dialog
    const encodedUrl = encodeURIComponent(ogUrl);
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;

    console.log("📤 Facebook Share URL:", fbUrl);

    window.open(fbUrl, "_blank", "width=600,height=400");

  } catch (err) {
    console.error("❌ Error in shareCourseOnFacebook:", err);
  }
}

function shareEventOnFacebook(e) {
  console.log("🚀 shareEventOnFacebook CALLED");

  try {
    e.preventDefault();

    const params = new URLSearchParams(window.location.search);
    const eventId = params.get("id");

    if (!eventId) {
      console.error("❌ No event id found in URL");
      return;
    }

    const ogUrl = `${window.location.origin}/eventog?id=${encodeURIComponent(eventId)}`;
    const encodedUrl = encodeURIComponent(ogUrl);
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;

    window.open(fbUrl, "_blank", "width=600,height=400");
  } catch (err) {
    console.error("❌ Error in shareEventOnFacebook:", err);
  }
}

function shareWorkshopOnFacebook(e) {
  console.log("🚀 shareWorkshopOnFacebook CALLED");

  try {
    e.preventDefault();

    const params = new URLSearchParams(window.location.search);
    const workshopId = params.get("id");

    if (!workshopId) {
      console.error("❌ No workshop id found in URL");
      return;
    }

    const ogUrl = `${window.location.origin}/workshopog?id=${encodeURIComponent(workshopId)}`;
    const encodedUrl = encodeURIComponent(ogUrl);
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;

    window.open(fbUrl, "_blank", "width=600,height=400");
  } catch (err) {
    console.error("❌ Error in shareWorkshopOnFacebook:", err);
  }
}
