"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("admin@local.test");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const base = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
      const res = await fetch(`${base}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any)?.detail || "Login fehlgeschlagen");
      }

      const data = await res.json();
      localStorage.setItem("auth_token", data.token);
      window.location.href = "/jobs";
    } catch (err: any) {
      setError(err?.message || "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "64px auto", padding: 16 }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Login</h1>
      <p style={{ opacity: 0.8, marginBottom: 24 }}>Admin Login (MVP)</p>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Email</div>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            autoComplete="email"
          />
        </label>

        <label>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Passwort</div>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            autoComplete="current-password"
          />
        </label>

        {error && (
          <div style={{ background: "#ffe8e8", padding: 10, borderRadius: 10, border: "1px solid #ffb3b3" }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: 12,
            borderRadius: 12,
            border: "none",
            background: "#111",
            color: "white",
            cursor: "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Logge ein..." : "Login"}
        </button>
      </form>
    </main>
  );
}
