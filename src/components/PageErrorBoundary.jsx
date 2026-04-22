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
        <div
          style={{
            margin: "16px auto",
            maxWidth: 720,
            padding: 16,
            borderRadius: 12,
            border: "1px solid #f3b0b0",
            background: "#fff5f5",
            color: "#1f1f1f"
          }}
        >
          <h2 style={{ marginBottom: 8 }}>{this.props.title || "Page crashed"}</h2>
          <p style={{ opacity: 0.9, marginBottom: chunkLoadError ? 12 : 0, color: "#3a3a3a" }}>{description}</p>
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
