import { NextRequest, NextResponse } from "next/server";
import { env, wecomReady } from "@/lib/env";
import { verifyUrl } from "@/lib/wecom-crypto";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!wecomReady()) {
    return new NextResponse("WECOM env not set", { status: 503 });
  }
  try {
    const sp = req.nextUrl.searchParams;
    const plain = verifyUrl({
      msg_signature: sp.get("msg_signature") || undefined,
      timestamp: sp.get("timestamp") || undefined,
      nonce: sp.get("nonce") || undefined,
      echostr: sp.get("echostr") || undefined,
      token: env("WECOM_TOKEN"),
      encodingAESKey: env("WECOM_ENCODING_AES_KEY"),
      corpId: env("WECOM_CORP_ID"),
    });
    return new NextResponse(plain, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "verify failed";
    return new NextResponse(msg, { status: 400 });
  }
}

export async function POST() {
  // 目前只做提醒表，不处理被动回复。返回 success 避免企业微信重试。
  return new NextResponse("success", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
