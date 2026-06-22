import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const userToken = request.cookies.get("lark_user_token")?.value;
  const refreshToken = request.cookies.get("lark_refresh_token")?.value;
  const tenantToken = request.cookies.get("lark_tenant_token")?.value;

  if (!userToken || !refreshToken) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const now = Date.now();

  return NextResponse.json({
    authenticated: true,
    userToken,
    refreshToken,
    tenantToken: tenantToken || null,
    userTokenExpiresAt: now + 7200 * 1000,
    refreshTokenExpiresAt: now + 7 * 24 * 3600 * 1000,
    tenantTokenExpiresAt: now + 2 * 3600 * 1000,
  });
}
