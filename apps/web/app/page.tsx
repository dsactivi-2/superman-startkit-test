export default function Home() {
  return (
    <main style={{ padding: 24 }}>
      <h1>AI Supervisor Hybrid-Ops (MVP)</h1>
      <p>Web Control Center</p>
      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <a
          href="/jobs"
          style={{
            display: "inline-block",
            padding: "12px 24px",
            background: "#0066cc",
            color: "white",
            borderRadius: 12,
            textDecoration: "none",
          }}
        >
          Jobs
        </a>
        <a
          href="/login"
          style={{
            display: "inline-block",
            padding: "12px 24px",
            background: "#111",
            color: "white",
            borderRadius: 12,
            textDecoration: "none",
          }}
        >
          Login
        </a>
      </div>
    </main>
  );
}
