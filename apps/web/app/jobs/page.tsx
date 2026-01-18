"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "https://svapi.activi.io";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface Job {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  payload?: Record<string, unknown>;
  notes_count?: number;
}

const STATUS_OPTIONS = [
  "queued",
  "processing",
  "needs_approval",
  "approved",
  "rejected",
  "completed",
  "done",
  "failed",
];

// -----------------------------------------------------------------------------
// Jobs Page Component
// -----------------------------------------------------------------------------

export default function JobsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Jobs state
  const [jobs, setJobs] = useState<Job[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  // Create dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newJobTitle, setNewJobTitle] = useState("");
  const [newJobPayload, setNewJobPayload] = useState("");
  const [createError, setCreateError] = useState("");

  // -----------------------------------------------------------------------------
  // Auth
  // -----------------------------------------------------------------------------

  useEffect(() => {
    const stored = localStorage.getItem("supervisor_token") || localStorage.getItem("auth_token");
    if (stored) {
      setToken(stored);
    } else {
      router.push("/login");
    }
  }, [router]);

  // -----------------------------------------------------------------------------
  // Data Fetching
  // -----------------------------------------------------------------------------

  const fetchJobs = useCallback(async () => {
    if (!token) return;
    setLoading(true);

    try {
      let url = `${API_BASE}/jobs?limit=100`;
      if (statusFilter) url += `&status=${statusFilter}`;
      if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setJobs(await res.json());
      } else if (res.status === 401) {
        localStorage.removeItem("supervisor_token");
        localStorage.removeItem("auth_token");
        router.push("/login");
      }
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, searchQuery, router]);

  useEffect(() => {
    if (token) {
      fetchJobs();
    }
  }, [token, fetchJobs]);

  // -----------------------------------------------------------------------------
  // Create Job
  // -----------------------------------------------------------------------------

  const handleCreateJob = async () => {
    if (!newJobTitle.trim()) {
      setCreateError("Titel ist erforderlich");
      return;
    }

    let payload = null;
    if (newJobPayload.trim()) {
      try {
        payload = JSON.parse(newJobPayload);
      } catch {
        setCreateError("Ungültiges JSON im Payload");
        return;
      }
    }

    setCreateError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: newJobTitle, payload }),
      });

      if (res.ok) {
        const job = await res.json();
        setShowCreateDialog(false);
        setNewJobTitle("");
        setNewJobPayload("");
        fetchJobs();
        router.push(`/jobs/${job.id}`);
      } else {
        const data = await res.json();
        setCreateError(data.detail || "Fehler beim Erstellen");
      }
    } catch (err) {
      setCreateError(String(err));
    } finally {
      setLoading(false);
    }
  };

  // -----------------------------------------------------------------------------
  // Export Jobs
  // -----------------------------------------------------------------------------

  const handleExport = async () => {
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/jobs/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `jobs-export-${new Date().toISOString().split("T")[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  // -----------------------------------------------------------------------------
  // Render: Loading
  // -----------------------------------------------------------------------------

  if (!token) {
    return null;
  }

  // -----------------------------------------------------------------------------
  // Render: Jobs Page
  // -----------------------------------------------------------------------------

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.logo}>🎛️ AI Supervisor</h1>
          <nav style={styles.nav}>
            <a href="/dashboard" style={styles.navLink}>Dashboard</a>
            <a href="/jobs" style={styles.navLinkActive}>Jobs</a>
            <a href="/supervisor" style={styles.navLink}>Supervisor</a>
          </nav>
        </div>
        <button
          onClick={() => {
            localStorage.removeItem("supervisor_token");
            localStorage.removeItem("auth_token");
            router.push("/login");
          }}
          style={styles.logoutBtn}
        >
          Logout
        </button>
      </header>

      {/* Main Content */}
      <div style={styles.main}>
        {/* Toolbar */}
        <div style={styles.toolbar}>
          <div style={styles.toolbarLeft}>
            <h2 style={styles.pageTitle}>📋 Jobs</h2>
            <span style={styles.jobCount}>{jobs.length} Jobs</span>
          </div>
          <div style={styles.toolbarRight}>
            {/* Search */}
            <input
              type="text"
              placeholder="Suche..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
              data-testid="jobs_input_search"
            />

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={styles.select}
              data-testid="jobs_select_status"
            >
              <option value="">Alle Status</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>

            {/* Export Button */}
            <button onClick={handleExport} style={styles.exportBtn} data-testid="jobs_button_export">
              📥 Export
            </button>

            {/* Create Button */}
            <button
              onClick={() => setShowCreateDialog(true)}
              style={styles.createBtn}
              data-testid="jobs_button_create"
            >
              ➕ Neuer Job
            </button>
          </div>
        </div>

        {/* Jobs Table */}
        <div style={styles.tableContainer}>
          {loading && <div style={styles.loading}>Laden...</div>}

          {!loading && jobs.length === 0 && (
            <div style={styles.empty}>
              <p>Keine Jobs gefunden</p>
              <button onClick={() => setShowCreateDialog(true)} style={styles.createBtn}>
                ➕ Ersten Job erstellen
              </button>
            </div>
          )}

          {!loading && jobs.length > 0 && (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Titel</th>
                  <th style={styles.th}>Erstellt</th>
                  <th style={styles.th}>Aktualisiert</th>
                  <th style={styles.th}>Notes</th>
                  <th style={styles.th}>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} style={styles.tr} data-testid={`jobs_row_${job.id}`}>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.statusBadge,
                          background: getStatusColor(job.status),
                        }}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <a href={`/jobs/${job.id}`} style={styles.jobLink}>
                        {job.title}
                      </a>
                    </td>
                    <td style={styles.td}>
                      {new Date(job.created_at).toLocaleString("de-DE")}
                    </td>
                    <td style={styles.td}>
                      {new Date(job.updated_at).toLocaleString("de-DE")}
                    </td>
                    <td style={styles.td}>{job.notes_count || 0}</td>
                    <td style={styles.td}>
                      <button
                        onClick={() => router.push(`/jobs/${job.id}`)}
                        style={styles.actionBtn}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create Dialog */}
      {showCreateDialog && (
        <div style={styles.overlay}>
          <div style={styles.dialog}>
            <h3 style={styles.dialogTitle}>Neuer Job erstellen</h3>

            <div style={styles.formGroup}>
              <label style={styles.label}>Titel *</label>
              <input
                type="text"
                value={newJobTitle}
                onChange={(e) => setNewJobTitle(e.target.value)}
                placeholder="z.B. Server-Wartung"
                style={styles.input}
                data-testid="jobs_dialog_input_title"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Payload (JSON, optional)</label>
              <textarea
                value={newJobPayload}
                onChange={(e) => setNewJobPayload(e.target.value)}
                placeholder='{"key": "value"}'
                style={styles.textarea}
                rows={5}
                data-testid="jobs_dialog_input_payload"
              />
            </div>

            {createError && <div style={styles.error}>{createError}</div>}

            <div style={styles.dialogActions}>
              <button
                onClick={() => {
                  setShowCreateDialog(false);
                  setCreateError("");
                }}
                style={styles.cancelBtn}
              >
                Abbrechen
              </button>
              <button
                onClick={handleCreateJob}
                disabled={loading}
                style={styles.createBtn}
                data-testid="jobs_dialog_button_create"
              >
                {loading ? "Erstelle..." : "Erstellen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    queued: "#6b7280",
    processing: "#3b82f6",
    needs_approval: "#f59e0b",
    approved: "#22c55e",
    rejected: "#ef4444",
    completed: "#10b981",
    done: "#10b981",
    failed: "#ef4444",
  };
  return colors[status] || "#6b7280";
}

// -----------------------------------------------------------------------------
// Styles
// -----------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "#0a0a0a",
    color: "#fff",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 24px",
    borderBottom: "1px solid #222",
    background: "#111",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 32,
  },
  logo: {
    fontSize: 24,
    margin: 0,
  },
  nav: {
    display: "flex",
    gap: 16,
  },
  navLink: {
    color: "#888",
    textDecoration: "none",
    padding: "8px 12px",
    borderRadius: 6,
  },
  navLinkActive: {
    color: "#fff",
    textDecoration: "none",
    padding: "8px 12px",
    borderRadius: 6,
    background: "#222",
  },
  logoutBtn: {
    background: "#333",
    color: "#fff",
    border: "none",
    padding: "8px 16px",
    borderRadius: 6,
    cursor: "pointer",
  },
  main: {
    padding: 24,
  },
  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
    flexWrap: "wrap",
    gap: 16,
  },
  toolbarLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  toolbarRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  pageTitle: {
    margin: 0,
    fontSize: 24,
  },
  jobCount: {
    background: "#222",
    padding: "4px 12px",
    borderRadius: 12,
    fontSize: 14,
    color: "#888",
  },
  searchInput: {
    padding: "8px 12px",
    fontSize: 14,
    borderRadius: 6,
    border: "1px solid #333",
    background: "#1a1a1a",
    color: "#fff",
    width: 200,
  },
  select: {
    padding: "8px 12px",
    fontSize: 14,
    borderRadius: 6,
    border: "1px solid #333",
    background: "#1a1a1a",
    color: "#fff",
  },
  exportBtn: {
    padding: "8px 16px",
    fontSize: 14,
    borderRadius: 6,
    border: "1px solid #333",
    background: "#1a1a1a",
    color: "#fff",
    cursor: "pointer",
  },
  createBtn: {
    padding: "8px 16px",
    fontSize: 14,
    borderRadius: 6,
    border: "none",
    background: "#0070f3",
    color: "#fff",
    cursor: "pointer",
    fontWeight: "bold",
  },
  tableContainer: {
    background: "#1a1a1a",
    borderRadius: 12,
    overflow: "hidden",
  },
  loading: {
    padding: 40,
    textAlign: "center",
    color: "#888",
  },
  empty: {
    padding: 60,
    textAlign: "center",
    color: "#666",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    padding: "12px 16px",
    borderBottom: "1px solid #333",
    color: "#888",
    fontSize: 13,
    fontWeight: "500",
  },
  tr: {
    borderBottom: "1px solid #222",
  },
  td: {
    padding: "12px 16px",
    fontSize: 14,
  },
  statusBadge: {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 4,
    fontSize: 12,
    color: "#fff",
    fontWeight: "500",
  },
  jobLink: {
    color: "#0070f3",
    textDecoration: "none",
  },
  actionBtn: {
    padding: "4px 12px",
    fontSize: 12,
    borderRadius: 4,
    border: "1px solid #333",
    background: "transparent",
    color: "#888",
    cursor: "pointer",
  },

  // Dialog
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.8)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  dialog: {
    background: "#1a1a1a",
    padding: 24,
    borderRadius: 12,
    width: 480,
    maxWidth: "90vw",
  },
  dialogTitle: {
    margin: "0 0 20px 0",
    fontSize: 20,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    display: "block",
    marginBottom: 6,
    fontSize: 14,
    color: "#888",
  },
  input: {
    width: "100%",
    padding: 12,
    fontSize: 14,
    borderRadius: 6,
    border: "1px solid #333",
    background: "#222",
    color: "#fff",
  },
  textarea: {
    width: "100%",
    padding: 12,
    fontSize: 14,
    borderRadius: 6,
    border: "1px solid #333",
    background: "#222",
    color: "#fff",
    resize: "vertical",
    fontFamily: "monospace",
  },
  error: {
    background: "#3f1a1a",
    color: "#f87171",
    padding: 12,
    borderRadius: 6,
    marginBottom: 16,
    fontSize: 14,
  },
  dialogActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 20,
  },
  cancelBtn: {
    padding: "10px 20px",
    fontSize: 14,
    borderRadius: 6,
    border: "1px solid #333",
    background: "transparent",
    color: "#888",
    cursor: "pointer",
  },
};
