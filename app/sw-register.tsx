"use client";

import { useEffect } from "react";

/**
 * 注册 Service Worker（仅生产环境）。
 * 开发环境不注册，避免缓存干扰 HMR。
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* 注册失败不影响主流程 */
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
