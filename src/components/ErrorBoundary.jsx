import { Component } from "react";

// A screen that crashes shows what broke and a way out, instead of a blank
// page. Games and screens can wrap themselves in one too (label says which).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(`${this.props.label || "TUNR"} crashed:`, error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const reason = String(error?.message || error || "unknown error").slice(0, 200);
    return (
      <div role="alert" style={{ minHeight: this.props.inline ? 0 : "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center", background: "var(--n-0a0a0a)", color: "var(--n-f0f0f0)", fontFamily: "'Barlow', system-ui, sans-serif" }}>
        <div style={{ fontSize: 40 }}>🛠️</div>
        <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1 }}>{this.props.label ? `${this.props.label.toUpperCase()} HIT A PROBLEM` : "TUNR HIT A PROBLEM"}</div>
        <div style={{ fontSize: 14, color: "var(--n-aaaaaa)", maxWidth: 340 }}>Reason: {reason}</div>
        <div style={{ display: "flex", gap: 10 }}>
          {this.props.onClose && (
            <button onClick={() => (this.setState({ error: null }), this.props.onClose())} style={btn(false)}>
              GO BACK
            </button>
          )}
          <button onClick={() => window.location.reload()} style={btn(true)}>
            RELOAD
          </button>
        </div>
        <div style={{ fontSize: 12, color: "var(--n-777777)", maxWidth: 340 }}>If it keeps happening, send a screenshot of this to boostedstudiosllc@gmail.com.</div>
      </div>
    );
  }
}

const btn = (main) => ({ padding: "12px 22px", borderRadius: 10, border: main ? "none" : "1px solid var(--n-333333)", background: main ? "#0080F0" : "transparent", color: main ? "#fff" : "var(--n-dddddd, #ddd)", fontWeight: 800, letterSpacing: 1.2, cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14 });
