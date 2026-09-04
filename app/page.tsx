"use client";

import { useEffect, useRef, useState } from "react";
import type { Reminder } from "@/lib/types";

type Me = {
  userid: string;
  wecomReady: boolean;
  llm: boolean;
  needOAuth?: boolean;
  oauth?: string;
  setup: { filled: Record<string, boolean>; kvReady: boolean };
};

type Msg = { kind: "ok" | "err"; text: string } | null;

const TAG_COLORS: Record<string, string> = {
  工作: "#6ea8fe",
  学习: "#b197fc",
  财务: "#ffa94d",
  健康: "#63e6be",
  生活: "#faa2c1",
  其他: "#8fa3b8",
};

const EXAMPLES = [
  "明天上午 9 点交创新学分证明（学院办公室 301）",
  "下午 3 点开会，每 30 分钟催我一次",
  "每周一早上发周报",
  "每 2 小时提醒我站起来喝水",
];

function fmtTime(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  const hm = `${p(d.getHours())}:${p(d.getMinutes())}`;
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(d) - start(today)) / 86400000);
  if (diff === 0) return `今天 ${hm}`;
  if (diff === 1) return `明天 ${hm}`;
  if (diff === 2) return `后天 ${hm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

function ivLabel(min: number): string {
  if (!min) return "一次";
  if (min % 10080 === 0) return min === 10080 ? "每周" : `每 ${min / 10080} 周`;
  if (min % 1440 === 0) return min === 1440 ? "每天" : `每 ${min / 1440} 天`;
  if (min % 60 === 0) return min === 60 ? "每小时" : `每 ${min / 60} 小时`;
  return `每 ${min} 分钟`;
}

function sortByTime(list: Reminder[]): Reminder[] {
  return [...list].sort((a, b) => a.nextFireAt.localeCompare(b.nextFireAt));
}

export default function Page() {
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<Reminder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (async () => {
      const [a, b] = await Promise.all([fetch("/api/me").then((r) => r.json()), fetch("/api/items").then((r) => r.json())]);
      setMe(a);
      setItems(b.items || []);
      setLoaded(true);
      // 在企微客户端内打开且尚未授权 → 自动走 OAuth 绑定身份（避免普通浏览器误跳）
      if (a?.needOAuth && a.oauth && /wxwork/i.test(navigator.userAgent)) {
        window.location.replace(a.oauth);
      }
    })();
  }, []);

  function grow() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  async function reload() {
    const b = await fetch("/api/items").then((r) => r.json());
    setItems(b.items || []);
  }

  async function doSend(raw?: string) {
    const t = (raw ?? text).trim();
    if (!t || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t }),
      });
      const j = await r.json();
      if (!r.ok || j.error) {
        setMsg({ kind: "err", text: j.error || "识别失败，稍后再试" });
        return;
      }
      setText("");
      if (taRef.current) taRef.current.style.height = "auto";
      const added: Reminder[] = j.items || [];
      setItems((prev) => sortByTime([...added, ...prev]));
      setFresh(new Set(added.map((x: Reminder) => x.id)));
      window.setTimeout(() => setFresh(new Set()), 6000);
      setMsg({
        kind: "ok",
        text: `${j.engine === "siliconflow" ? "硅基流动 · DeepSeek V4 Flash" : "本地规则"}拆出 ${j.count} 条，已进名单`,
      });
    } catch {
      setMsg({ kind: "err", text: "网络错误，没发出去" });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(it: Reminder) {
    await fetch(`/api/items/${it.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !it.enabled }),
    });
    await reload();
  }

  async function drop(it: Reminder) {
    if (!window.confirm(`删掉「${it.title}」？`)) return;
    await fetch(`/api/items/${it.id}`, { method: "DELETE" });
    await reload();
  }

  const next = items.find((x) => x.enabled);
  const missingKeys = me ? Object.entries(me.setup.filled).filter(([, v]) => !v).map(([k]) => k) : [];

  return (
    <main className="shell">
      {/* ── 顶栏 ── */}
      <header className="topbar">
        <div className="brand">
          必办 <span className="dot">·</span>
          <small>企业微信到点提醒</small>
        </div>
        {next && (
          <div className="stat">
            {items.length} 条提醒 · 最近一条 {fmtTime(next.nextFireAt)}
          </div>
        )}
      </header>

      {/* ── 未授权提示条 ── */}
      {me?.needOAuth && (
        <div
          style={{
            maxWidth: 640,
            margin: "10px auto 0",
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,179,71,.45)",
            background: "rgba(255,179,71,.08)",
            color: "#ffd9a0",
            fontSize: 13,
            lineHeight: 1.6,
            textAlign: "center",
          }}
        >
          还没绑定企微身份，提醒无法推给你。
          {me.oauth ? (
            <a
              href={me.oauth}
              style={{ color: "#ffb347", fontWeight: 600, marginLeft: 6, textDecoration: "underline" }}
            >
              去授权 →
            </a>
          ) : null}
          <div style={{ opacity: 0.7, fontSize: 12, marginTop: 4 }}>
            提示：请在「企业微信」客户端内打开本页并点授权（普通浏览器无法完成企微 OAuth）
          </div>
        </div>
      )}

      {/* ── 透明对话框 ── */}
      <section className="composer">
        <textarea
          ref={taRef}
          rows={1}
          value={text}
          disabled={busy}
          onChange={(e) => {
            setText(e.target.value);
            grow();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              doSend();
            }
          }}
          placeholder="一句话说出要办的事，回车自动拆成提醒板块。例如：明天上午 9 点交创新学分证明，每 30 分钟催一次……"
        />
        <div className="composerBar">
          <div className="left">
            {busy ? (
              <span className="thinking">拆板块中…</span>
            ) : msg ? (
              <span className={msg.kind === "ok" ? "msgOk" : "msgErr"}>{msg.text}</span>
            ) : (
              <span className="hint">Enter 发送 · Shift+Enter 换行</span>
            )}
          </div>
          <button className="send" disabled={busy || !text.trim()} onClick={() => doSend()} title="识别并写入">
            ➤
          </button>
        </div>
      </section>

      {/* ── 提醒板块列表 ── */}
      {items.length > 0 && (
        <div className="listHead">
          <h2>提醒板块</h2>
          <span>{items.length} 条</span>
        </div>
      )}

      <section className="blocks">
        {items.map((it) => {
          const color = TAG_COLORS[it.tag || ""] || TAG_COLORS["其他"];
          return (
            <article key={it.id} className={["block", fresh.has(it.id) ? "fresh" : "", !it.enabled ? "paused" : ""].join(" ")}>
              <span className="rail" style={{ background: color }} />
              <div className="blockMain">
                <div className="blockTop">
                  <span className="tag" style={{ color }}>
                    {it.tag || "提醒"}
                  </span>
                  <span className="time">⏰ {fmtTime(it.nextFireAt)}</span>
                  <span className="iv">{ivLabel(it.intervalMinutes)}</span>
                  {!it.enabled && <span className="off">已暂停</span>}
                </div>
                <b className="title">{it.title}</b>
                {it.note && <p className="note">{it.note}</p>}
              </div>
              <div className="acts">
                <button className="iconBtn" title={it.enabled ? "暂停" : "恢复"} onClick={() => toggle(it)}>
                  {it.enabled ? "⏸" : "▶"}
                </button>
                <button className="iconBtn danger" title="删除" onClick={() => drop(it)}>
                  ✕
                </button>
              </div>
            </article>
          );
        })}
      </section>

      {/* ── 空状态 ── */}
      {loaded && items.length === 0 && (
        <section className="empty">
          <p className="big">今天想提醒自己什么？</p>
          <p className="sub">点一下示例直接试，也可以自己写一句</p>
          <div className="examples">
            {EXAMPLES.map((ex) => (
              <button key={ex} className="chip" onClick={() => doSend(ex)}>
                {ex}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── 页脚 ── */}
      <footer>
        {me && (
          <span className="engine">
            {me.llm ? "识别引擎 · 硅基流动 DeepSeek V4 Flash" : "识别引擎 · 本地规则（.env.local 填 SILICONFLOW_API_KEY 即启用 AI）"}
          </span>
        )}
        {!me?.wecomReady && <span className="muted"> · 未接企业微信，先本地体验</span>}
        {me && me.setup.filled && (
          <details className="setup">
            <summary>环境变量检查（部署用）</summary>
            <ul>
              {Object.entries(me.setup.filled).map(([k, v]) => (
                <li key={k} className={v ? "ok" : "no"}>
                  {v ? "已填" : "空着"} · {k}
                </li>
              ))}
            </ul>
            {missingKeys.length > 0 && <p className="muted">本地演示无需理会；要接企业微信提醒才需要补齐。</p>}
          </details>
        )}
      </footer>
    </main>
  );
}
