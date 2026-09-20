import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, newSessionId } from "@/lib/auth";

export function middleware(req: NextRequest) {
  // 1) 企微验证文件（保留原有逻辑）
  const filename = (process.env.WECOM_VERIFY_FILENAME || "").trim();
  const content = (process.env.WECOM_VERIFY_CONTENT || "").trim();
  if (filename && content) {
    const path = req.nextUrl.pathname.replace(/^\//, "");
    if (path === filename) {
      return new NextResponse(content, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }
  }

  const resp = NextResponse.next();

  // 2) 匿名会话隔离：无 mdu_userid cookie 则派发一个
  //    放在根路径、持久一年，保证同一浏览器稳定归属同一 id。
  const existing = req.cookies.get(SESSION_COOKIE)?.value || "";
  if (!existing) {
    const id = newSessionId();
    resp.headers.set(
      "Set-Cookie",
      `${SESSION_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`
    );
  }

  return resp;
}

export const config = {
  matcher: ["/:path*"],
};
