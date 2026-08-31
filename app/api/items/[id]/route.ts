import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { get, remove, upsert } from "@/lib/store";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userid = currentUserId();
  const cur = await get(params.id);
  if (!cur || cur.userid !== userid) return NextResponse.json({ error: "not found" }, { status: 404 });
  const patch = (await req.json()) as Record<string, unknown>;
  const next = { ...cur, ...patch, id: cur.id, userid: cur.userid };
  if (typeof patch.remindAt === "string" && !patch.nextFireAt) {
    next.nextFireAt = patch.remindAt;
  }
  await upsert(next);
  return NextResponse.json({ item: next });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const userid = currentUserId();
  const ok = await remove(params.id, userid);
  return NextResponse.json({ ok });
}
