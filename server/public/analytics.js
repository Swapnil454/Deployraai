(function () {
  const script = document.currentScript;
  if (!script) return;

  const trackingId = script.getAttribute("data-tracking-id");
  const environment = script.getAttribute("data-environment") || "production";
  if (!trackingId) return;

  // Derive the API base from the script's own src so it works in any environment
  const scriptSrc = script.src || '';
  let API_BASE = '';
  try {
    const srcUrl = new URL(scriptSrc);
    API_BASE = srcUrl.origin; // e.g. "http://localhost:5000" or "https://api.deployai.in"
  } catch (e) {
    API_BASE = 'http://localhost:5000'; // fallback for local dev
  }
  const API_URL = API_BASE + '/api/analytics/track';

  let lastPath = null;

  function sendEvent(payload) {
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          API_URL,
          new Blob([JSON.stringify(payload)], { type: "application/json" })
        );
      } else {
        fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
        });
      }
    } catch (error) {
      console.warn("[DeployAI Analytics] Failed to send event", error);
    }
  }

  function trackPageView() {
    const path = window.location.pathname;
    if (path === lastPath) return;
    lastPath = path;

    sendEvent({
      trackingId,
      eventType: "page_view",
      path: window.location.pathname,
      fullUrl: window.location.href,
      hostname: window.location.hostname,
      referrer: document.referrer || null,
      environment,
    });
  }

  function patchHistoryMethod(type) {
    const original = history[type];
    history[type] = function () {
      const result = original.apply(this, arguments);
      window.dispatchEvent(new Event("deployai-route-change"));
      return result;
    };
  }

  patchHistoryMethod("pushState");
  patchHistoryMethod("replaceState");

  window.addEventListener("popstate", trackPageView);
  window.addEventListener("deployai-route-change", trackPageView);

  window.deployaiTrack = function (eventName, metadata) {
    sendEvent({
      trackingId,
      eventType: "custom",
      eventName,
      path: window.location.pathname,
      fullUrl: window.location.href,
      hostname: window.location.hostname,
      referrer: document.referrer || null,
      environment,
      metadata: metadata || {},
    });
  };

  trackPageView();
})();
