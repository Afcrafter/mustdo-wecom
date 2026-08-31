"use client";

import { useEffect, useMemo, useState } from "react";
import { INTERVALS, type Reminder } from "@/lib/types";

type Me = {
  userid: string;
  wecomReady: boolean;
  needOAuth: boolean;
  oauth: string;
  setup: { filled: Record<string, boolean>; kvReady: boolean; verifyFileReady: boolean };
};

function toLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmt(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function Page() {
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<Reminder[]>([]);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [remindAt, setRemindAt] = useState(toLocalInput(new Date(Date.now() + 3600_000).toISOString()));
  const [interval, setInterval] = useState(0);
  const [customMin, setCustomMin] = useState(120);

  async function reload() {
    const [a, b] = await Promise.all([fetch("/api/me").then((r) => r.json()), fetch("/api/items").then((r) => r.json())]);
    setMe(a);
    setItems(b.items || []);
  }

  useEffect(() => {
    reload();
  }, []);

  const intervalMinutes = interval === -1 ? Math.max(1, customMin) : interval;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        note,
        remindAt: new Date(remindAt).toISOString(),
        intervalMinutes,
      }),
    });
    setTitle("");
    setNote("");
    await reload();
  }

  async function toggle(it: Reminder) {
    await fetch(`/api/items/${it.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !it.enabled }),
    });
    await reload();
  }

  async function drop(id: string) {
    await fetch(`/api/items/${id}`, { method: "DELETE" });
    await reload();
  }

  const missing = useMemo(() => {
    if (!me) return [];
    return Object.entries(me.setup.filled)
      .filter(([, v]) => !v)
      .map(([k]) => k);
  }, [me]);

  return (
    <main>
      <h1>必办时间表</h1>
      <p className="sub">写进名单，到点由企业微信应用消息催你。间隔自己定。</p>

      {me && !me.setup.kvReady && (
        <div className="card muted">本地可用文件存储。部署到 Vercel 后请加上 Upstash Redis 两个变量，否则提醒名单无法跨实例保存。</div>
      )}

      <form className="card" onSubmit={add}>
        <label>要提醒的事</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：交创新学分证明 / 续费 Spotify" required />
        <label>备注（可选）</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="链接、找谁、交到哪里" />
        <div className="row">
          <div>
            <label>第一次提醒时间</label>
            <input type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} required />
          </div>
          <div>
            <label>之后隔多久再催</label>
            <select value={interval} onChange={(e) => setInterval(Number(e.target.value))}>
              {INTERVALS.map((x) => (
                <option key={x.minutes} value={x.minutes}>
                  {x.label}
                </option>
              ))}
              <option value={-1}>自定义分钟</option>
            </select>
          </div>
        </div>
        {interval === -1 && (
          <>
            <label>自定义间隔（分钟）</label>
            <input type="number" min={1} value={customMin} onChange={(e) => setCustomMin(Number(e.target.value))} />
          </>
        )}
        <button type="submit">写入名单</button>
      </form>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>事项</th>
              <th>下次提醒</th>
              <th className="hide-sm">间隔</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>
                  <b>{it.title}</b>
                  <div className="muted">{it.note}</div>
                  {!it.enabled && <span className="badge">已停</span>}
                </td>
                <td>{fmt(it.nextFireAt)}</td>
                <td className="hide-sm">{it.intervalMinutes ? `每 ${it.intervalMinutes} 分钟` : "一次"}</td>
                <td>
                  <button className="ghost" type="button" onClick={() => toggle(it)}>
                    {it.enabled ? "暂停" : "恢复"}
                  </button>
                  <button className="danger" type="button" onClick={() => drop(it.id)}>
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && <div className="empty">名单是空的。先加一条，再在企业微信后台把应用主页指到这个网站。</div>}
      </div>

      <div className="card setup">
        <b>环境变量（Vercel 填写，仓库里留空）</b>
        <ul>
          {me &&
            Object.entries(me.setup.filled).map(([k, v]) => (
              <li key={k} className={v ? "ok" : "no"}>
                {v ? "已填" : "空着"} · {k}
              </li>
            ))}
        </ul>
        {me?.needOAuth && me.oauth && (
          <p>
            <a href={me.oauth}>在企业微信里授权身份</a>
          </p>
        )}
        {missing.length > 0 && <p className="muted">先部署，再回 Vercel 把空着的项补上，然后重新点企业微信后台的「保存」做 URL 验证。</p>}
      </div>
    </main>
  );
}
