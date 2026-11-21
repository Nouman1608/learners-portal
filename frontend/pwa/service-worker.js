// Only public application files belong in this cache. Never cache account data.
const CACHE = __CACHE_NAME__;
const SHELL = __SHELL_HTML__;
const ASSETS = __PUBLIC_ASSETS__;
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    await cache.put('/index.html', new Response(SHELL, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(key => key.startsWith('learners-portal-shell-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('Authorization') ||
      /^\/(api|uploads)(\/|$)/.test(url.pathname)) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.status < 500) return response;
        return (await caches.match('/index.html', { cacheName: CACHE })) || response;
      } catch {
        return (await caches.match('/index.html', { cacheName: CACHE })) || Response.error();
      }
    })());
  } else if (!url.search && (ASSETS.includes(url.pathname) || /^\/assets\/[^/]+\.(js|css)$/.test(url.pathname))) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && !/private|no-store/i.test(response.headers.get('Cache-Control') || '')) await cache.put(request, response.clone());
      return response;
    })());
  }
});
