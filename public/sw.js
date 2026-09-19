/* 必办 Service Worker —— 最小可用、保守缓存策略
 * 目标：满足 PWA 安装条件（manifest + 图标 + SW + fetch 处理器），并提供基础离线能力。
 * 原则：不拦截 API、企微校验文件、RSC 请求与 Next 脚本，避免破坏应用路由与热更新。
 */
const CACHE = "bidao-v1";

/* 预缓存：仅静态资源，逐个 try，失败不阻断安装 */
const PRECACHE = ["/manifest.json", "/icon-192.png", "/icon-512.png"];

/* 可缓存的静态后缀 */
const STATIC_RE = /\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf)$/i;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            const res = await fetch(new Request(url, { cache: "reload" }));
            if (res && res.ok) await cache.put(url, res);
          } catch {
            /* 单个资源失败忽略 */
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  // 只处理同源请求
  if (url.origin !== self.location.origin) return;
  // 绝不拦截：接口、企微校验文件
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/WW_verify_")) return;

  // 导航请求：网络优先，离线回退缓存
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("/", copy)).catch(() => {});
          }
          return res;
        } catch {
          const cached = (await caches.match("/")) || (await caches.match(req));
          return (
            cached ||
            new Response("离线中，请联网后重试。", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }
      })()
    );
    return;
  }

  // 静态资源：缓存优先（命中即返回，未命中则请求并回填）
  if (STATIC_RE.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        } catch {
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // 其余请求（_next 脚本、RSC 数据等）交给浏览器默认处理
});
