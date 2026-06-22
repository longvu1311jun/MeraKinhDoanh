import { NextRequest, NextResponse } from "next/server";
import { refreshAccessToken } from "@/lib/lark";

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

    const response = NextResponse.json({ success: true });
    response.cookies.set("lark_access_token", data.data.access_token, {
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

    return response;
  } catch (error) {
    console.error("Token refresh error:", error);
    return NextResponse.json({ error: "Failed to refresh token" }, { status: 500 });
  }
}
