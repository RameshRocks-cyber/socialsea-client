import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import Feed from "./components/Feed";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import Upload from "./pages/Upload";
import Reels from "./pages/Reels";
import Notifications from "./pages/Notifications";
import Chat from "./pages/Chat";
import Profile from "./pages/Profile";
import AnonymousFeed from "./pages/AnonymousFeed";
import AnonymousUpload from "./pages/AnonymousUpload";
import AdminDashboard from "./AdminDashboard";
import AdminUsers from "./pages/AdminUsers";
import AdminPosts from "./pages/AdminPosts";
import AdminReports from "./pages/AdminReports";
import AdminAnonymousPending from "./pages/AdminAnonymousPending";
import NotificationsPage from "./NotificationsPage";
import Dashboard from "./Dashboard";
import ProtectedRoute from "./components/ProtectedRoute";
import Unauthorized from "./pages/Unauthorized";
import ProfileSetup from "./pages/ProfileSetup";
import Settings from "./pages/Settings";
import SOSPage from "./pages/SOSPage";
import AdminLayout from "./AdminLayout";
import Saved from "./pages/Saved";
import FollowRequests from "./pages/FollowRequests";
import LongVideos from "./pages/LongVideos";
import FollowConnections from "./pages/FollowConnections";
import LiveRecordings from "./pages/LiveRecordings";
import { getUserRole, isAuthenticated } from "./auth";
import PageErrorBoundary from "./components/PageErrorBoundary";
import "./App.css";

function PublicOnlyRoute({ children }) {
  if (!isAuthenticated()) return children;
  return <Navigate to={getUserRole() === "ADMIN" ? "/admin/dashboard" : "/feed"} replace />;
}

function AppRoutes() {
  const location = useLocation();
  const isAuthScreen =
    location.pathname === "/login" ||
    location.pathname === "/register" ||
    location.pathname === "/forgot-password";
  const showUserNavbar = isAuthenticated() && !location.pathname.startsWith("/admin") && !isAuthScreen;
  const isReelsRoute = location.pathname === "/reels";
  const isChatRoute = location.pathname === "/chat" || location.pathname.startsWith("/chat/");
  const isChatConversationRoute = location.pathname.startsWith("/chat/");

  useEffect(() => {
    const handleVideoPlay = (event) => {
      const current = event.target;
      if (!(current instanceof HTMLVideoElement)) return;
      if (current.dataset.allowSimultaneous === "true") return;

      document.querySelectorAll("video").forEach((video) => {
        if (video !== current && !video.paused && video.dataset.allowSimultaneous !== "true") {
          video.pause();
        }
      });
    };

    document.addEventListener("play", handleVideoPlay, true);
    return () => document.removeEventListener("play", handleVideoPlay, true);
  }, []);

  return (
    <>
      {showUserNavbar && <Navbar />}
      <main
        className={`app-main ${showUserNavbar ? "with-user-nav" : ""} ${isChatRoute ? "chat-main-route" : ""} ${
          isChatConversationRoute ? "chat-conversation-route" : ""
        } ${
          showUserNavbar ? "bg-gradient-to-br from-blue-950 via-slate-900 to-blue-900 text-white" : ""
        }`}
      >
        <div className={`app-content ${isReelsRoute ? "reels-content" : ""} ${isChatRoute ? "chat-content" : ""}`}>
          <PageErrorBoundary title="Page crashed">
            <Routes>
              <Route path="/" element={<Navigate to={isAuthenticated() ? "/feed" : "/login"} replace />} />
              <Route path="/home" element={<Navigate to={isAuthenticated() ? "/feed" : "/login"} replace />} />
              <Route path="/feed" element={<ProtectedRoute><Feed /></ProtectedRoute>} />
              <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
              <Route path="/register" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />
              <Route path="/forgot-password" element={<PublicOnlyRoute><ForgotPassword /></PublicOnlyRoute>} />
              <Route path="/upload" element={<ProtectedRoute><Upload /></ProtectedRoute>} />
              <Route path="/reels" element={<ProtectedRoute><Reels /></ProtectedRoute>} />
              <Route path="/watch/:postId" element={<ProtectedRoute><LongVideos /></ProtectedRoute>} />
              <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
              <Route
                path="/chat"
                element={
                  <ProtectedRoute>
                    <PageErrorBoundary title="Chat crashed">
                      <Chat />
                    </PageErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/chat/:contactId"
                element={
                  <ProtectedRoute>
                    <PageErrorBoundary title="Chat crashed">
                      <Chat />
                    </PageErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route path="/profile/:username/followers" element={<ProtectedRoute><FollowConnections /></ProtectedRoute>} />
              <Route path="/profile/:username/following" element={<ProtectedRoute><FollowConnections /></ProtectedRoute>} />
              <Route path="/profile/:username" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/profile/live-recordings" element={<ProtectedRoute><LiveRecordings /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/sos" element={<ProtectedRoute><SOSPage /></ProtectedRoute>} />
              <Route path="/sos/live/:alertId" element={<ProtectedRoute><SOSPage /></ProtectedRoute>} />
              <Route path="/saved" element={<ProtectedRoute><Saved /></ProtectedRoute>} />
              <Route path="/follow-requests" element={<ProtectedRoute><FollowRequests /></ProtectedRoute>} />
              <Route path="/profile-setup" element={<ProtectedRoute><ProfileSetup /></ProtectedRoute>} />
              <Route path="/anonymous-feed" element={<ProtectedRoute><AnonymousFeed /></ProtectedRoute>} />
              <Route path="/anonymous/upload" element={<ProtectedRoute><AnonymousUpload /></ProtectedRoute>} />

              <Route path="/admin" element={<ProtectedRoute role="ADMIN"><AdminLayout /></ProtectedRoute>}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<AdminDashboard />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="posts" element={<AdminPosts />} />
                <Route path="reports" element={<AdminReports />} />
                <Route path="anonymous/pending" element={<AdminAnonymousPending />} />
                <Route path="notifications" element={<NotificationsPage />} />
              </Route>

              <Route path="/unauthorized" element={<Unauthorized />} />
              <Route path="*" element={<Navigate to={isAuthenticated() ? "/feed" : "/login"} replace />} />
            </Routes>
          </PageErrorBoundary>
        </div>
      </main>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
