import React from "react";

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
      return (
        <div style={{ padding: 20, color: "#fff" }}>
          <h2 style={{ marginBottom: 8 }}>{this.props.title || "Page crashed"}</h2>
          <p style={{ opacity: 0.9 }}>{this.state.message}</p>
        </div>
      );
    }

    return this.props.children;
  }
}
