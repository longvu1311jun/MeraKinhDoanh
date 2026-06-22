import { NextResponse } from "next/server";
import { getLarkAuthUrl } from "@/lib/lark";

export async function GET() {
  const state = Math.random().toString(36).substring(7);
  const authUrl = getLarkAuthUrl(state);
  console.log("Generated Lark auth URL:", authUrl);
  return NextResponse.redirect(authUrl);
}
