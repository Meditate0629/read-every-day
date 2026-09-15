/* 离线缓存：第一次打开之后，没网也能用
 * 只在 https 下注册（见 index.html 里的判断），本地预览不走这里，免得缓存挡着改代码。
 * 改了东西要发布时，把下面的版本号 +1 就行。
 */
const CACHE = 'dushu-mobile-v4';
const PRECACHE = [
  './', './index.html',
  './app.css',
  './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png',
  './manifest.webmanifest',
  './util.js', './store.js', './backup.js', './data.js',
  './pdf.js', './share.js', './timer.js', './reminders.js',
  './pages.js', './pages.plan.js', './pages.home.js',
  './pages.notes.js', './pages.timer.js', './pages.reminders.js',
  './pages.share.js', './palette.js', './selftest.js', './main.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
      .catch(function () { })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;      // 别人的东西不管

  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () { });
        }
        return res;
      }).catch(function () {
        // 没网又没缓存：导航请求就退回首页
        if (req.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
