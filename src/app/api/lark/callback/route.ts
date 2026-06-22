import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken, getAppAccessToken } from "@/lib/lark";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Missing code parameter" }, { status: 400 });
  }

  try {
    const data = await exchangeCodeForToken(code);

    if (data.code !== 0) {
      return NextResponse.redirect(new URL(`/?status=error&msg=${encodeURIComponent(data.msg)}`, request.url));
    }

    const tenantToken = await getAppAccessToken();

    const response = NextResponse.redirect(new URL("/?status=success", request.url));
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
    console.error("Lark callback error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.redirect(new URL(`/?status=error&msg=${encodeURIComponent(errorMessage)}`, request.url));
  }
}
