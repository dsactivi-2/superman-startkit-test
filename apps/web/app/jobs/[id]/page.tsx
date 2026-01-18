"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Job {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  payload: Record<string, any> | null;
  result: Record<string, any> | null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export default function JobDetailPage() {
  const params = useParams();
  const jobId = params.id as string;

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      window.location.href = "/login";
      return;
    }
    fetchJob(token);
  }, [jobId]);

  async function fetchJob(token: string) {
    try {
      const res = await fetch(`${API_BASE}/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem("auth_token");
        window.location.href = "/login";
        return;
      }
      if (res.status === 404) {
        setError("Job nicht gefunden");
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch job");
      const data = await res.json();
      setJob(data);
    } catch (err: any) {
      setError(err?.message || "Error loading job");
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(action: "approve" | "reject") {
    const token = localStorage.getItem("auth_token");
    if (!token || !job) return;

    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/jobs/${jobId}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any)?.detail || `Failed to ${action} job`);
      }
      const updated = await res.json();
      setJob(updated);
    } catch (err: any) {
      setError(err?.message || `Error ${action}ing job`);
    } finally {
      setActionLoading(false);
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
        <p>Lade Job...</p>
      </main>
    );
  }

  if (!job) {
    return (
      <main style={{ maxWidth: 600, margin: "0 auto", padding: 24 }}>
        <div style={{ background: "#ffe8e8", padding: 16, borderRadius: 8 }}>
          {error || "Job nicht gefunden"}
        </div>
        <a href="/jobs" style={{ display: "inline-block", marginTop: 16 }}>
          Zurück zur Liste
        </a>
      </main>
    );
  }

  const canApprove = job.status === "needs_approval";

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <a href="/jobs" style={{ opacity: 0.6, textDecoration: "none" }}>
          Jobs
        </a>
        <span style={{ margin: "0 8px", opacity: 0.4 }}>/</span>
        <span>{job.title}</span>
      </div>

      <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 12, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 24 }}>{job.title}</h1>
          <span
            style={{
              padding: "6px 16px",
              background: statusColor(job.status) + "20",
              color: statusColor(job.status),
              borderRadius: 20,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {job.status}
          </span>
        </div>

        {error && (
          <div style={{ background: "#ffe8e8", padding: 12, borderRadius: 8, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>ID</div>
            <code style={{ fontSize: 12, background: "#f5f5f5", padding: "4px 8px", borderRadius: 4 }}>
              {job.id}
            </code>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>Erstellt</div>
              <div>{formatDate(job.created_at)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>Aktualisiert</div>
              <div>{formatDate(job.updated_at)}</div>
            </div>
          </div>

          {job.payload && (
            <div>
              <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>Payload</div>
              <pre
                style={{
                  background: "#f5f5f5",
                  padding: 12,
                  borderRadius: 8,
                  margin: 0,
                  overflow: "auto",
                  fontSize: 12,
                }}
              >
                {JSON.stringify(job.payload, null, 2)}
              </pre>
            </div>
          )}

          {job.result && (
            <div>
              <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>Result</div>
              <pre
                style={{
                  background: "#f0fff0",
                  padding: 12,
                  borderRadius: 8,
                  margin: 0,
                  overflow: "auto",
                  fontSize: 12,
                }}
              >
                {JSON.stringify(job.result, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <div style={{ borderTop: "1px solid #eee", marginTop: 24, paddingTop: 24 }}>
          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 12 }}>Aktionen</div>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={() => handleAction("approve")}
              disabled={!canApprove || actionLoading}
              style={{
                padding: "10px 20px",
                background: canApprove ? "#00aa00" : "#ccc",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: canApprove ? "pointer" : "not-allowed",
                opacity: actionLoading ? 0.7 : 1,
              }}
            >
              Approve
            </button>
            <button
              onClick={() => handleAction("reject")}
              disabled={!canApprove || actionLoading}
              style={{
                padding: "10px 20px",
                background: canApprove ? "#cc0000" : "#ccc",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: canApprove ? "pointer" : "not-allowed",
                opacity: actionLoading ? 0.7 : 1,
              }}
            >
              Reject
            </button>
          </div>
          {!canApprove && (
            <p style={{ fontSize: 12, opacity: 0.5, marginTop: 8 }}>
              Aktionen nur verfügbar wenn Status = "needs_approval"
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
