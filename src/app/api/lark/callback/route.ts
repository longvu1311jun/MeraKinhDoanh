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
    console.log("Attempting to exchange code for token...");
    const data = await exchangeCodeForToken(code);
    console.log("Token exchange response:", JSON.stringify(data));

    if (data.code !== 0) {
      return NextResponse.redirect(new URL(`/?status=error&msg=${encodeURIComponent(data.msg)}`, request.url));
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.redirect(new URL(`/?status=error&msg=${encodeURIComponent(errorMessage)}`, request.url));
  }
}
