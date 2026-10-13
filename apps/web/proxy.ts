import { type NextRequest, NextResponse } from "next/server";

/** 管理画面の Basic 認証（ADMIN_USER / ADMIN_PASSWORD） */
export function proxy(req: NextRequest) {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASSWORD;
  if (!user || !pass) {
    return new NextResponse("ADMIN_USER / ADMIN_PASSWORD が未設定です", { status: 503 });
  }
  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const [u, ...rest] = atob(encoded).split(":");
    if (u === user && rest.join(":") === pass) return NextResponse.next();
  }
  return new NextResponse("認証が必要です", {
    status: 401,
    headers: { "www-authenticate": 'Basic realm="Devote Admin", charset="UTF-8"' },
  });
}

export const config = { matcher: ["/admin/:path*"] };
