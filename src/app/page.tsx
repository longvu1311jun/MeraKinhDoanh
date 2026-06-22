export default function HomePage() {
  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", gap: "24px" }}>
      <h1 style={{ fontSize: "2rem", fontWeight: 700 }}>MeraKinhDoanh</h1>
      <p style={{ color: "#666" }}>Kết nối với Lark OAuth</p>
      <a
        href="/api/lark/auth"
        style={{
          padding: "12px 32px",
          backgroundColor: "#0057D9",
          color: "white",
          borderRadius: "8px",
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        Đăng nhập với Lark
      </a>
    </main>
  );
}
