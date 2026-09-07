import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { listByUser, upsert } from "@/lib/store";
import type { Reminder } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const userid = currentUserId();
  return NextResponse.json({ items: await listByUser(userid) });
}

export async function POST(req: NextRequest) {
  const userid = currentUserId();
  const body = (await req.json()) as Partial<Reminder> & { title?: string };
  const title = (body.title || "").trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  const remindAt = body.remindAt || new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const intervalMinutes = Math.max(0, Number(body.intervalMinutes || 0));
  const item: Reminder = {
    id: crypto.randomUUID().slice(0, 12),
    userid,
    title,
    note: (body.note || "").trim(),
    remindAt,
    intervalMinutes,
    nextFireAt: remindAt,
    enabled: true,
    lastFiredAt: null,
    createdAt: new Date().toISOString(),
  };
  await upsert(item);
  return NextResponse.json({ item });
}
