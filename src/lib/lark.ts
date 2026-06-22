const LARK_API_BASE = "https://open.larksuite.com/open-apis";
const LARK_AUTH_BASE = `${LARK_API_BASE}/authen/v1`;
const LARK_AUTH_V3 = `${LARK_API_BASE}/auth/v3`;

export interface LarkTokenResponse {
  code: number;
  msg: string;
  data: {
    access_token: string;
    token_type: string;
    refresh_token: string;
    expires_in: number;
    refresh_expires_in: number;
  };
}

export interface LarkAppTokenResponse {
  code: number;
  msg: string;
  data: {
    app_access_token: string;
    expire: number;
  };
}

export async function getAppAccessToken(): Promise<string> {
  const res = await fetch(`${LARK_AUTH_V3}/app_access_token/internal/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: process.env.LARK_APP_ID,
      app_secret: process.env.LARK_APP_SECRET,
    }),
  });

  const data: LarkAppTokenResponse = await res.json();
  if (data.code !== 0) {
    throw new Error(`Failed to get app access token: ${data.msg}`);
  }
  return data.data.app_access_token;
}

export async function exchangeCodeForToken(code: string): Promise<LarkTokenResponse> {
  const appAccessToken = await getAppAccessToken();

  const res = await fetch(`${LARK_AUTH_BASE}/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${appAccessToken}`,
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
    }),
  });

  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<LarkTokenResponse> {
  const appAccessToken = await getAppAccessToken();

  const res = await fetch(`${LARK_AUTH_BASE}/refresh_access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${appAccessToken}`,
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  return res.json();
}

export function getLarkAuthUrl(state: string = "xyz"): string {
  const params = new URLSearchParams({
    app_id: process.env.LARK_APP_ID || "",
    redirect_uri: process.env.LARK_REDIRECT_URI || "",
    state,
  });
  return `${LARK_AUTH_BASE}/index?${params.toString()}`;
}
