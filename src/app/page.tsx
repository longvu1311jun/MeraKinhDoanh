"use client";

import { useEffect, useState, useCallback } from "react";

interface TokenInfo {
  userToken: string;
  refreshToken: string;
  tenantToken: string | null;
  userTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
  tenantTokenExpiresAt: number;
}

interface AuthStatus {
  authenticated: boolean;
  status: "success" | "error" | null;
  errorMsg: string | null;
}

export default function HomePage() {
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ authenticated: false, status: null, errorMsg: null });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    departments: { inserted: number; updated: number; skippedDeleted: number };
    employees: { inserted: number; updated: number };
    duration_ms: number;
  } | null>(null);
  const [syncError, setSyncError] = useState<string>("");
  const [timeUntilRefresh, setTimeUntilRefresh] = useState<string>("");
  const [lastRefresh, setLastRefresh] = useState<string>("");
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/lark/tokens");
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated) {
          setTokenInfo({
            userToken: data.userToken,
            refreshToken: data.refreshToken,
            tenantToken: data.tenantToken,
            userTokenExpiresAt: data.userTokenExpiresAt,
            refreshTokenExpiresAt: data.refreshTokenExpiresAt,
            tenantTokenExpiresAt: data.tenantTokenExpiresAt,
          });
          setAuthStatus({ authenticated: true, status: null, errorMsg: null });
        } else {
          setTokenInfo(null);
          setAuthStatus((prev) => ({ ...prev, authenticated: false }));
        }
      } else {
        setTokenInfo(null);
        setAuthStatus((prev) => ({ ...prev, authenticated: false }));
      }
    } catch {
      setTokenInfo(null);
      setAuthStatus((prev) => ({ ...prev, authenticated: false }));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshToken = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/lark/refresh", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        console.error("Refresh failed:", data.error);
      } else {
        await checkAuth();
        setLastRefresh(new Date().toLocaleTimeString("vi-VN"));
      }
    } catch (err) {
      console.error("Refresh error:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [checkAuth]);

  const syncAll = useCallback(async () => {
    setIsSyncing(true);
    setSyncError("");
    setSyncResult(null);
    try {
      const res = await fetch("/api/lark/sync", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setSyncError(data.error);
      } else {
        setSyncResult(data);
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const formatTimeLeft = useCallback((expiresAt: number | null): string => {
    if (!expiresAt) return "Không rõ";
    const diff = expiresAt - Date.now();
    if (diff <= 0) return "Đã hết hạn";
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const msg = params.get("msg");

    if (status === "success") {
      setAuthStatus({ authenticated: true, status: "success", errorMsg: null });
      window.history.replaceState({}, "", "/");
    } else if (status === "error") {
      setAuthStatus({ authenticated: false, status: "error", errorMsg: msg });
      window.history.replaceState({}, "", "/");
    }

    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!tokenInfo?.userTokenExpiresAt || !autoRefreshEnabled) return;

    const checkAndRefresh = () => {
      const timeLeft = tokenInfo.userTokenExpiresAt - Date.now();
      setTimeUntilRefresh(formatTimeLeft(tokenInfo.userTokenExpiresAt));

      if (timeLeft <= 5 * 60 * 1000 && timeLeft > 0) {
        refreshToken();
      }
    };

    checkAndRefresh();
    const interval = setInterval(checkAndRefresh, 10000);
    return () => clearInterval(interval);
  }, [tokenInfo, autoRefreshEnabled, refreshToken, formatTimeLeft]);

  if (isLoading) {
    return (
      <main style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        background: "#f8fafc",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: "40px",
            height: "40px",
            border: "4px solid #e2e8f0",
            borderTopColor: "#3b82f6",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            margin: "0 auto 16px",
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ color: "#64748b" }}>Đang tải...</p>
        </div>
      </main>
    );
  }

  if (!authStatus.authenticated && !tokenInfo) {
    return (
      <main style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        gap: "24px",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        color: "white",
      }}>
        {authStatus.status === "success" && (
          <div style={{ padding: "12px 24px", background: "#10b981", borderRadius: "8px", color: "white" }}>
            Đăng nhập thành công!
          </div>
        )}
        {authStatus.status === "error" && (
          <div style={{ padding: "12px 24px", background: "#ef4444", borderRadius: "8px", color: "white" }}>
            Lỗi: {authStatus.errorMsg}
          </div>
        )}
        <h1 style={{ fontSize: "2rem", fontWeight: 700 }}>MeraKinhDoanh</h1>
        <p style={{ color: "rgba(255,255,255,0.8)" }}>Kết nối với Lark OAuth</p>
        <a
          href="/api/lark/auth"
          style={{
            padding: "14px 36px",
            backgroundColor: "white",
            color: "#667eea",
            borderRadius: "8px",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "1rem",
            boxShadow: "0 4px 14px rgba(0,0,0,0.2)",
          }}
        >
          Đăng nhập với Lark
        </a>
      </main>
    );
  }

  return (
    <main style={{
      minHeight: "100vh",
      fontFamily: "system-ui, sans-serif",
      background: "#f8fafc",
      color: "#1e293b",
    }}>
      <div style={{
        maxWidth: "800px",
        margin: "0 auto",
        padding: "40px 20px",
      }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#0f172a" }}>MeraKinhDoanh Dashboard</h1>
          <p style={{ color: "#64748b", marginTop: "4px" }}>Trạng thái xác thực Lark OAuth</p>
        </div>

        <div style={{
          background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
          color: "white",
          padding: "16px 24px",
          borderRadius: "12px",
          marginBottom: "24px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}>
          <div style={{
            width: "12px",
            height: "12px",
            borderRadius: "50%",
            background: "#34d399",
            boxShadow: "0 0 8px #34d399",
          }} />
          <span style={{ fontWeight: 600 }}>Đã xác thực thành công</span>
        </div>

        <div style={{ display: "grid", gap: "16px" }}>
          <TokenCard
            title="User Token"
            description="Dùng để xác thực người dùng"
            value={tokenInfo?.userToken || ""}
            expiresAt={tokenInfo?.userTokenExpiresAt ?? null}
            formatTime={formatTimeLeft}
            color="#3b82f6"
          />
          <TokenCard
            title="Refresh Token"
            description="Dùng để lấy User Token mới"
            value={tokenInfo?.refreshToken || ""}
            expiresAt={tokenInfo?.refreshTokenExpiresAt ?? null}
            formatTime={formatTimeLeft}
            color="#8b5cf6"
          />
          {tokenInfo?.tenantToken && (
            <TokenCard
              title="Tenant Token"
              description="Dùng để gọi API Lark thay app"
              value={tokenInfo.tenantToken}
              expiresAt={tokenInfo?.tenantTokenExpiresAt ?? null}
              formatTime={formatTimeLeft}
              color="#f59e0b"
            />
          )}
        </div>

        <div style={{
          marginTop: "24px",
          background: "white",
          borderRadius: "12px",
          padding: "20px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "16px", color: "#0f172a" }}>Cài đặt Auto-Refresh</h3>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={autoRefreshEnabled}
                onChange={(e) => setAutoRefreshEnabled(e.target.checked)}
                style={{ width: "18px", height: "18px", cursor: "pointer" }}
              />
              <span style={{ fontWeight: 500 }}>Tự động làm mới token</span>
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
            <div style={{
              background: "#f1f5f9",
              padding: "12px 16px",
              borderRadius: "8px",
            }}>
              <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "4px" }}>Access Token sẽ hết hạn sau</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: timeUntilRefresh === "Đã hết hạn" ? "#ef4444" : "#3b82f6" }}>
                {timeUntilRefresh || formatTimeLeft(tokenInfo?.userTokenExpiresAt ?? null)}
              </div>
            </div>
            <div style={{
              background: "#f1f5f9",
              padding: "12px 16px",
              borderRadius: "8px",
            }}>
              <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "4px" }}>Lần refresh cuối</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#64748b" }}>
                {lastRefresh || "Chưa có"}
              </div>
            </div>
          </div>

          <button
            onClick={refreshToken}
            disabled={isRefreshing}
            style={{
              width: "100%",
              padding: "12px 24px",
              background: isRefreshing ? "#94a3b8" : "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontWeight: 600,
              fontSize: "0.95rem",
              cursor: isRefreshing ? "not-allowed" : "pointer",
              transition: "background 0.2s",
            }}
          >
            {isRefreshing ? "Đang làm mới..." : "Làm mới Token ngay"}
          </button>

          <p style={{ fontSize: "0.75rem", color: "#94a3b8", textAlign: "center", marginTop: "8px" }}>
            Token sẽ tự động được làm mới khi còn 5 phút hoặc ít hơn trước khi hết hạn
          </p>
        </div>

        <div style={{
          marginTop: "24px",
          background: "white",
          borderRadius: "12px",
          padding: "20px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "16px", color: "#0f172a" }}>Đồng bộ Lark</h3>

          <p style={{ fontSize: "0.85rem", color: "#64748b", marginBottom: "16px" }}>
            Đồng bộ toàn bộ phòng ban và nhân viên từ Lark Suite vào database.
          </p>

          <button
            onClick={syncAll}
            disabled={isSyncing}
            style={{
              width: "100%",
              padding: "12px 24px",
              background: isSyncing ? "#94a3b8" : "#10b981",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontWeight: 600,
              fontSize: "0.95rem",
              cursor: isSyncing ? "not-allowed" : "pointer",
              transition: "background 0.2s",
            }}
          >
            {isSyncing ? "Đang đồng bộ..." : "Đồng bộ Phòng ban & Nhân viên"}
          </button>

          {syncResult && (
            <div style={{ marginTop: "16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div style={{ background: "#f0fdf4", padding: "12px 16px", borderRadius: "8px", border: "1px solid #bbf7d0" }}>
                  <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "4px" }}>Phòng ban - Mới</div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#10b981" }}>+{syncResult.departments.inserted}</div>
                </div>
                <div style={{ background: "#eff6ff", padding: "12px 16px", borderRadius: "8px", border: "1px solid #bfdbfe" }}>
                  <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "4px" }}>Phòng ban - Cập nhật</div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#3b82f6" }}>~{syncResult.departments.updated}</div>
                </div>
                <div style={{ background: "#f0fdf4", padding: "12px 16px", borderRadius: "8px", border: "1px solid #bbf7d0" }}>
                  <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "4px" }}>Nhân viên - Mới</div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#10b981" }}>+{syncResult.employees.inserted}</div>
                </div>
                <div style={{ background: "#eff6ff", padding: "12px 16px", borderRadius: "8px", border: "1px solid #bfdbfe" }}>
                  <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "4px" }}>Nhân viên - Cập nhật</div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#3b82f6" }}>~{syncResult.employees.updated}</div>
                </div>
              </div>
              <div style={{ marginTop: "12px", padding: "10px 16px", background: "#f8fafc", borderRadius: "8px", textAlign: "center" }}>
                <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                  Hoàn tất trong <strong>{syncResult.duration_ms / 1000}s</strong>
                </span>
              </div>
            </div>
          )}

          {syncError && (
            <div style={{
              marginTop: "16px",
              padding: "12px 16px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "8px",
              color: "#dc2626",
              fontSize: "0.85rem",
            }}>
              Lỗi: {syncError}
            </div>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: "24px" }}>
          <a
            href="/api/lark/auth"
            style={{
              color: "#94a3b8",
              textDecoration: "none",
              fontSize: "0.85rem",
            }}
          >
            Đăng nhập lại
          </a>
        </div>
      </div>
    </main>
  );
}

