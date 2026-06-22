import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken } from "@/lib/lark";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code) {
    return NextResponse.json({ error: "Missing code parameter" }, { status: 400 });
  }

  try {
    const data = await exchangeCodeForToken(code);

    if (data.code !== 0) {
      return NextResponse.json({ error: data.msg }, { status: 400 });
    }

    const response = NextResponse.redirect(new URL("/?status=success", request.url));
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
    console.error("Lark callback error:", error);
    return NextResponse.redirect(new URL("/?status=error", request.url));
  }
}
