import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { useridFromCode } from "@/lib/wecom-api";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code") || "";
  const base = env("APP_BASE_URL") || req.nextUrl.origin;
  if (!code) {
    return NextResponse.redirect(base + "/?oauth=nocode");
  }
  try {
    const userid = await useridFromCode(code);
    const res = NextResponse.redirect(base + "/");
    res.cookies.set("wecom_userid", userid, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (err) {
    const why = err instanceof Error ? err.message : "unknown";
    return NextResponse.redirect(base + `/?oauth=fail&why=${encodeURIComponent(why)}`);
  }
}
