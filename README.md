# MeraKinhDoanh

Dự án Next.js kết nối với Lark OAuth (Feishu/ByteDance).

## Thiết lập

1. Sao chép file `.env.example` thành `.env.local` và điền thông tin:

```bash
cp .env.example .env.local
```

2. Cài đặt dependencies:

```bash
npm install
```

3. Chạy development server:

```bash
npm run dev
```

## Deploy lên Vercel

Dự án này được cấu hình sẵn cho Vercel. Cách deploy:

1. Push code lên GitHub
2. Import repo trên vercel.com
3. Thêm các biến môi trường (`LARK_APP_ID`, `LARK_APP_SECRET`, `LARK_REDIRECT_URI`, `NEXT_PUBLIC_APP_URL`)
4. Deploy

## API Routes

- `GET /api/lark/auth` - Redirect sang Lark OAuth
- `GET /api/lark/callback` - Xử lý callback từ Lark
- `POST /api/lark/refresh` - Refresh access token
