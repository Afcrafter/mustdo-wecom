import { NextResponse } from "next/server";
import { currentUserId, oauthUrl } from "@/lib/auth";
import { env, setupStatus, wecomReady } from "@/lib/env";
import { siliconflowConfigured } from "@/lib/parse";

export const runtime = "nodejs";

export async function GET() {
  const userid = currentUserId();
  const base = env("APP_BASE_URL");
  return NextResponse.json({
    userid,
    wecomReady: wecomReady(),
    llm: siliconflowConfigured(),
    needOAuth: wecomReady() && userid === "dev" && Boolean(base),
    oauth: wecomReady() && base ? oauthUrl(base) : "",
    setup: setupStatus(),
  });
}
