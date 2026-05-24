// Top-level error boundary. Any render-time exception bubbling up to <App />
// lands here instead of leaving the user with a blank window.
//
// Recovery affordances, in increasing severity:
//   1. "Try again" — clears the error state and re-renders. Use when the
//      cause looks transient (e.g. a one-off SVG layout glitch).
//   2. "Reload" — full window reload. Use when state has gone bad but disk
//      content (~/Library/.../spice-sim) is fine.
//   3. "Reset workspace" — clears the in-browser workspace (localStorage)
//      and reloads. Last resort for a corrupted CircuitDoc in storage.

import { Component, type ReactNode } from "react";

interface State {
  error: Error | null;
  info: string | null;
}

interface Props {
  children: ReactNode;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, info: null };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack?: string }) {
    // Surface in dev tools; in release this is the only trail we get.
    console.error("[Spice Sim] render error", error, errorInfo);
    this.setState({ info: errorInfo.componentStack ?? null });
  }

  private retry = () => {
    this.setState({ error: null, info: null });
  };

  private reload = () => {
    window.location.reload();
  };

  private resetWorkspace = () => {
    if (
      !confirm(
        "Reset workspace? This clears all projects stored in this browser. " +
          "Files you saved to disk are not affected.",
      )
    ) {
      return;
    }
    try {
      // Only clear our own keys — leave other localStorage alone.
      const ours: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("spicesim.")) ours.push(k);
      }
      for (const k of ours) localStorage.removeItem(k);
    } catch {
      /* ignore — we're about to reload anyway */
    }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    const e = this.state.error;
    return (
      <div className="error-boundary">
        <div className="error-boundary-card">
          <div className="error-boundary-title">Something went wrong</div>
          <div className="error-boundary-message">{e.message || String(e)}</div>
          {this.state.info && (
            <details className="error-boundary-details">
              <summary>Stack trace</summary>
              <pre>{this.state.info}</pre>
            </details>
          )}
          <div className="error-boundary-actions">
            <button onClick={this.retry}>Try again</button>
            <button onClick={this.reload}>Reload</button>
            <button onClick={this.resetWorkspace} className="danger">
              Reset workspace…
            </button>
          </div>
        </div>
      </div>
    );
  }
}
