import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("lark_access_token")?.value;
  const refreshToken = request.cookies.get("lark_refresh_token")?.value;

  if (!accessToken || !refreshToken) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const now = Date.now();

  return NextResponse.json({
    authenticated: true,
    accessToken,
    refreshToken,
    accessTokenExpiresAt: now + 7200 * 1000,
    refreshTokenExpiresAt: now + 7 * 24 * 3600 * 1000,
  });
}
