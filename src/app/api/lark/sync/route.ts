import { NextRequest, NextResponse } from "next/server";
import { runLarkSyncJob } from "@/lib/lark-sync";
import { getAppAccessToken } from "@/lib/lark";

export async function POST(request: NextRequest) {
  const tenantToken = request.cookies.get("lark_tenant_token")?.value;
  const userToken = request.cookies.get("lark_user_token")?.value;
  const refreshToken = request.cookies.get("lark_refresh_token")?.value;

  if (!userToken || !refreshToken) {
    return NextResponse.json(
      { error: "Chưa đăng nhập Lark. Vui lòng đăng nhập trước." },
      { status: 401 }
    );
  }

  try {
    const result = await runLarkSyncJob(userToken, userToken);

    return NextResponse.json({
      success: true,
      departments: result.deptResult,
      employees: result.empResult,
      duration_ms: result.durationMs,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const errorCode = (err as { code?: number }).code;

    console.error(`[lark-sync] error: ${errorMsg}`);

    return NextResponse.json(
      { error: errorMsg, code: errorCode },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    method: "POST",
    description: "Đồng bộ toàn bộ phòng ban và nhân viên từ Lark Suite",
  });
}
