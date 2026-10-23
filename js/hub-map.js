/* Island and category hub pages: a small map of just that page's places, and
 * "Sort by distance from me", which reorders the cards nearest first.
 *
 * MapLibre (~800 KB) is fetched only once the map is close to the viewport,
 * so it never competes with the page text, which is what paints first and
 * what search engines read. Point data is inline in #hub-map's data-points
 * attribute, written by tools/build-pages.mjs: [lng, lat, url, name, offLeash].
 */
(function () {
  "use strict";

  var MAPLIBRE = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl";
  var STYLE = "https://tiles.openfreemap.org/styles/positron";
  var OFF = "#16a34a", ON = "#0284c7";

  var el = document.getElementById("hub-map");
  if (!el) return;
  var pts = [];
  try { pts = JSON.parse(el.getAttribute("data-points") || "[]"); } catch (e) {}
  var map = null;
  var meMarker = null;

  function track(name, data) {
    try { if (window.hdmTrack) window.hdmTrack(name, data); } catch (e) {}
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ---------- Map ---------- */
  function load(cb) {
    var css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = MAPLIBRE + ".css";
    document.head.appendChild(css);
    var s = document.createElement("script");
    s.src = MAPLIBRE + ".js";
    s.onload = cb;
    s.onerror = function () {
      var f = el.querySelector(".hub-map-fallback");
      if (f) f.textContent = "The map couldn't load. Every place is listed below.";
    };
    document.head.appendChild(s);
  }

  function init() {
    if (!window.maplibregl || !pts.length) return;
    var b = new maplibregl.LngLatBounds();
    pts.forEach(function (p) { b.extend([p[0], p[1]]); });
    map = new maplibregl.Map({
      container: el,
      style: STYLE,
      bounds: b,
      fitBoundsOptions: { padding: 32, maxZoom: 13 },
      // One finger scrolls the page, two pan the map: an embedded map that
      // traps the scroll on a phone is worse than no map.
      cooperativeGestures: true,
      attributionControl: { compact: true }
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    // Compact attribution ships expanded until the first interaction, which on
    // a 260px-tall map is a third of it. Start collapsed (same fix as app.js).
    var collapse = function () {
      var a = el.querySelector(".maplibregl-ctrl-attrib.maplibregl-compact");
      if (a) a.classList.remove("maplibregl-compact-show");
    };
    collapse();
    map.once("load", collapse);
    map.once("idle", collapse);
    map.on("load", function () {
      el.classList.add("is-ready");
      map.addSource("pts", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: pts.map(function (p) {
            return {
              type: "Feature",
              geometry: { type: "Point", coordinates: [p[0], p[1]] },
              properties: { url: p[2], name: p[3], off: p[4] }
            };
          })
        }
      });
      map.addLayer({
        id: "pts",
        type: "circle",
        source: "pts",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 4.5, 11, 7, 14, 9],
          "circle-color": ["case", ["==", ["get", "off"], 1], OFF, ON],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.6
        }
      });
      map.on("mouseenter", "pts", function () { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "pts", function () { map.getCanvas().style.cursor = ""; });
      map.on("click", "pts", function (e) {
        var f = e.features && e.features[0];
        if (!f) return;
        new maplibregl.Popup({ offset: 10, className: "hub-pop", maxWidth: "240px" })
          .setLngLat(f.geometry.coordinates)
          .setHTML('<a href="' + esc(f.properties.url) + '">' + esc(f.properties.name) + ' &rarr;</a>' +
            '<span class="pop-meta">' + (f.properties.off === 1 ? "Off-leash" : "Leash required") + "</span>")
          .addTo(map);
        track("hub-map-pin", { page: location.pathname });
      });
    });
  }

  var started = false;
  function start() {
    if (started) return;
    started = true;
    load(init);
  }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (en) { return en.isIntersecting; })) { io.disconnect(); start(); }
    }, { rootMargin: "300px" });
    io.observe(el);
  } else {
    start();
  }

  /* ---------- Sort by distance from me ---------- */
  var btn = document.getElementById("near-me");
  var status = document.getElementById("near-status");

  function miles(aLat, aLng, bLat, bLng) {
    var R = 3958.8, toR = Math.PI / 180;
    var dLat = (bLat - aLat) * toR, dLng = (bLng - aLng) * toR;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(aLat * toR) * Math.cos(bLat * toR) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function fmt(mi) { return mi < 10 ? mi.toFixed(1) + " mi" : Math.round(mi) + " mi"; }

  function say(text) {
    if (!status) return;
    status.textContent = text;
    status.hidden = false;
  }

  function sortBy(lat, lng) {
    var nearest = null;
    var all = [];
    document.querySelectorAll("main .grid").forEach(function (ul) {
      var items = Array.prototype.slice.call(ul.querySelectorAll(":scope > li.card[data-lat]"));
      items.forEach(function (li) {
        var d = miles(lat, lng, +li.getAttribute("data-lat"), +li.getAttribute("data-lng"));
        li._d = d;
        var meta = li.querySelector(".card-meta");
        var tag = li.querySelector(".card-dist");
        if (!tag && meta) {
          tag = document.createElement("span");
          tag.className = "card-dist";
          meta.appendChild(tag);
        }
        if (tag) tag.textContent = fmt(d);
        if (!nearest || d < nearest.d) nearest = { d: d, li: li };
        all.push(li);
      });
      items.sort(function (a, b) { return a._d - b._d; }).forEach(function (li) { ul.appendChild(li); });
    });
    if (!nearest) return;
    var name = nearest.li.querySelector("strong");
    if (nearest.d > 60) {
      say("You're about " + fmt(nearest.d) + " from the closest place on this page, so these are sorted nearest first from wherever you are.");
    } else {
      say("Sorted nearest first. Closest: " + (name ? name.textContent : "") + ", " + fmt(nearest.d) + " away.");
    }
    if (map && window.maplibregl && nearest.d <= 60) {
      if (!meMarker) {
        var dot = document.createElement("div");
        dot.className = "hub-me";
        dot.setAttribute("aria-label", "Your location");
        meMarker = new maplibregl.Marker({ element: dot }).setLngLat([lng, lat]).addTo(map);
      } else {
        meMarker.setLngLat([lng, lat]);
      }
      // Frame you plus your five nearest, not just the closest one: that's
      // the "what's around me" view, and it doesn't zoom to rooftop level.
      var b = new maplibregl.LngLatBounds([lng, lat], [lng, lat]);
      all.sort(function (a, c) { return a._d - c._d; }).slice(0, 5).forEach(function (li) {
        b.extend([+li.getAttribute("data-lng"), +li.getAttribute("data-lat")]);
      });
      map.fitBounds(b, { padding: 40, maxZoom: 12, duration: 800 });
    }
  }

  if (btn) {
    if (!("geolocation" in navigator)) {
      btn.hidden = true;
    } else {
      btn.addEventListener("click", function () {
        btn.disabled = true;
        say("Finding you…");
        navigator.geolocation.getCurrentPosition(function (pos) {
          btn.disabled = false;
          sortBy(pos.coords.latitude, pos.coords.longitude);
          track("near-me", { page: location.pathname });
        }, function () {
          btn.disabled = false;
          say("Couldn't get your location. Check that location access is allowed for this site.");
        }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
      });
    }
  }
})();
