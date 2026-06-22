Đây là các API Lark dùng để cấp auth và lấy token trong project:
1. URL đăng nhập (redirect user sang Lark)
GET https://open.larksuite.com/open-apis/authen/v1/index
  ?app_id={APP_ID}
  &redirect_uri={REDIRECT_URI}
  &state=xyz
2. Đổi code lấy user_access_token + refresh_token
POST https://open.larksuite.com/open-apis/authen/v1/access_token
Header: Authorization: Bearer {app_access_token}
Body: {
  "grant_type": "authorization_code",
  "code": "{code_tu_callback}"
}
→ Trả về data.access_token, data.refresh_token, data.expires_in, data.refresh_expires_in
3. Làm mới user_access_token bằng refresh_token
POST https://open.larksuite.com/open-apis/authen/v1/refresh_access_token
Header: Authorization: Bearer {app_access_token}
Body: {
  "grant_type": "refresh_token",
  "refresh_token": "{refresh_token_hien_tai}"
}
→ Trả về data.access_token mới + data.refresh_token mới
4. Lấy app_access_token (dùng trong bước 2 & 3)
POST https://open.larksuite.com/open-apis/auth/v3/app_access_token/internal/
Body: {
  "app_id": "{APP_ID}",
  "app_secret": "{APP_SECRET}"
}
→ Trả về app_access_token
Flow tổng quan:
User bấm login → redirect sang URL (1) → Lark trả code về /lark/oauth/callback
Backend dùng code gọi API (2) → lấy user_access_token + refresh_token
Mỗi khi token gần hết → gọi API (3) để refresh
App tự động refresh mỗi 1 giờ qua scheduler (TokenRefreshScheduler)