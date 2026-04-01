import React from "react";
import { isRetryableChunkError } from "../utils/lazyWithRetry";

export default class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || "Unexpected page error"
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Page crash:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const chunkLoadError = isRetryableChunkError(this.state.message);
      const description = chunkLoadError
        ? "A newer version of this page is available. Refresh once to load the latest files."
        : this.state.message;

      return (
        <div style={{ padding: 20, color: "#fff" }}>
          <h2 style={{ marginBottom: 8 }}>{this.props.title || "Page crashed"}</h2>
          <p style={{ opacity: 0.9, marginBottom: chunkLoadError ? 12 : 0 }}>{description}</p>
          {chunkLoadError ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: 999,
                background: "#fff",
                color: "#0b0b0f",
                padding: "8px 14px",
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              Refresh page
            </button>
          ) : null}
        </div>
      );
    }

    return this.props.children;
  }
}