function TokenCard({ title, description, value, expiresAt, formatTime, color }: {
  title: string;
  description?: string;
  value: string;
  expiresAt: number | null;
  formatTime: (t: number | null) => string;
  color: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      background: "white",
      borderRadius: "12px",
      padding: "16px 20px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: color }} />
            <span style={{ fontWeight: 600, color: "#0f172a" }}>{title}</span>
          </div>
          {description && (
            <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "2px", gridColumn: "1 / -1" }}>
              {description}
            </div>
          )}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{
            fontSize: "0.75rem",
            color: formatTime(expiresAt) === "Đã hết hạn" ? "#ef4444" : "#10b981",
            fontWeight: 500,
          }}>
            Hết hạn: {formatTime(expiresAt)}
          </span>
          <button
            onClick={copy}
            style={{
              padding: "4px 12px",
              background: copied ? "#10b981" : "#f1f5f9",
              color: copied ? "white" : "#64748b",
              border: "none",
              borderRadius: "6px",
              fontSize: "0.75rem",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            {copied ? "Đã sao chép" : "Sao chép"}
          </button>
        </div>
      </div>
      <div style={{
        fontSize: "0.75rem",
        fontFamily: "monospace",
        background: "#f8fafc",
        padding: "10px 14px",
        borderRadius: "6px",
        color: "#475569",
        wordBreak: "break-all",
        border: "1px solid #e2e8f0",
      }}>
        {value}
      </div>
    </div>
  );
}
