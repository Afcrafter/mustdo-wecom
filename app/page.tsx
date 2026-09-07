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

/** 分类页顺序：按调色板固定顺序展示，只出现有条目的分类 */
const TAG_ORDER = ["工作", "学习", "财务", "健康", "生活", "其他"];

type SortMode = "time" | "newest" | "oldest";

const SORT_OPTIONS: { key: SortMode; label: string; title: string }[] = [
  { key: "time", label: "⏰ 提醒时间", title: "离下次提醒近的排前面" },
  { key: "newest", label: "🆕 最近添加", title: "刚写入的排最前面" },
  { key: "oldest", label: "🕘 最早添加", title: "按写入先后，先写的排前面" },
];

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

/** 排序：time=下次提醒先后；newest/oldest=写入时间（老数据没有时间戳时：最新降序排最后 / 最早升序排最前） */
function sortItems(list: Reminder[], mode: SortMode): Reminder[] {
  const arr = [...list];
  if (mode === "newest") {
    return arr.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }
  if (mode === "oldest") {
    return arr.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  }
  return arr.sort((a, b) => a.nextFireAt.localeCompare(b.nextFireAt));
}

export default function Page() {
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<Reminder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [authErr, setAuthErr] = useState<string>("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<string>("全部"); // 全部 | 分类名（工作/学习/…）
  const [sortMode, setSortMode] = useState<SortMode>("time");
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("oauth") === "fail" && sp.get("why")) {
      setAuthErr(`授权失败：${sp.get("why")}`);
    } else if (sp.get("oauth") === "nocode") {
      setAuthErr("授权未完成（企微未返回 code）——请在企微客户端内重试");
    }
    (async () => {
      const [a, b] = await Promise.all([fetch("/api/me").then((r) => r.json()), fetch("/api/items").then((r) => r.json())]);
      setMe(a);
      setItems(b.items || []);
      setLoaded(true);
      // 支持 ?cat=分类&sort=time|newest|oldest 作为初始状态（便于直达/分享）
      const cat = sp.get("cat");
      if (cat === "全部" || TAG_ORDER.includes(cat || "")) setFilter(cat as string);
      const srt = sp.get("sort");
      if (srt === "time" || srt === "newest" || srt === "oldest") setSortMode(srt);
      // 在企微客户端内打开且尚未授权 → 自动走 OAuth（sessionStorage 限一次，避免授权未完成时死循环）
      if (a?.needOAuth && a.oauth && /wxwork/i.test(navigator.userAgent) && !sessionStorage.getItem("oauth_tried")) {
        sessionStorage.setItem("oauth_tried", "1");
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

  // 当前分类被删光 / 列表只剩 1 条时，自动回到“全部”，避免卡在空筛选上
  useEffect(() => {
    if (filter !== "全部" && !items.some((it) => (it.tag || "其他") === filter)) setFilter("全部");
    if (items.length <= 1 && filter !== "全部") setFilter("全部");
  }, [items, filter]);

  // 把筛选/排序写回 URL（replaceState 不刷新页面），刷新或分享不丢状态
  useEffect(() => {
    const u = new URL(window.location.href);
    if (filter !== "全部") u.searchParams.set("cat", filter);
    else u.searchParams.delete("cat");
    if (sortMode !== "time") u.searchParams.set("sort", sortMode);
    else u.searchParams.delete("sort");
    window.history.replaceState(null, "", u.toString());
  }, [filter, sortMode]);

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
      setItems((prev) => sortItems([...added, ...prev], sortMode));
      // 新条目不在当前分类下时，自动切回“全部”让它能被看到
      setFilter((cur) => {
        if (cur === "全部") return cur;
        const anyMatch = added.some((x: Reminder) => (x.tag || "其他") === cur);
        return anyMatch ? cur : "全部";
      });
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
  // 分类页签：全部 + 有条目的分类（含数量，随数据自动增减）
  const tagCount = new Map<string, number>();
  for (const it of items) {
    const k = it.tag || "其他";
    tagCount.set(k, (tagCount.get(k) || 0) + 1);
  }
  const tabs = [
    { key: "全部", count: items.length },
    ...TAG_ORDER.filter((t) => (tagCount.get(t) || 0) > 0).map((t) => ({ key: t, count: tagCount.get(t) || 0 })),
  ];
  const shown = sortItems(
    items.filter((it) => filter === "全部" || (it.tag || "其他") === filter),
    sortMode
  );
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

      {/* ── 授权错误条 ── */}
      {authErr && (
        <div
          style={{
            maxWidth: 640,
            margin: "10px auto 0",
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,99,99,.5)",
            background: "rgba(255,99,99,.1)",
            color: "#ffb4b4",
            fontSize: 13,
            lineHeight: 1.6,
            wordBreak: "break-all",
          }}
        >
          {authErr}
        </div>
      )}

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
          <span>
            {shown.length}/{items.length} 条
          </span>
        </div>
      )}

      {/* ── 分类页签 + 排序 ── */}
      {items.length > 1 && (
        <div className="toolbar">
          <div className="tabs">
            {tabs.map((t) => (
              <button
                key={t.key}
                className={["pill", filter === t.key ? "active" : ""].join(" ")}
                onClick={() => setFilter(t.key)}
              >
                {t.key}
                <i className="cnt">{t.count}</i>
              </button>
            ))}
          </div>
          <div className="sorts">
            {SORT_OPTIONS.map((s) => (
              <button
                key={s.key}
                title={s.title}
                className={["pill", "sort", sortMode === s.key ? "active" : ""].join(" ")}
                onClick={() => setSortMode(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <section className="blocks">
        {shown.map((it) => {
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
