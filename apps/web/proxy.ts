import { type NextRequest, NextResponse } from "next/server";
import { isAdminAuthorization } from "@/lib/admin-auth";

/** 管理画面の Basic 認証（ADMIN_USER / ADMIN_PASSWORD） */
export function proxy(req: NextRequest) {
  if (!process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD) {
    return new NextResponse("ADMIN_USER / ADMIN_PASSWORD が未設定です", { status: 503 });
  }
  if (isAdminAuthorization(req.headers.get("authorization"))) return NextResponse.next();
  return new NextResponse("認証が必要です", {
    status: 401,
    headers: { "www-authenticate": 'Basic realm="Devote Admin", charset="UTF-8"' },
  });
}

export const config = { matcher: ["/admin/:path*"] };
