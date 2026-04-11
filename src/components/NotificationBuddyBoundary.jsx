import React from "react";
import NotificationBuddy from "./NotificationBuddy";

export default class NotificationBuddyBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    // Keep the app running even if the buddy throws.
    console.error("NotificationBuddy crashed:", error);
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.enabled !== this.props.enabled) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) return null;
    return <NotificationBuddy {...this.props} />;
  }
}
