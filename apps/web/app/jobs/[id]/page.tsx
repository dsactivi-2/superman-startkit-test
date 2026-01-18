"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "https://svapi.activi.io";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface Note {
  id: string;
  text: string;
  author: string;
  created_at: string;
}

interface Job {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
  notes?: Note[];
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
// Job Detail Page
// -----------------------------------------------------------------------------

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;

  const [token, setToken] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editPayload, setEditPayload] = useState("");
  const [editError, setEditError] = useState("");

  // Notes state
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);

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

  const fetchJob = useCallback(async () => {
    if (!token) return;
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        localStorage.removeItem("supervisor_token");
        localStorage.removeItem("auth_token");
        router.push("/login");
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
      setEditTitle(data.title);
      setEditPayload(data.payload ? JSON.stringify(data.payload, null, 2) : "");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [token, jobId, router]);

  useEffect(() => {
    if (token) {
      fetchJob();
    }
  }, [token, fetchJob]);

  // -----------------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------------

  const handleSetStatus = async (newStatus: string) => {
    if (!token || !job) return;
    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/jobs/${jobId}/set-status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.detail || "Failed to update status");
      }

      const updated = await res.json();
      setJob(updated);
    } catch (err) {
      setError(String(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!token || !job) return;
    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/jobs/${jobId}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.detail || "Failed to approve");
      }

      const updated = await res.json();
      setJob(updated);
    } catch (err) {
      setError(String(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!token || !job) return;
    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/jobs/${jobId}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.detail || "Failed to reject");
      }

      const updated = await res.json();
      setJob(updated);
    } catch (err) {
      setError(String(err));
    } finally {
      setActionLoading(false);
    }
  };

  // -----------------------------------------------------------------------------
  // Edit
  // -----------------------------------------------------------------------------

  const handleSave = async () => {
    if (!token || !job) return;
    setEditError("");

    let payload = null;
    if (editPayload.trim()) {
      try {
        payload = JSON.parse(editPayload);
      } catch {
        setEditError("Ungültiges JSON im Payload");
        return;
      }
    }

    setActionLoading(true);

    try {
      const res = await fetch(`${API_BASE}/jobs/${jobId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: editTitle, payload }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.detail || "Failed to update");
      }

      const updated = await res.json();
      setJob(updated);
      setIsEditing(false);
    } catch (err) {
      setEditError(String(err));
    } finally {
      setActionLoading(false);
    }
  };

  // -----------------------------------------------------------------------------
  // Notes
  // -----------------------------------------------------------------------------

  const handleAddNote = async () => {
    if (!token || !newNote.trim()) return;
    setAddingNote(true);

    try {
      const res = await fetch(`${API_BASE}/jobs/${jobId}/note`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: newNote }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.detail || "Failed to add note");
      }

      setNewNote("");
      fetchJob(); // Refresh to get updated notes
    } catch (err) {
      setError(String(err));
    } finally {
      setAddingNote(false);
    }
  };

  // -----------------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------------

  if (!token) return null;

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingState}>Lade Job...</div>
      </div>
    );
  }

  if (!job) {
    return (
      <div style={styles.container}>
        <div style={styles.errorState}>
          <p>{error || "Job nicht gefunden"}</p>
          <a href="/jobs" style={styles.link}>Zurück zur Liste</a>
        </div>
      </div>
    );
  }

  const canApproveReject = job.status === "needs_approval";

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

      {/* Breadcrumb */}
      <div style={styles.breadcrumb}>
        <a href="/jobs" style={styles.breadcrumbLink}>Jobs</a>
        <span style={styles.breadcrumbSep}>/</span>
        <span>{job.title}</span>
      </div>

      {/* Main Content */}
      <div style={styles.main}>
        {/* Job Card */}
        <div style={styles.card}>
          {/* Title & Status */}
          <div style={styles.cardHeader}>
            {isEditing ? (
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                style={styles.editTitleInput}
                data-testid="job_input_title"
              />
            ) : (
              <h2 style={styles.jobTitle}>{job.title}</h2>
            )}
            <span
              style={{
                ...styles.statusBadge,
                background: getStatusColor(job.status),
              }}
            >
              {job.status}
            </span>
          </div>

          {error && <div style={styles.error}>{error}</div>}

          {/* Info Grid */}
          <div style={styles.infoGrid}>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>ID</span>
              <code style={styles.code}>{job.id}</code>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>Erstellt</span>
              <span>{new Date(job.created_at).toLocaleString("de-DE")}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>Aktualisiert</span>
              <span>{new Date(job.updated_at).toLocaleString("de-DE")}</span>
            </div>
          </div>

          {/* Payload */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Payload</h3>
            {isEditing ? (
              <>
                <textarea
                  value={editPayload}
                  onChange={(e) => setEditPayload(e.target.value)}
                  style={styles.payloadTextarea}
                  rows={8}
                  placeholder='{"key": "value"}'
                  data-testid="job_input_payload"
                />
                {editError && <div style={styles.error}>{editError}</div>}
              </>
            ) : (
              <pre style={styles.pre}>
                {job.payload ? JSON.stringify(job.payload, null, 2) : "(keine)"}
              </pre>
            )}
          </div>

          {/* Result */}
          {job.result && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Result</h3>
              <pre style={{ ...styles.pre, background: "#0d2818" }}>
                {JSON.stringify(job.result, null, 2)}
              </pre>
            </div>
          )}

          {/* Actions */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Aktionen</h3>

            {/* Edit Buttons */}
            <div style={styles.actionRow}>
              {isEditing ? (
                <>
                  <button
                    onClick={handleSave}
                    disabled={actionLoading}
                    style={styles.saveBtn}
                    data-testid="job_button_save"
                  >
                    {actionLoading ? "..." : "💾 Speichern"}
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setEditTitle(job.title);
                      setEditPayload(job.payload ? JSON.stringify(job.payload, null, 2) : "");
                      setEditError("");
                    }}
                    style={styles.cancelBtn}
                  >
                    Abbrechen
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  style={styles.editBtn}
                  data-testid="job_button_edit"
                >
                  ✏️ Bearbeiten
                </button>
              )}
            </div>

            {/* Approve/Reject Buttons */}
            {canApproveReject && (
              <div style={styles.actionRow}>
                <button
                  onClick={handleApprove}
                  disabled={actionLoading}
                  style={styles.approveBtn}
                  data-testid="job_button_approve"
                >
                  ✅ Approve
                </button>
                <button
                  onClick={handleReject}
                  disabled={actionLoading}
                  style={styles.rejectBtn}
                  data-testid="job_button_reject"
                >
                  ❌ Reject
                </button>
              </div>
            )}

            {/* Status Dropdown */}
            <div style={styles.actionRow}>
              <span style={styles.actionLabel}>Status ändern:</span>
              <select
                value={job.status}
                onChange={(e) => handleSetStatus(e.target.value)}
                disabled={actionLoading}
                style={styles.statusSelect}
                data-testid="job_select_status"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Notizen ({job.notes?.length || 0})</h3>

            {/* Add Note */}
            <div style={styles.addNoteRow}>
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Neue Notiz..."
                style={styles.noteInput}
                data-testid="job_input_note"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddNote();
                }}
              />
              <button
                onClick={handleAddNote}
                disabled={addingNote || !newNote.trim()}
                style={styles.addNoteBtn}
                data-testid="job_button_add_note"
              >
                {addingNote ? "..." : "➕"}
              </button>
            </div>

            {/* Notes List */}
            <div style={styles.notesList}>
              {(job.notes || []).length === 0 && (
                <p style={styles.emptyNotes}>Keine Notizen</p>
              )}
              {(job.notes || []).map((note) => (
                <div key={note.id} style={styles.noteItem}>
                  <div style={styles.noteHeader}>
                    <span style={styles.noteAuthor}>{note.author}</span>
                    <span style={styles.noteTime}>
                      {new Date(note.created_at).toLocaleString("de-DE")}
                    </span>
                  </div>
                  <p style={styles.noteText}>{note.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
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
  breadcrumb: {
    padding: "12px 24px",
    fontSize: 14,
    color: "#888",
  },
  breadcrumbLink: {
    color: "#0070f3",
    textDecoration: "none",
  },
  breadcrumbSep: {
    margin: "0 8px",
    color: "#444",
  },
  main: {
    padding: "0 24px 24px",
    maxWidth: 800,
  },
  card: {
    background: "#1a1a1a",
    borderRadius: 12,
    padding: 24,
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    gap: 16,
  },
  jobTitle: {
    margin: 0,
    fontSize: 24,
    flex: 1,
  },
  editTitleInput: {
    flex: 1,
    padding: 12,
    fontSize: 20,
    borderRadius: 6,
    border: "1px solid #333",
    background: "#222",
    color: "#fff",
  },
  statusBadge: {
    padding: "6px 16px",
    borderRadius: 4,
    fontSize: 14,
    fontWeight: "bold",
    color: "#fff",
  },
  error: {
    background: "#3f1a1a",
    color: "#f87171",
    padding: 12,
    borderRadius: 6,
    marginBottom: 16,
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16,
    marginBottom: 24,
  },
  infoItem: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  infoLabel: {
    fontSize: 12,
    color: "#666",
  },
  code: {
    fontSize: 12,
    background: "#222",
    padding: "4px 8px",
    borderRadius: 4,
    wordBreak: "break-all",
  },
  section: {
    marginTop: 24,
    paddingTop: 24,
    borderTop: "1px solid #333",
  },
  sectionTitle: {
    margin: "0 0 12px 0",
    fontSize: 16,
    color: "#888",
  },
  pre: {
    background: "#222",
    padding: 16,
    borderRadius: 8,
    overflow: "auto",
    fontSize: 13,
    margin: 0,
    maxHeight: 300,
  },
  payloadTextarea: {
    width: "100%",
    padding: 12,
    fontSize: 13,
    borderRadius: 6,
    border: "1px solid #333",
    background: "#222",
    color: "#fff",
    fontFamily: "monospace",
    resize: "vertical",
  },
  actionRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  actionLabel: {
    fontSize: 14,
    color: "#888",
  },
  editBtn: {
    padding: "8px 16px",
    fontSize: 14,
    borderRadius: 6,
    border: "1px solid #333",
    background: "transparent",
    color: "#fff",
    cursor: "pointer",
  },
  saveBtn: {
    padding: "8px 16px",
    fontSize: 14,
    borderRadius: 6,
    border: "none",
    background: "#22c55e",
    color: "#fff",
    cursor: "pointer",
    fontWeight: "bold",
  },
  cancelBtn: {
    padding: "8px 16px",
    fontSize: 14,
    borderRadius: 6,
    border: "1px solid #333",
    background: "transparent",
    color: "#888",
    cursor: "pointer",
  },
  approveBtn: {
    padding: "8px 16px",
    fontSize: 14,
    borderRadius: 6,
    border: "none",
    background: "#22c55e",
    color: "#fff",
    cursor: "pointer",
  },
  rejectBtn: {
    padding: "8px 16px",
    fontSize: 14,
    borderRadius: 6,
    border: "none",
    background: "#ef4444",
    color: "#fff",
    cursor: "pointer",
  },
  statusSelect: {
    padding: "8px 12px",
    fontSize: 14,
    borderRadius: 6,
    border: "1px solid #333",
    background: "#222",
    color: "#fff",
  },
  addNoteRow: {
    display: "flex",
    gap: 8,
    marginBottom: 16,
  },
  noteInput: {
    flex: 1,
    padding: 10,
    fontSize: 14,
    borderRadius: 6,
    border: "1px solid #333",
    background: "#222",
    color: "#fff",
  },
  addNoteBtn: {
    padding: "10px 16px",
    fontSize: 14,
    borderRadius: 6,
    border: "none",
    background: "#0070f3",
    color: "#fff",
    cursor: "pointer",
  },
  notesList: {
    maxHeight: 300,
    overflow: "auto",
  },
  emptyNotes: {
    color: "#666",
    fontSize: 14,
  },
  noteItem: {
    background: "#222",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  noteHeader: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 8,
    fontSize: 12,
  },
  noteAuthor: {
    color: "#0070f3",
  },
  noteTime: {
    color: "#666",
  },
  noteText: {
    margin: 0,
    fontSize: 14,
  },
  loadingState: {
    padding: 40,
    textAlign: "center",
    color: "#888",
  },
  errorState: {
    padding: 40,
    textAlign: "center",
  },
  link: {
    color: "#0070f3",
    textDecoration: "none",
  },
};
