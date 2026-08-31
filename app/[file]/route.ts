import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { file: string } }) {
  const name = env("WECOM_VERIFY_FILENAME");
  const content = env("WECOM_VERIFY_CONTENT");
  if (!name || !content || params.file !== name) {
    return new NextResponse("not found", { status: 404 });
  }
  return new NextResponse(content, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
