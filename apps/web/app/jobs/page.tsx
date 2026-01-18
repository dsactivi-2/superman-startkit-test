"use client";

import { useEffect, useState } from "react";

interface Job {
  id: string;
  title: string;
  status: string;
  created_at: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      window.location.href = "/login";
      return;
    }
    fetchJobs(token);
  }, []);

  async function fetchJobs(token: string) {
    try {
      const res = await fetch(`${API_BASE}/jobs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem("auth_token");
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch jobs");
      const data = await res.json();
      setJobs(data);
    } catch (err: any) {
      setError(err?.message || "Error loading jobs");
    } finally {
      setLoading(false);
    }
  }

  async function createDemoJob() {
    const token = localStorage.getItem("auth_token");
    if (!token) return;
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/jobs`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: `Demo Job ${Date.now()}`,
          payload: { demo: true, created_via: "web_ui" },
        }),
      });
      if (!res.ok) throw new Error("Failed to create job");
      fetchJobs(token);
    } catch (err: any) {
      setError(err?.message || "Error creating job");
    } finally {
      setCreating(false);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString("de-DE");
  }

  function statusColor(status: string) {
    const colors: Record<string, string> = {
      queued: "#666",
      processing: "#0066cc",
      needs_approval: "#ff9900",
      approved: "#00aa00",
      rejected: "#cc0000",
      failed: "#cc0000",
      completed: "#00aa00",
    };
    return colors[status] || "#666";
  }

  if (loading) {
    return (
      <main style={{ padding: 24 }}>
        <p>Lade Jobs...</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Jobs</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={createDemoJob}
            disabled={creating}
            style={{
              padding: "8px 16px",
              background: "#0066cc",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              opacity: creating ? 0.7 : 1,
            }}
          >
            {creating ? "Erstelle..." : "+ Demo Job"}
          </button>
          <a
            href="/"
            style={{
              padding: "8px 16px",
              background: "#eee",
              color: "#333",
              borderRadius: 8,
              textDecoration: "none",
            }}
          >
            Home
          </a>
        </div>
      </div>

      {error && (
        <div style={{ background: "#ffe8e8", padding: 12, borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {jobs.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48, background: "#f5f5f5", borderRadius: 12 }}>
          <p style={{ margin: 0, opacity: 0.7 }}>Keine Jobs vorhanden.</p>
          <p style={{ margin: "8px 0 0", opacity: 0.5, fontSize: 14 }}>
            Klicke auf "+ Demo Job" um einen Test-Job zu erstellen.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {jobs.map((job) => (
            <a
              key={job.id}
              href={`/jobs/${job.id}`}
              style={{
                display: "block",
                padding: 16,
                background: "#fff",
                border: "1px solid #ddd",
                borderRadius: 12,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{job.title}</div>
                  <div style={{ fontSize: 12, opacity: 0.6 }}>{formatDate(job.created_at)}</div>
                </div>
                <span
                  style={{
                    padding: "4px 12px",
                    background: statusColor(job.status) + "20",
                    color: statusColor(job.status),
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {job.status}
                </span>
              </div>
            </a>
          ))}
        </div>
      )}
    </main>
  );
}
