import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const filename = (process.env.WECOM_VERIFY_FILENAME || "").trim();
  const content = (process.env.WECOM_VERIFY_CONTENT || "").trim();
  if (!filename || !content) return NextResponse.next();
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
  return NextResponse.next();
}

export const config = {
  matcher: ["/WW_verify_:path*"],
};
