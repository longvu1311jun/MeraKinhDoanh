import { NextRequest, NextResponse } from "next/server";
import { refreshAccessToken, getAppAccessToken } from "@/lib/lark";

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get("lark_refresh_token")?.value;

  if (!refreshToken) {
    return NextResponse.json({ error: "No refresh token available" }, { status: 401 });
  }

  try {
    const data = await refreshAccessToken(refreshToken);

    if (data.code !== 0) {
      return NextResponse.json({ error: data.msg }, { status: 400 });
    }

    const tenantToken = await getAppAccessToken();

    const response = NextResponse.json({ success: true });
    response.cookies.set("lark_user_token", data.data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: data.data.expires_in,
      path: "/",
    });
    response.cookies.set("lark_refresh_token", data.data.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: data.data.refresh_expires_in,
      path: "/",
    });
    response.cookies.set("lark_tenant_token", tenantToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 2 * 3600,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Token refresh error:", error);
    return NextResponse.json({ error: "Failed to refresh token" }, { status: 500 });
  }
}
