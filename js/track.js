/* Action tracking, shared by the map (index.html) and every generated page.
 *
 * Cloudflare's Real User Monitoring counts visits but cannot record what people
 * DO, and that is the question that decides whether the site should be laid out
 * differently: do people get directions, which filters do they use, does mobile
 * go straight to List. Umami Cloud (free, cookieless, no consent banner) records
 * named events. Set UMAMI_WEBSITE_ID below to switch it on; until then track()
 * is a harmless no-op, so call sites can ship ahead of the account.
 *
 * Usage: window.hdmTrack("event-name", { optional: "data" })
 */
(function () {
  "use strict";

  var UMAMI_WEBSITE_ID = ""; // e.g. "3f1c...": from Umami Cloud > Settings > Websites
  var UMAMI_SRC = "https://cloud.umami.is/script.js";

  // Events fired before the Umami script arrives are queued, not lost.
  var queue = [];

  function send(name, data) {
    try {
      if (window.umami && typeof window.umami.track === "function") {
        window.umami.track(name, data || {});
        return true;
      }
    } catch (e) {}
    return false;
  }

  window.hdmTrack = function (name, data) {
    if (!UMAMI_WEBSITE_ID) return;
    if (!send(name, data)) queue.push([name, data]);
  };

  if (!UMAMI_WEBSITE_ID) return;

  var s = document.createElement("script");
  s.defer = true;
  s.src = UMAMI_SRC;
  s.setAttribute("data-website-id", UMAMI_WEBSITE_ID);
  s.setAttribute("data-domains", "hawaiidogmap.com");
  s.onload = function () {
    var q = queue; queue = [];
    q.forEach(function (ev) { send(ev[0], ev[1]); });
  };
  document.head.appendChild(s);

  // Clicks worth counting on any page, wired once here so the generated pages
  // need no per-link markup. Directions is the closest thing this site has to a
  // conversion: someone deciding to actually go.
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    var href = a.getAttribute("href") || "";
    var page = location.pathname;
    if (href.indexOf("google.com/maps/dir") !== -1) {
      window.hdmTrack("directions", { page: page });
    } else if (href.indexOf("google.com/maps/search") !== -1) {
      window.hdmTrack("google-maps", { page: page });
    } else if (href.indexOf("/?place=") === 0) {
      window.hdmTrack("show-on-map", { page: page });
    } else if (a.classList.contains("site-nav-cta")) {
      window.hdmTrack("open-map", { page: page });
    }
  }, true);
})();
