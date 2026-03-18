import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import Feed from "./components/Feed";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import Upload from "./pages/Upload";
import Reels from "./pages/Reels";
import HighlightsCreate from "./pages/HighlightsCreate";
import Notifications from "./pages/Notifications";
import Chat from "./pages/Chat";
import Profile from "./pages/Profile";
import AnonymousFeed from "./pages/AnonymousFeed";
import AnonymousUpload from "./pages/AnonymousUpload";
import AdminDashboard from "./AdminDashboard";
import AdminUsers from "./pages/AdminUsers";
import AdminPosts from "./pages/AdminPosts";
import AdminReports from "./pages/AdminReports";
import AdminLiveRecordings from "./pages/AdminLiveRecordings";
import AdminAnonymousPending from "./pages/AdminAnonymousPending";
import NotificationsPage from "./NotificationsPage";
import Dashboard from "./Dashboard";
import ProtectedRoute from "./components/ProtectedRoute";
import Unauthorized from "./pages/Unauthorized";
import ProfileSetup from "./pages/ProfileSetup";
import Settings from "./pages/Settings";
import SettingsSounds from "./pages/SettingsSounds";
import SettingsLocation from "./pages/SettingsLocation";
import SOSPage from "./pages/SOSPage";
import SOSNavigate from "./pages/SOSNavigate";
import AdminLayout from "./AdminLayout";
import Saved from "./pages/Saved";
import FollowRequests from "./pages/FollowRequests";
import LongVideos from "./pages/LongVideos";
import FollowConnections from "./pages/FollowConnections";
import LiveRecordings from "./pages/LiveRecordings";
import LiveStart from "./pages/LiveStart";
import StoryCreate from "./pages/StoryCreate";
import { getUserRole, isAuthenticated } from "./auth";
import { getApiBaseUrl } from "./api/baseUrl";
import api from "./api/axios";
import PageErrorBoundary from "./components/PageErrorBoundary";
import "./App.css";

const isLoopbackHost = (host) => {
  const value = String(host || "").trim().toLowerCase();
  return value === "localhost" || value === "127.0.0.1";
};

const isPrivateIpHost = (host) => {
  const value = String(host || "").trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return false;
  const parts = value.split(".").map((n) => Number(n));
  if (parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
};

function PublicOnlyRoute({ children }) {
  if (!isAuthenticated()) return children;
  return <Navigate to={getUserRole() === "ADMIN" ? "/admin/dashboard" : "/feed"} replace />;
}

function AppRoutes() {
  const location = useLocation();
  const authed = isAuthenticated();
  const isAuthScreen =
    location.pathname === "/login" ||
    location.pathname === "/register" ||
    location.pathname === "/forgot-password";
  const isReelsRoute = location.pathname === "/reels";
  const isChatRoute = location.pathname === "/chat" || location.pathname.startsWith("/chat/");
  const isChatConversationRoute = location.pathname.startsWith("/chat/");
  const showUserNavbar = authed && !location.pathname.startsWith("/admin") && !isAuthScreen && !isChatConversationRoute;

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

  useEffect(() => {
    if (isAuthScreen || !navigator.geolocation) return undefined;
    let active = true;
    let watchId = null;
    let lastSentAt = 0;
    const minSendGapMs = 8000;
    let intervalId = null;

    const sendPresence = (latitude, longitude) => {
      if (!active) return;
      if (typeof latitude !== "number" || typeof longitude !== "number") return;
      const reporterEmail =
        String(localStorage.getItem("email") || sessionStorage.getItem("email") || "").trim() || undefined;
      if (!authed && !reporterEmail) return;
      const now = Date.now();
      if (now - lastSentAt < minSendGapMs) return;
      lastSentAt = now;
      const payload = { latitude, longitude, reporterEmail };
      const storedBase =
        localStorage.getItem("socialsea_auth_base_url") || sessionStorage.getItem("socialsea_auth_base_url");
      const runtimeHost =
        typeof window !== "undefined" ? String(window.location.hostname || "").trim() : "";
      const runtimeHostBase =
        runtimeHost && (isLoopbackHost(runtimeHost) || isPrivateIpHost(runtimeHost))
          ? `http://${runtimeHost}:8080`
          : "";
      const bases = [
        getApiBaseUrl(),
        api.defaults.baseURL,
        storedBase,
        runtimeHostBase,
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "https://api.socialsea.co.in"
      ].filter((value, index, arr) => value && arr.indexOf(value) === index);
      bases.forEach((baseURL, index) => {
        api
          .request({
            method: "POST",
            url: "/api/emergency/presence",
            data: payload,
            baseURL,
            skipAuth: true
          })
          .catch(() => {
            if (index === bases.length - 1) {
              // ignore final failure
            }
          });
      });
    };

    const onPos = (pos) => {
      sendPresence(pos?.coords?.latitude, pos?.coords?.longitude);
    };

    const requestOnce = () => {
      navigator.geolocation.getCurrentPosition(onPos, () => {}, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 15000
      });
    };

    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((status) => {
          if (!active) return;
          if (status.state === "granted") {
            requestOnce();
          } else {
            // Trigger prompt for users who haven't granted location yet.
            requestOnce();
          }
        })
        .catch(() => {
          requestOnce();
        });
    } else {
      requestOnce();
    }
    watchId = navigator.geolocation.watchPosition(onPos, () => {}, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 60000
    });

    const onVisibility = () => {
      if (document.visibilityState === "visible") requestOnce();
    };
    document.addEventListener("visibilitychange", onVisibility);
    intervalId = setInterval(requestOnce, 10000);

    return () => {
      active = false;
      if (watchId != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [authed, isAuthScreen]);

  return (
    <>
      {showUserNavbar && <Navbar />}
      <main
        className={`app-main ${showUserNavbar ? "with-user-nav" : ""} ${isChatRoute ? "chat-main-route" : ""} ${
          isChatConversationRoute ? "chat-conversation-route" : ""
        } ${isReelsRoute ? "reels-main-route" : ""} ${
          showUserNavbar ? "bg-black text-white" : ""
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
              <Route path="/watch" element={<ProtectedRoute><LongVideos /></ProtectedRoute>} />
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
              <Route path="/live-recordings" element={<ProtectedRoute><LiveRecordings /></ProtectedRoute>} />
              <Route path="/live" element={<Navigate to="/live/start" replace />} />
              <Route path="/live/start" element={<ProtectedRoute><LiveStart /></ProtectedRoute>} />
              <Route path="/story/create" element={<ProtectedRoute><StoryCreate /></ProtectedRoute>} />
              <Route path="/highlights/create" element={<ProtectedRoute><HighlightsCreate /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/settings/sounds" element={<ProtectedRoute><SettingsSounds /></ProtectedRoute>} />
              <Route path="/settings/location" element={<ProtectedRoute><SettingsLocation /></ProtectedRoute>} />
              <Route path="/sos" element={<ProtectedRoute><SOSPage /></ProtectedRoute>} />
              <Route path="/sos/live/:alertId" element={<ProtectedRoute><SOSPage /></ProtectedRoute>} />
              <Route path="/sos/navigate/:alertId" element={<ProtectedRoute><SOSNavigate /></ProtectedRoute>} />
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
                <Route path="live-recordings" element={<AdminLiveRecordings />} />
                <Route path="reports" element={<AdminReports />} />
                <Route path="anonymous/pending" element={<AdminAnonymousPending />} />
                <Route path="notifications" element={<NotificationsPage />} />
              </Route>

              <Route path="/unauthorized" element={<Unauthorized />} />
              <Route path="*" element={<Navigate to={authed ? "/feed" : "/login"} replace />} />
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
