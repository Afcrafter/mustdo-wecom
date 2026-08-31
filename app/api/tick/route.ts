import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { sendRemind } from "@/lib/wecom-api";
import { get, listDue, upsert } from "@/lib/store";

export const runtime = "nodejs";

function authorized(req: NextRequest): boolean {
  const secret = env("CRON_SECRET");
  if (!secret) return true;
  const header = req.headers.get("authorization") || "";
  const q = req.nextUrl.searchParams.get("secret") || "";
  return header === `Bearer ${secret}` || q === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const now = new Date();
  const due = await listDue(now.toISOString());
  const sent: string[] = [];
  const errors: string[] = [];
  const base = env("APP_BASE_URL") || req.nextUrl.origin;

  for (const item of due) {
    try {
      await sendRemind(
        item.userid,
        `提醒：${item.title}`,
        `${item.note || "到点了，打开时间表看下一步。"}\n间隔：${item.intervalMinutes ? `每 ${item.intervalMinutes} 分钟` : "仅一次"}`,
        base
      );
      const latest = (await get(item.id)) || item;
      latest.lastFiredAt = now.toISOString();
      if (latest.intervalMinutes > 0) {
        latest.nextFireAt = new Date(now.getTime() + latest.intervalMinutes * 60 * 1000).toISOString();
      } else {
        latest.enabled = false;
      }
      await upsert(latest);
      sent.push(item.id);
    } catch (err) {
      errors.push(`${item.id}: ${err instanceof Error ? err.message : "send fail"}`);
    }
  }
  return NextResponse.json({ ok: true, checked: due.length, sent, errors, at: now.toISOString() });
}
