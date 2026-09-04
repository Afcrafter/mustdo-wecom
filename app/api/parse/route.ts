import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { upsert } from "@/lib/store";
import type { Reminder } from "@/lib/types";
import { parseTasks, siliconflowConfigured } from "@/lib/parse";

export const runtime = "nodejs";

/** 一句话/一段话 → 识别成 N 条提醒并直接写入名单 */
export async function POST(req: NextRequest) {
  const userid = currentUserId();
  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const text = (body.text || "").trim();
  if (!text) return NextResponse.json({ error: "写点什么再发送" }, { status: 400 });

  const { tasks, llm } = await parseTasks(text);

  const saved: Reminder[] = [];
  for (const t of tasks) {
    if (!t.title) continue;
    const item: Reminder = {
      id: crypto.randomUUID().slice(0, 12),
      userid,
      title: t.title,
      note: t.note,
      remindAt: t.remindAt,
      intervalMinutes: Math.max(0, t.intervalMinutes || 0),
      nextFireAt: t.remindAt,
      enabled: true,
      lastFiredAt: null,
      tag: t.tag && t.tag !== "其他" ? t.tag : undefined,
    };
    await upsert(item);
    saved.push(item);
  }

  return NextResponse.json({
    ok: true,
    engine: llm ? "siliconflow" : "local",
    llmConfigured: siliconflowConfigured(),
    count: saved.length,
    items: saved,
  });
}
