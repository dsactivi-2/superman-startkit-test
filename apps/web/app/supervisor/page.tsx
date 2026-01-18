"use client";

import { useState, useEffect } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "https://svapi.activi.io";

interface PlanResponse {
  status: string;
  language: string;
  summary: string[];
  plan: string[];
  tools: string[];
  tool_type: string;
  confirm_question: string;
  confirm_token?: string;
  execute_instruction?: string;
  parsed_tool?: string;
  parsed_params?: Record<string, unknown>;
  error?: string;
  result?: unknown;
}

interface ExecuteResponse {
  status: string;
  language: string;
  message: string;
  result?: unknown;
  error?: string;
}

export default function SupervisorPage() {
  const [token, setToken] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"input" | "confirm" | "execute" | "result">("input");
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [executeInput, setExecuteInput] = useState("");
  const [result, setResult] = useState<ExecuteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check for existing token
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
        setError(data.detail || "Login failed");
      }
    } catch (err) {
      setError(String(err));
    }
  };

  const handlePlan = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`${API_BASE}/supervisor/plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ text: input }),
      });
      const data: PlanResponse = await res.json();
      
      if (data.status === "error" || data.status === "unclear") {
        setError(data.error || "Unknown error");
        setStep("input");
      } else if (data.tool_type === "READ") {
        // READ tools return result immediately
        setPlan(data);
        setResult({ status: "ok", language: data.language, message: "READ completed", result: data });
        setStep("result");
      } else {
        // WRITE tools need confirmation
        setPlan(data);
        setStep("confirm");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = (confirmed: boolean) => {
    if (!confirmed) {
      resetState();
      return;
    }
    setStep("execute");
    const action = plan?.parsed_tool?.split(".")[1]?.toUpperCase() || "ACTION";
    setExecuteInput(`EXECUTE ${action}`);
  };

  const handleExecute = async () => {
    if (!executeInput.trim().toUpperCase().startsWith("EXECUTE")) {
      setError("Bitte schreibe: EXECUTE <AKTION>");
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`${API_BASE}/supervisor/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          execute_command: executeInput,
          confirm_token: plan?.confirm_token,
          tool: plan?.parsed_tool,
          params: plan?.parsed_params || {},
        }),
      });
      const data: ExecuteResponse = await res.json();
      setResult(data);
      setStep("result");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const resetState = () => {
    setStep("input");
    setInput("");
    setPlan(null);
    setExecuteInput("");
    setResult(null);
    setError(null);
  };

  // Login form
  if (!token) {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>🎛️ AI Supervisor Control</h1>
        <form onSubmit={handleLogin} style={styles.form}>
          <input name="email" type="email" placeholder="Email" style={styles.input} required />
          <input name="password" type="password" placeholder="Password" style={styles.input} required />
          <button type="submit" style={styles.button}>Login</button>
        </form>
        {error && <div style={styles.error}>{error}</div>}
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>🎛️ AI Supervisor Control</h1>
        <button onClick={() => { setToken(null); localStorage.removeItem("supervisor_token"); }} style={styles.logoutBtn}>
          Logout
        </button>
      </div>

      {/* Step: Input */}
      {step === "input" && (
        <div style={styles.card}>
          <h2>Was möchtest du tun? (DE/BS/EN)</h2>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="z.B. 'Liste Jobs' oder 'Erstelle Job: Server-Wartung'"
            style={styles.textarea}
            data-testid="supervisor_input_command"
          />
          <button 
            onClick={handlePlan} 
            disabled={loading || !input.trim()}
            style={styles.button}
            data-testid="supervisor_button_plan"
          >
            {loading ? "Analysiere..." : "Plan erstellen"}
          </button>
        </div>
      )}

      {/* Step: Confirm */}
      {step === "confirm" && plan && (
        <div style={styles.card}>
          <h2>📋 Confirmation Summary</h2>
          <div style={styles.summary}>
            <h3>Verstanden:</h3>
            <ul>
              {plan.summary.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
            <h3>Plan:</h3>
            <ol>
              {plan.plan.map((p, i) => <li key={i}>{p}</li>)}
            </ol>
            <h3>Tools: <code>{plan.tools.join(", ")}</code></h3>
            <p><strong>Typ:</strong> {plan.tool_type}</p>
          </div>
          <p style={styles.confirmQ}>{plan.confirm_question}</p>
          <div style={styles.buttonRow}>
            <button 
              onClick={() => handleConfirm(true)} 
              style={{...styles.button, ...styles.yesBtn}}
              data-testid="supervisor_button_yes"
            >
              ✅ Ja
            </button>
            <button 
              onClick={() => handleConfirm(false)} 
              style={{...styles.button, ...styles.noBtn}}
              data-testid="supervisor_button_no"
            >
              ❌ Nein
            </button>
          </div>
        </div>
      )}

      {/* Step: Execute */}
      {step === "execute" && plan && (
        <div style={styles.card}>
          <h2>🔐 Bestätigung erforderlich</h2>
          <p>{plan.execute_instruction}</p>
          <input
            type="text"
            value={executeInput}
            onChange={(e) => setExecuteInput(e.target.value)}
            style={styles.input}
            data-testid="supervisor_input_execute"
          />
          <button 
            onClick={handleExecute} 
            disabled={loading}
            style={{...styles.button, ...styles.executeBtn}}
            data-testid="supervisor_button_execute"
          >
            {loading ? "Ausführen..." : "🚀 Ausführen"}
          </button>
          <button onClick={resetState} style={styles.cancelBtn}>Abbrechen</button>
        </div>
      )}

      {/* Step: Result */}
      {step === "result" && result && (
        <div style={styles.card}>
          <h2>{result.status === "ok" ? "✅ Ergebnis" : "❌ Fehler"}</h2>
          {result.message && <p>{result.message}</p>}
          {result.error && <div style={styles.error}>{result.error}</div>}
          {result.result && (
            <pre style={styles.result}>
              {JSON.stringify(result.result, null, 2)}
            </pre>
          )}
          <button onClick={resetState} style={styles.button} data-testid="supervisor_button_new">
            Neue Anfrage
          </button>
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 800,
    margin: "0 auto",
    padding: 20,
    minHeight: "100vh",
    background: "#0a0a0a",
    color: "#fff",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    margin: 0,
  },
  logoutBtn: {
    background: "#333",
    color: "#fff",
    border: "none",
    padding: "8px 16px",
    borderRadius: 4,
    cursor: "pointer",
  },
  card: {
    background: "#1a1a1a",
    padding: 24,
    borderRadius: 12,
    marginBottom: 20,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  input: {
    padding: 12,
    fontSize: 16,
    borderRadius: 8,
    border: "1px solid #333",
    background: "#222",
    color: "#fff",
  },
  textarea: {
    padding: 12,
    fontSize: 16,
    borderRadius: 8,
    border: "1px solid #333",
    background: "#222",
    color: "#fff",
    minHeight: 100,
    width: "100%",
    resize: "vertical",
    marginBottom: 12,
  },
  button: {
    padding: "12px 24px",
    fontSize: 16,
    borderRadius: 8,
    border: "none",
    background: "#0070f3",
    color: "#fff",
    cursor: "pointer",
    fontWeight: "bold",
  },
  yesBtn: {
    background: "#22c55e",
  },
  noBtn: {
    background: "#ef4444",
  },
  executeBtn: {
    background: "#f59e0b",
  },
  cancelBtn: {
    background: "transparent",
    color: "#888",
    border: "1px solid #444",
    padding: "8px 16px",
    borderRadius: 8,
    marginTop: 12,
    cursor: "pointer",
  },
  buttonRow: {
    display: "flex",
    gap: 12,
    marginTop: 16,
  },
  summary: {
    background: "#222",
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  confirmQ: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#f59e0b",
  },
  result: {
    background: "#222",
    padding: 16,
    borderRadius: 8,
    overflow: "auto",
    fontSize: 14,
    maxHeight: 400,
  },
  error: {
    background: "#3f1a1a",
    color: "#f87171",
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
};
