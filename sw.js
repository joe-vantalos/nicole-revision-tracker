/* Nicole's Revision Tracker - service worker
   Strategy:
     shell (index.html)  -> stale-while-revalidate: instant launch, update lands next launch
     icons + manifest    -> cache-first (they rarely change; bump VERSION to force)
     Google Fonts        -> cache-first (URLs are versioned, so a hit is always correct)
     anything else       -> network
*/

var VERSION = "v1";
var SHELL = "shell-" + VERSION;
var FONTS = "fonts-" + VERSION;

var PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(SHELL).then(function (c) {
      return c.addAll(PRECACHE);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== SHELL && k !== FONTS) return caches.delete(k);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function isFont(url) {
  return url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
}

function tellClients(msg) {
  return self.clients.matchAll({ type: "window" }).then(function (cs) {
    cs.forEach(function (c) { c.postMessage(msg); });
  });
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url = new URL(req.url);

  // --- fonts: cache-first, versioned URLs make this safe ---
  if (isFont(url)) {
    e.respondWith(
      caches.open(FONTS).then(function (c) {
        return c.match(req).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (res) {
            if (res && (res.ok || res.type === "opaque")) c.put(req, res.clone());
            return res;
          }).catch(function () {
            return hit || Response.error();
          });
        });
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // --- the app shell: serve cached instantly, refresh in the background ---
  var isShell = req.mode === "navigate" || url.pathname.endsWith("/index.html");
  if (isShell) {
    e.respondWith(
      caches.open(SHELL).then(function (c) {
        return c.match("./index.html").then(function (hit) {
          var net = fetch("./index.html", { cache: "no-cache" }).then(function (res) {
            if (!res || !res.ok) return hit || res;
            var fresh = res.clone();
            if (hit) {
              Promise.all([hit.clone().text(), res.clone().text()]).then(function (t) {
                if (t[0] !== t[1]) tellClients({ type: "shell-updated" });
              }).catch(function () {});
            }
            c.put("./index.html", fresh);
            return res;
          }).catch(function () {
            return hit;
          });
          return hit || net;
        });
      })
    );
    return;
  }

  // --- other same-origin assets: cache-first ---
  e.respondWith(
    caches.open(SHELL).then(function (c) {
      return c.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          if (res && res.ok) c.put(req, res.clone());
          return res;
        });
      });
    })
  );
});

self.addEventListener("message", function (e) {
  if (e.data && e.data.type === "skip-waiting") self.skipWaiting();
});
