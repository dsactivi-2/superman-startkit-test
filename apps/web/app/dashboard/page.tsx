"use client";

import { useState, useEffect, useCallback } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "https://svapi.activi.io";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface PlanResponse {
  status: string;
  language: string;
  summary: string[];
  plan: string[];
  tools: string[];
  tool_type: string;
  tool_type_localized: string;
  confirm_question: string;
  confirm_token?: string;
  execute_instruction?: string;
  parsed_tool?: string;
  parsed_params?: Record<string, unknown>;
  suggestions?: string[];
  error?: string;
}

interface ExecuteResponse {
  status: string;
  language: string;
  message: string;
  result?: unknown;
  error?: string;
}

interface Job {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  notes_count?: number;
}

interface AuditEvent {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  status: string;
  job_id?: string;
  tool?: string;
}

interface ServiceHealth {
  name: string;
  status: string;
  latency_ms?: number;
  error?: string;
}

interface SystemStatus {
  status: string;
  version: string;
  uptime_human: string;
  services: ServiceHealth[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  plan?: PlanResponse;
  result?: ExecuteResponse;
}

// -----------------------------------------------------------------------------
// Dashboard Component
// -----------------------------------------------------------------------------

export default function DashboardPage() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingPlan, setPendingPlan] = useState<PlanResponse | null>(null);
  const [executeInput, setExecuteInput] = useState("");
  const [step, setStep] = useState<"input" | "confirm" | "execute">("input");

  // Ops panel state
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);

  // -----------------------------------------------------------------------------
  // Auth
  // -----------------------------------------------------------------------------

  useEffect(() => {
    const stored = localStorage.getItem("supervisor_token");
    if (stored) setToken(stored);
  }, []);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.token) {
        setToken(data.token);
        localStorage.setItem("supervisor_token", data.token);
      } else {
        alert(data.detail || "Login failed");
      }
    } catch (err) {
      alert(String(err));
    }
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem("supervisor_token");
    setMessages([]);
  };

  // -----------------------------------------------------------------------------
  // Data Fetching
  // -----------------------------------------------------------------------------

  const fetchOpsData = useCallback(async () => {
    if (!token) return;

    const headers = { Authorization: `Bearer ${token}` };

    try {
      // Fetch system status
      const statusRes = await fetch(`${API_BASE}/admin/status`, { headers });
      if (statusRes.ok) {
        setSystemStatus(await statusRes.json());
      }

      // Fetch jobs (last 10)
      const jobsRes = await fetch(`${API_BASE}/jobs?limit=10`, { headers });
      if (jobsRes.ok) {
        setJobs(await jobsRes.json());
      }

      // Fetch audit events (last 10)
      const auditRes = await fetch(`${API_BASE}/audit?limit=10`, { headers });
      if (auditRes.ok) {
        setAuditEvents(await auditRes.json());
      }
    } catch (err) {
      console.error("Failed to fetch ops data:", err);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchOpsData();
      const interval = setInterval(fetchOpsData, 30000); // Refresh every 30s
      return () => clearInterval(interval);
    }
  }, [token, fetchOpsData]);

  // -----------------------------------------------------------------------------
  // Supervisor Chat
  // -----------------------------------------------------------------------------

  const addMessage = (role: "user" | "assistant", content: string, plan?: PlanResponse, result?: ExecuteResponse) => {
    setMessages((prev) => [
      ...prev,
      {
        role,
        content,
        timestamp: new Date().toISOString(),
        plan,
        result,
      },
    ]);
  };

  const handlePlan = async () => {
    if (!input.trim()) return;
    setLoading(true);

    addMessage("user", input);
    const userInput = input;
    setInput("");

    try {
      const res = await fetch(`${API_BASE}/supervisor/plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: userInput }),
      });
      const data: PlanResponse = await res.json();

      if (data.status === "error" || data.status === "unclear") {
        addMessage("assistant", data.error || "Unbekannter Fehler", data);
        setStep("input");
      } else {
        // Plan received - show confirmation
        const summary = data.summary.join("\n");
        addMessage("assistant", `📋 Plan erstellt:\n${summary}\n\n${data.confirm_question}`, data);
        setPendingPlan(data);
        setStep("confirm");
      }
    } catch (err) {
      addMessage("assistant", `Fehler: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = (confirmed: boolean) => {
    if (!confirmed) {
      addMessage("assistant", "❌ Abgebrochen.");
      setPendingPlan(null);
      setStep("input");
      return;
    }
    setStep("execute");
    const action = pendingPlan?.parsed_tool?.split(".")[1]?.toUpperCase() || "ACTION";
    setExecuteInput(`EXECUTE ${action}`);
  };

  const handleExecute = async () => {
    if (!executeInput.trim().toUpperCase().startsWith("EXECUTE")) {
      addMessage("assistant", "⚠️ Bitte schreibe: EXECUTE <AKTION>");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/supervisor/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          execute_command: executeInput,
          confirm_token: pendingPlan?.confirm_token,
          tool: pendingPlan?.parsed_tool,
          params: pendingPlan?.parsed_params || {},
        }),
      });
      const data: ExecuteResponse = await res.json();

      if (data.status === "ok") {
        addMessage("assistant", `✅ ${data.message}\n\n${JSON.stringify(data.result, null, 2)}`, undefined, data);
      } else {
        addMessage("assistant", `❌ Fehler: ${data.error}`, undefined, data);
      }

      // Refresh ops data after execution
      fetchOpsData();
    } catch (err) {
      addMessage("assistant", `Fehler: ${String(err)}`);
    } finally {
      setLoading(false);
      setPendingPlan(null);
      setExecuteInput("");
      setStep("input");
    }
  };

  // -----------------------------------------------------------------------------
  // Render: Login
  // -----------------------------------------------------------------------------

  if (!token) {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.loginCard}>
          <h1 style={styles.loginTitle}>🎛️ AI Supervisor</h1>
          <p style={styles.loginSubtitle}>Control Center</p>
          <form onSubmit={handleLogin} style={styles.loginForm}>
            <input
              name="email"
              type="email"
              placeholder="Email"
              style={styles.input}
              required
              data-testid="login_input_email"
            />
            <input
              name="password"
              type="password"
              placeholder="Password"
              style={styles.input}
              required
              data-testid="login_input_password"
            />
            <button type="submit" style={styles.loginButton} data-testid="login_button_submit">
              Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------------
  // Render: Dashboard
  // -----------------------------------------------------------------------------

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.logo}>🎛️ AI Supervisor</h1>
          <nav style={styles.nav}>
            <a href="/dashboard" style={styles.navLinkActive}>Dashboard</a>
            <a href="/jobs" style={styles.navLink}>Jobs</a>
            <a href="/supervisor" style={styles.navLink}>Supervisor</a>
          </nav>
        </div>
        <button onClick={handleLogout} style={styles.logoutBtn} data-testid="dashboard_button_logout">
          Logout
        </button>
      </header>

      {/* Main Content */}
      <div style={styles.main}>
        {/* Left: Supervisor Chat Panel (60%) */}
        <div style={styles.chatPanel}>
          <div style={styles.panelHeader}>
            <h2>💬 Supervisor Chat</h2>
            <span style={styles.badge}>Stufe-5</span>
          </div>

          {/* Chat Messages */}
          <div style={styles.chatMessages} data-testid="dashboard_chat_messages">
            {messages.length === 0 && (
              <div style={styles.emptyChat}>
                <p>Starte eine Konversation...</p>
                <p style={styles.hint}>z.B. "Liste alle Jobs" oder "Erstelle Job: Server-Wartung"</p>
              </div>
            )}
            {messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  ...styles.message,
                  ...(msg.role === "user" ? styles.userMessage : styles.assistantMessage),
                }}
              >
                <div style={styles.messageHeader}>
                  <span style={styles.messageRole}>{msg.role === "user" ? "Du" : "Supervisor"}</span>
                  <span style={styles.messageTime}>
                    {new Date(msg.timestamp).toLocaleTimeString("de-DE")}
                  </span>
                </div>
                <pre style={styles.messageContent}>{msg.content}</pre>
              </div>
            ))}
          </div>

          {/* Chat Input Area */}
          <div style={styles.chatInput}>
            {step === "input" && (
              <>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Was möchtest du tun? (DE/BS/EN)"
                  style={styles.textarea}
                  disabled={loading}
                  data-testid="dashboard_input_command"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handlePlan();
                    }
                  }}
                />
                <button
                  onClick={handlePlan}
                  disabled={loading || !input.trim()}
                  style={styles.sendButton}
                  data-testid="dashboard_button_plan"
                >
                  {loading ? "..." : "📋 Plan"}
                </button>
              </>
            )}

            {step === "confirm" && (
              <div style={styles.confirmRow}>
                <button
                  onClick={() => handleConfirm(true)}
                  style={{ ...styles.actionButton, ...styles.yesButton }}
                  data-testid="dashboard_button_yes"
                >
                  ✅ Ja
                </button>
                <button
                  onClick={() => handleConfirm(false)}
                  style={{ ...styles.actionButton, ...styles.noButton }}
                  data-testid="dashboard_button_no"
                >
                  ❌ Nein
                </button>
              </div>
            )}

            {step === "execute" && (
              <div style={styles.executeRow}>
                <input
                  type="text"
                  value={executeInput}
                  onChange={(e) => setExecuteInput(e.target.value)}
                  style={styles.executeInput}
                  disabled={loading}
                  data-testid="dashboard_input_execute"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleExecute();
                    }
                  }}
                />
                <button
                  onClick={handleExecute}
                  disabled={loading}
                  style={{ ...styles.actionButton, ...styles.executeButton }}
                  data-testid="dashboard_button_execute"
                >
                  {loading ? "..." : "🚀 Ausführen"}
                </button>
                <button
                  onClick={() => {
                    setPendingPlan(null);
                    setStep("input");
                    addMessage("assistant", "❌ Abgebrochen.");
                  }}
                  style={styles.cancelButton}
                >
                  Abbrechen
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Ops Panel (40%) */}
        <div style={styles.opsPanel}>
          {/* Health Status */}
          <div style={styles.opsCard}>
            <h3 style={styles.opsCardTitle}>🏥 System Health</h3>
            {systemStatus ? (
              <>
                <div
                  style={{
                    ...styles.statusBadge,
                    background:
                      systemStatus.status === "healthy"
                        ? "#22c55e"
                        : systemStatus.status === "degraded"
                        ? "#f59e0b"
                        : "#ef4444",
                  }}
                >
                  {systemStatus.status.toUpperCase()}
                </div>
                <p style={styles.opsText}>Version: {systemStatus.version}</p>
                <p style={styles.opsText}>Uptime: {systemStatus.uptime_human}</p>
                <div style={styles.servicesList}>
                  {systemStatus.services.map((svc) => (
                    <div key={svc.name} style={styles.serviceRow}>
                      <span
                        style={{
                          ...styles.serviceDot,
                          background: svc.status === "healthy" ? "#22c55e" : "#ef4444",
                        }}
                      />
                      <span>{svc.name}</span>
                      {svc.latency_ms && <span style={styles.latency}>{svc.latency_ms}ms</span>}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p style={styles.opsText}>Lade...</p>
            )}
          </div>

          {/* Jobs Preview */}
          <div style={styles.opsCard}>
            <h3 style={styles.opsCardTitle}>📋 Jobs (letzte 10)</h3>
            {jobs.length === 0 ? (
              <p style={styles.opsText}>Keine Jobs</p>
            ) : (
              <div style={styles.jobsList}>
                {jobs.slice(0, 10).map((job) => (
                  <div key={job.id} style={styles.jobRow}>
                    <span
                      style={{
                        ...styles.jobStatus,
                        background: getStatusColor(job.status),
                      }}
                    >
                      {job.status}
                    </span>
                    <span style={styles.jobTitle}>{job.title}</span>
                  </div>
                ))}
              </div>
            )}
            <a href="/jobs" style={styles.viewAllLink}>
              Alle anzeigen →
            </a>
          </div>

          {/* Audit Preview */}
          <div style={styles.opsCard}>
            <h3 style={styles.opsCardTitle}>📝 Audit Log (letzte 10)</h3>
            {auditEvents.length === 0 ? (
              <p style={styles.opsText}>Keine Events</p>
            ) : (
              <div style={styles.auditList}>
                {auditEvents.slice(0, 10).map((event) => (
                  <div key={event.id} style={styles.auditRow}>
                    <span style={styles.auditAction}>{event.action}</span>
                    <span style={styles.auditActor}>{event.actor}</span>
                    <span style={styles.auditTime}>
                      {new Date(event.timestamp).toLocaleTimeString("de-DE")}
                    </span>
                  </div>
                ))}
              </div>
            )}
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
  // Login
  loginContainer: {
    minHeight: "100vh",
    background: "#0a0a0a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  loginCard: {
    background: "#1a1a1a",
    padding: 40,
    borderRadius: 16,
    width: 360,
    textAlign: "center",
  },
  loginTitle: {
    fontSize: 32,
    color: "#fff",
    margin: 0,
  },
  loginSubtitle: {
    color: "#888",
    marginBottom: 24,
  },
  loginForm: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  loginButton: {
    padding: "12px 24px",
    fontSize: 16,
    borderRadius: 8,
    border: "none",
    background: "#0070f3",
    color: "#fff",
    cursor: "pointer",
    fontWeight: "bold",
    marginTop: 8,
  },

  // Dashboard Layout
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

  // Main Layout
  main: {
    display: "flex",
    height: "calc(100vh - 65px)",
  },

  // Chat Panel
  chatPanel: {
    flex: "0 0 60%",
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid #222",
  },
  panelHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "16px 20px",
    borderBottom: "1px solid #222",
  },
  badge: {
    background: "#f59e0b",
    color: "#000",
    fontSize: 12,
    padding: "2px 8px",
    borderRadius: 4,
    fontWeight: "bold",
  },
  chatMessages: {
    flex: 1,
    overflow: "auto",
    padding: 20,
  },
  emptyChat: {
    textAlign: "center",
    color: "#666",
    marginTop: 100,
  },
  hint: {
    fontSize: 14,
    color: "#444",
    marginTop: 8,
  },
  message: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
  },
  userMessage: {
    background: "#1e3a5f",
    marginLeft: "20%",
  },
  assistantMessage: {
    background: "#1a1a1a",
    marginRight: "10%",
  },
  messageHeader: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 8,
    fontSize: 12,
  },
  messageRole: {
    fontWeight: "bold",
    color: "#888",
  },
  messageTime: {
    color: "#555",
  },
  messageContent: {
    margin: 0,
    whiteSpace: "pre-wrap",
    fontFamily: "inherit",
    fontSize: 14,
    lineHeight: 1.5,
  },

  // Chat Input
  chatInput: {
    padding: 16,
    borderTop: "1px solid #222",
    display: "flex",
    gap: 12,
  },
  textarea: {
    flex: 1,
    padding: 12,
    fontSize: 14,
    borderRadius: 8,
    border: "1px solid #333",
    background: "#1a1a1a",
    color: "#fff",
    resize: "none",
    minHeight: 60,
  },
  input: {
    padding: 12,
    fontSize: 16,
    borderRadius: 8,
    border: "1px solid #333",
    background: "#1a1a1a",
    color: "#fff",
    width: "100%",
  },
  sendButton: {
    padding: "12px 20px",
    fontSize: 14,
    borderRadius: 8,
    border: "none",
    background: "#0070f3",
    color: "#fff",
    cursor: "pointer",
    fontWeight: "bold",
    whiteSpace: "nowrap",
  },
  confirmRow: {
    display: "flex",
    gap: 12,
    width: "100%",
  },
  executeRow: {
    display: "flex",
    gap: 12,
    width: "100%",
    alignItems: "center",
  },
  executeInput: {
    flex: 1,
    padding: 12,
    fontSize: 14,
    borderRadius: 8,
    border: "1px solid #333",
    background: "#1a1a1a",
    color: "#fff",
  },
  actionButton: {
    padding: "12px 24px",
    fontSize: 14,
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontWeight: "bold",
  },
  yesButton: {
    background: "#22c55e",
    color: "#fff",
    flex: 1,
  },
  noButton: {
    background: "#ef4444",
    color: "#fff",
    flex: 1,
  },
  executeButton: {
    background: "#f59e0b",
    color: "#000",
  },
  cancelButton: {
    background: "transparent",
    color: "#888",
    border: "1px solid #444",
    padding: "8px 16px",
    borderRadius: 8,
    cursor: "pointer",
  },

  // Ops Panel
  opsPanel: {
    flex: "0 0 40%",
    overflow: "auto",
    padding: 20,
  },
  opsCard: {
    background: "#1a1a1a",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  opsCardTitle: {
    margin: "0 0 12px 0",
    fontSize: 16,
  },
  opsText: {
    color: "#888",
    fontSize: 14,
    margin: "4px 0",
  },
  statusBadge: {
    display: "inline-block",
    padding: "4px 12px",
    borderRadius: 4,
    fontWeight: "bold",
    fontSize: 12,
    marginBottom: 12,
  },
  servicesList: {
    marginTop: 12,
  },
  serviceRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    marginBottom: 6,
  },
  serviceDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
  },
  latency: {
    color: "#666",
    marginLeft: "auto",
  },
  jobsList: {
    maxHeight: 200,
    overflow: "auto",
  },
  jobRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    fontSize: 13,
  },
  jobStatus: {
    padding: "2px 6px",
    borderRadius: 4,
    fontSize: 11,
    color: "#fff",
  },
  jobTitle: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  viewAllLink: {
    display: "block",
    marginTop: 12,
    color: "#0070f3",
    fontSize: 13,
    textDecoration: "none",
  },
  auditList: {
    maxHeight: 200,
    overflow: "auto",
  },
  auditRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
    fontSize: 12,
  },
  auditAction: {
    background: "#222",
    padding: "2px 6px",
    borderRadius: 4,
  },
  auditActor: {
    color: "#888",
    flex: 1,
  },
  auditTime: {
    color: "#555",
  },
};
