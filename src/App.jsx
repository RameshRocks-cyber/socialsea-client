import { Suspense, lazy, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, useLocation, Navigate, useNavigate } from "react-router-dom";
import { useLayoutEffect } from "react";
import Navbar from "./components/Navbar";
import NotificationBuddyBoundary from "./components/NotificationBuddyBoundary";
import GestureCursor from "./components/GestureCursor";
import Feed from "./components/Feed";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import Upload from "./pages/Upload";
import Reels from "./pages/Reels";
import HighlightsCreate from "./pages/HighlightsCreate";
import Notifications from "./pages/Notifications";
import Profile from "./pages/Profile";
import AnonymousFeed from "./pages/AnonymousFeed";
import AnonymousUpload from "./pages/AnonymousUpload";
import AdminDashboard from "./AdminDashboard";
import AdminUsers from "./pages/AdminUsers";
import AdminPosts from "./pages/AdminPosts";
import AdminReports from "./pages/AdminReports";
import AdminLiveRecordings from "./pages/AdminLiveRecordings";
import AdminAnonymousPending from "./pages/AdminAnonymousPending";
import AdminAmbulanceRequests from "./pages/AdminAmbulanceRequests";
import NotificationsPage from "./NotificationsPage";
import Dashboard from "./Dashboard";
import ProtectedRoute from "./components/ProtectedRoute";
import Unauthorized from "./pages/Unauthorized";
import ProfileSetup from "./pages/ProfileSetup";
import Settings from "./pages/Settings";
import SettingsAppearance from "./pages/SettingsAppearance";
import YourActivity from "./pages/YourActivity";
import SettingsContentTypes from "./pages/SettingsContentTypes";
import SettingsSounds from "./pages/SettingsSounds";
import SettingsLocation from "./pages/SettingsLocation";
import SettingsPrivacy from "./pages/SettingsPrivacy";
import SettingsLanguage from "./pages/SettingsLanguage";
import SettingsLoginActivity from "./pages/SettingsLoginActivity";
import NotificationBuddySettings from "./pages/NotificationBuddySettings";
import SettingsManage from "./pages/SettingsManage";
import SOSPage from "./pages/SOSPage";
import SOSNavigate from "./pages/SOSNavigate";
import AmbulanceNavigation from "./pages/AmbulanceNavigation";
import AdminLayout from "./AdminLayout";
import Saved from "./pages/Saved";
import { applyUiLanguageFromStorage, readPreferredLanguageSetting, syncPreferredLanguageFromBackend } from "./i18n/uiLanguage";
import FollowRequests from "./pages/FollowRequests";
import LongVideos from "./pages/LongVideos";
import FollowConnections from "./pages/FollowConnections";
import LiveRecordings from "./pages/LiveRecordings";
import StorageVault from "./pages/StorageVault";
import StorageVaultUnlock from "./pages/StorageVaultUnlock";
import LiveStart from "./pages/LiveStart";
import VideoCall from "./pages/VideoCall";
import { ChatProvider } from "./pages/hooks/useChat";
import StoryCreate from "./pages/StoryCreate";
import StoriesPage from "./pages/StoriesPage";
import Jobs from "./pages/Jobs";
import CompanyProfile from "./pages/CompanyProfile";
import CompanyHub from "./pages/CompanyHub";
import JobDetail from "./pages/JobDetail";
import JobApply from "./pages/JobApply";
import JobNotifications from "./pages/JobNotifications";
import JobProfile from "./pages/JobProfile";
import PostJob from "./pages/PostJob";
import ResumeBuilder from "./pages/ResumeBuilder";
import ApplicantInbox from "./pages/ApplicantInbox.jsx";
import AppliedJobs from "./pages/AppliedJobs.jsx";
import ApplicantProfile from "./pages/ApplicantProfile.jsx";
import { getUserRole, isAuthenticated } from "./auth";
import { getApiBaseUrl } from "./api/baseUrl";
import api from "./api/axios";
import { pingChatPresence } from "./api/chatPresence";
import PageErrorBoundary from "./components/PageErrorBoundary";
import { recordExternalLinkActivity, recordTimeSpent, resolveRouteLabel } from "./services/activityStore";
import { lazyWithRetry } from "./utils/lazyWithRetry";
import "./App.css";

const Chat = lazy(lazyWithRetry(() => import("./pages/Chat"), "chat-page"));

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

const SWIPE_MIN_DISTANCE_PX = 72;
const SWIPE_MAX_DURATION_MS = 700;
const SWIPE_DOMINANCE_RATIO = 1.2;
const PRESENCE_HEARTBEAT_MS = 20000;
const SETTINGS_KEY = "socialsea_settings_v1";

const readShowSosInNavbar = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return true;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.showSosInNavbar === "boolean") return parsed.showSosInNavbar;
    return true;
  } catch {
    return true;
  }
};

const readAmbulanceNavigationEnabled = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.ambulanceNavigation === "boolean") return parsed.ambulanceNavigation;
    return false;
  } catch {
    return false;
  }
};

const getSwipeTabs = () => {
  const showSosInNavbar = readShowSosInNavbar();
  const ambulanceNavigationEnabled = readAmbulanceNavigationEnabled();

  const tabs = [
    { path: "/feed", match: (pathname) => pathname === "/feed" || pathname === "/home" || pathname === "/" },
    ambulanceNavigationEnabled
      ? {
          path: "/ambulance",
          match: (pathname) => pathname === "/ambulance" || pathname.startsWith("/ambulance/")
        }
      : { path: "/reels", match: (pathname) => pathname === "/reels" },
    { path: "/chat", match: (pathname) => pathname === "/chat" || pathname.startsWith("/chat/") },
    { path: "/notifications", match: (pathname) => pathname === "/notifications" },
    { path: "/profile/me", match: (pathname) => pathname.startsWith("/profile") },
  ];

  if (showSosInNavbar) {
    tabs.unshift({
      path: "/sos",
      match: (pathname) => pathname === "/sos" || pathname.startsWith("/sos/")
    });
  }

  return tabs;
};

const getSwipeTabIndex = (pathname, tabs) => tabs.findIndex((tab) => tab.match(pathname));

const resolveSwipeTabPath = (index, tabs) => tabs[index]?.path || "";

const shouldIgnoreSwipeTarget = (target) => {
  if (!(target instanceof Element)) return false;
  if (target.closest("[data-no-page-swipe], .no-page-swipe")) return true;
  if (target.closest("input, textarea, select, option, [contenteditable='true']")) {
    return true;
  }
  return false;
};

const canAncestorHandleHorizontalSwipe = (target, deltaX) => {
  if (!(target instanceof Element) || typeof window === "undefined") return false;
  let current = target;
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    const overflowX = String(style?.overflowX || "").toLowerCase();
    const canScrollX = (overflowX === "auto" || overflowX === "scroll") && current.scrollWidth - current.clientWidth > 6;
    if (canScrollX) {
      if (deltaX < 0 && current.scrollLeft + current.clientWidth < current.scrollWidth - 4) return true;
      if (deltaX > 0 && current.scrollLeft > 4) return true;
    }
    current = current.parentElement;
  }
  return false;
};

function PublicOnlyRoute({ children }) {
  if (!isAuthenticated()) return children;
  return <Navigate to={getUserRole() === "ADMIN" ? "/admin/dashboard" : "/feed"} replace />;
}

function AppRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const authed = isAuthenticated();
  const isAuthScreen =
    location.pathname === "/login" ||
    location.pathname === "/register" ||
    location.pathname === "/forgot-password";
  const isReelsRoute = location.pathname === "/reels";
  const isChatRoute = location.pathname === "/chat" || location.pathname.startsWith("/chat/");
  const isChatConversationRoute =
    location.pathname.startsWith("/chat/") && !location.pathname.startsWith("/chat/requests");
  const shouldMountUserNavbar = authed && !location.pathname.startsWith("/admin") && !isAuthScreen;
  const showUserNavbar = shouldMountUserNavbar && !isChatConversationRoute;
  const appMainRef = useRef(null);
  const routeTimerRef = useRef({ pathname: "", startedAt: 0 });
  const swipeStateRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    startAt: 0,
    target: null
  });

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
    if (!authed) return undefined;
    syncPreferredLanguageFromBackend();
    return undefined;
  }, [authed]);

  useLayoutEffect(() => {
    if (typeof document === "undefined") return undefined;

    const lang = readPreferredLanguageSetting();
    const html = document.documentElement;

    if (!lang || lang === "en") {
      html.classList.remove("ss-lang-transition");
      return undefined;
    }

    // Google Translate updates the DOM asynchronously. During SPA navigation this can cause
    // a brief flash of the previous language before the new route is translated.
    // Hide the app briefly so users don't see the language "blink" between states.
    html.classList.add("ss-lang-transition");
    applyUiLanguageFromStorage();

    const timer = window.setTimeout(() => {
      html.classList.remove("ss-lang-transition");
    }, 280);

    return () => {
      window.clearTimeout(timer);
      html.classList.remove("ss-lang-transition");
    };
  }, [location.pathname]);

  useEffect(() => {
    const refresh = () => {
      const lang = readPreferredLanguageSetting();
      if (!lang || lang === "en") return;
      applyUiLanguageFromStorage();
    };
    window.addEventListener("ss-settings-update", refresh);
    return () => window.removeEventListener("ss-settings-update", refresh);
  }, []);

  useEffect(() => {
    if (!authed || isAuthScreen || location.pathname.startsWith("/admin")) {
      routeTimerRef.current = { pathname: "", startedAt: 0 };
      return undefined;
    }

    const startedAt = Date.now();
    const previous = routeTimerRef.current;
    if (previous.pathname && previous.startedAt) {
      recordTimeSpent({
        pathname: previous.pathname,
        milliseconds: startedAt - previous.startedAt
      });
    }

    routeTimerRef.current = { pathname: location.pathname, startedAt };
    return undefined;
  }, [authed, isAuthScreen, location.pathname]);

  useEffect(() => {
    if (!authed || isAuthScreen || location.pathname.startsWith("/admin")) return undefined;

    const flushCurrentRoute = () => {
      const current = routeTimerRef.current;
      if (!current.pathname || !current.startedAt) return;
      recordTimeSpent({
        pathname: current.pathname,
        milliseconds: Date.now() - current.startedAt
      });
      routeTimerRef.current = { ...current, startedAt: 0 };
    };

    const restartTimer = () => {
      routeTimerRef.current = { pathname: location.pathname, startedAt: Date.now() };
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushCurrentRoute();
      } else {
        restartTimer();
      }
    };

    const onBeforeUnload = () => {
      flushCurrentRoute();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      flushCurrentRoute();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [authed, isAuthScreen, location.pathname]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const onDocumentClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!anchor) return;
      const href = String(anchor.getAttribute("href") || "").trim();
      if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }

      try {
        const resolved = new URL(href, window.location.origin);
        if (resolved.origin === window.location.origin) return;
        recordExternalLinkActivity({
          url: resolved.toString(),
          label: anchor.textContent || anchor.getAttribute("aria-label") || resolved.hostname,
          source: resolveRouteLabel(location.pathname)
        });
      } catch {
        // ignore malformed URLs
      }
    };

    document.addEventListener("click", onDocumentClick, true);
    return () => document.removeEventListener("click", onDocumentClick, true);
  }, [location.pathname]);

  useEffect(() => {
    if (isAuthScreen || !navigator.geolocation) return undefined;
    let active = true;
    let watchId = null;
    let lastSentAt = 0;
    const minSendGapMs = 8000;
    let intervalId = null;

    const normalizePresenceBase = (rawValue) => {
      const value = String(rawValue || "").trim().replace(/\/+$/, "");
      if (!value || value === "/") return "";
      if (value.startsWith("/")) return value;
      if (!/^https?:\/\//i.test(value)) return "";
      return value;
    };

    const resolvePresenceBase = () => {
      const storedBase =
        localStorage.getItem("socialsea_auth_base_url") || sessionStorage.getItem("socialsea_auth_base_url");
      const runtimeHost =
        typeof window !== "undefined" ? String(window.location.hostname || "").trim() : "";
      const runtimeHostBase =
        runtimeHost && (isLoopbackHost(runtimeHost) || isPrivateIpHost(runtimeHost))
          ? `http://${runtimeHost}:8080`
          : "";
      const candidates = [
        import.meta.env.VITE_DEV_PROXY_TARGET,
        import.meta.env.VITE_API_BASE_URL,
        import.meta.env.VITE_API_URL,
        getApiBaseUrl(),
        api.defaults.baseURL,
        storedBase,
        runtimeHostBase
      ]
        .map(normalizePresenceBase)
        .filter(Boolean);

      const absolute = candidates.find((value) => /^https?:\/\//i.test(value));
      return absolute || candidates[0] || "";
    };

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
      const baseURL = resolvePresenceBase();
      if (!baseURL) return;
      api
        .request({
          method: "POST",
          url: "/api/emergency/presence",
          data: payload,
          baseURL,
          timeout: 6000,
          suppressAuthRedirect: true,
          skipAuth: !authed,
          skipRefresh: !authed
        })
        .catch(() => {
          // ignore presence failures
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

  useEffect(() => {
    if (!authed || isAuthScreen) return undefined;
    let active = true;

    const sendPresenceHeartbeat = () => {
      if (!active) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      pingChatPresence({ timeoutMs: 6000 })
        .catch(() => {
          // Presence heartbeat should stay silent on transient network issues.
        });
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        sendPresenceHeartbeat();
      }
    };

    sendPresenceHeartbeat();
    document.addEventListener("visibilitychange", onVisibility);
    const timer = setInterval(sendPresenceHeartbeat, PRESENCE_HEARTBEAT_MS);

    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [authed, isAuthScreen]);

  useEffect(() => {
    if (!authed || !showUserNavbar) return undefined;
    const hasTouchSupport =
      typeof window !== "undefined" &&
      ("ontouchstart" in window || Number(navigator.maxTouchPoints || 0) > 0);
    if (!hasTouchSupport) return undefined;
    const isMobileViewport =
      typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;
    if (!isMobileViewport) return undefined;

    const swipeTabs = getSwipeTabs();
    const tabIndex = getSwipeTabIndex(location.pathname, swipeTabs);
    if (tabIndex < 0) return undefined;

    const node = appMainRef.current;
    if (!node) return undefined;

    const onTouchStart = (event) => {
      if (!event.touches || event.touches.length !== 1) {
        swipeStateRef.current.active = false;
        return;
      }
      const target = event.target;
      if (shouldIgnoreSwipeTarget(target)) {
        swipeStateRef.current.active = false;
        return;
      }
      const touch = event.touches[0];
      swipeStateRef.current = {
        active: true,
        startX: touch.clientX,
        startY: touch.clientY,
        startAt: Date.now(),
        target
      };
    };

    const onTouchCancel = () => {
      swipeStateRef.current.active = false;
    };

    const onTouchEnd = (event) => {
      const state = swipeStateRef.current;
      swipeStateRef.current.active = false;
      if (!state.active) return;
      const touch = event.changedTouches?.[0];
      if (!touch) return;

      const deltaX = touch.clientX - state.startX;
      const deltaY = touch.clientY - state.startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      const duration = Date.now() - state.startAt;

      if (duration > SWIPE_MAX_DURATION_MS) return;
      if (absX < SWIPE_MIN_DISTANCE_PX) return;
      if (absX < absY * SWIPE_DOMINANCE_RATIO) return;
      if (canAncestorHandleHorizontalSwipe(state.target, deltaX)) return;

      const direction = deltaX < 0 ? 1 : -1;
      const activeSwipeTabs = getSwipeTabs();
      const currentIndex = getSwipeTabIndex(location.pathname, activeSwipeTabs);
      if (currentIndex < 0) return;
      const nextIndex = currentIndex + direction;
      if (nextIndex < 0 || nextIndex >= activeSwipeTabs.length) return;
      const nextPath = resolveSwipeTabPath(nextIndex, activeSwipeTabs);
      if (!nextPath || nextPath === location.pathname) return;
      navigate(nextPath);
    };

    node.addEventListener("touchstart", onTouchStart, { passive: true });
    node.addEventListener("touchend", onTouchEnd, { passive: true });
    node.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      node.removeEventListener("touchstart", onTouchStart);
      node.removeEventListener("touchend", onTouchEnd);
      node.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [authed, showUserNavbar, location.pathname, navigate]);

  const appShell = (
    <>
      {showUserNavbar && <Navbar />}
      {showUserNavbar && <NotificationBuddyBoundary enabled={showUserNavbar} />}
      <GestureCursor />
      <main
        ref={appMainRef}
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
                      <Suspense fallback={<div style={{ padding: 20, color: "#fff" }}>Loading chat...</div>}><Chat /></Suspense>
                    </PageErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/chat/requests"
                element={
                  <ProtectedRoute>
                    <PageErrorBoundary title="Chat crashed">
                      <Suspense fallback={<div style={{ padding: 20, color: "#fff" }}>Loading chat...</div>}><Chat /></Suspense>
                    </PageErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/chat/:contactId"
                element={
                  <ProtectedRoute>
                    <PageErrorBoundary title="Chat crashed">
                      <Suspense fallback={<div style={{ padding: 20, color: "#fff" }}>Loading chat...</div>}><Chat /></Suspense>
                    </PageErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route path="/profile/:username/followers" element={<ProtectedRoute><FollowConnections /></ProtectedRoute>} />
              <Route path="/profile/:username/following" element={<ProtectedRoute><FollowConnections /></ProtectedRoute>} />
              <Route path="/profile/:username" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/jobs" element={<ProtectedRoute><Jobs /></ProtectedRoute>} />
              <Route path="/jobs/:jobId" element={<ProtectedRoute><JobDetail /></ProtectedRoute>} />
              <Route path="/jobs/:jobId/apply" element={<ProtectedRoute><JobApply /></ProtectedRoute>} />
              <Route path="/companies/:companyId" element={<ProtectedRoute><CompanyProfile /></ProtectedRoute>} />
              <Route path="/company-hub" element={<ProtectedRoute><CompanyHub /></ProtectedRoute>} />
              <Route path="/job-notifications" element={<ProtectedRoute><JobNotifications /></ProtectedRoute>} />
              <Route path="/applicant-inbox" element={<ProtectedRoute><ApplicantInbox /></ProtectedRoute>} />
              <Route path="/applicants/:applicationId" element={<ProtectedRoute><ApplicantProfile /></ProtectedRoute>} />
              <Route path="/job-profile" element={<ProtectedRoute><JobProfile /></ProtectedRoute>} />
              <Route path="/applied-jobs" element={<ProtectedRoute><AppliedJobs /></ProtectedRoute>} />
              <Route path="/post-job" element={<ProtectedRoute><PostJob /></ProtectedRoute>} />
              <Route path="/resume-builder" element={<ProtectedRoute><ResumeBuilder /></ProtectedRoute>} />
              <Route path="/profile/live-recordings" element={<ProtectedRoute><LiveRecordings /></ProtectedRoute>} />
              <Route path="/live-recordings" element={<ProtectedRoute><LiveRecordings /></ProtectedRoute>} />
              <Route path="/live" element={<Navigate to="/live/start" replace />} />
              <Route path="/live/start" element={<ProtectedRoute><LiveStart /></ProtectedRoute>} />
              <Route path="/live/watch" element={<ProtectedRoute><LiveStart mode="watch" /></ProtectedRoute>} />
              <Route path="/stories" element={<ProtectedRoute><StoriesPage /></ProtectedRoute>} />
              <Route path="/story/create" element={<ProtectedRoute><StoryCreate /></ProtectedRoute>} />
              <Route path="/highlights/create" element={<ProtectedRoute><HighlightsCreate /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/settings/appearance" element={<ProtectedRoute><SettingsAppearance /></ProtectedRoute>} />
              <Route path="/settings/activity" element={<ProtectedRoute><YourActivity /></ProtectedRoute>} />
              <Route path="/settings/activity/:sectionId" element={<ProtectedRoute><YourActivity /></ProtectedRoute>} />
              <Route path="/settings/content-types" element={<ProtectedRoute><SettingsContentTypes /></ProtectedRoute>} />
              <Route path="/settings/sounds" element={<ProtectedRoute><SettingsSounds /></ProtectedRoute>} />
              <Route path="/settings/language" element={<ProtectedRoute><SettingsLanguage /></ProtectedRoute>} />
              <Route path="/settings/location" element={<ProtectedRoute><SettingsLocation /></ProtectedRoute>} />
              <Route path="/settings/privacy" element={<ProtectedRoute><SettingsPrivacy /></ProtectedRoute>} />
              <Route path="/settings/login-activity" element={<ProtectedRoute><SettingsLoginActivity /></ProtectedRoute>} />
              <Route path="/settings/notification-buddy" element={<ProtectedRoute><NotificationBuddySettings /></ProtectedRoute>} />
              <Route path="/settings/manage/:optionId" element={<ProtectedRoute><SettingsManage /></ProtectedRoute>} />
              <Route path="/sos" element={<ProtectedRoute><SOSPage /></ProtectedRoute>} />
              <Route path="/sos/live/:alertId" element={<ProtectedRoute><SOSPage /></ProtectedRoute>} />
              <Route path="/sos/navigate/:alertId" element={<ProtectedRoute><SOSNavigate /></ProtectedRoute>} />
              <Route path="/ambulance" element={<ProtectedRoute><AmbulanceNavigation /></ProtectedRoute>} />
              <Route path="/saved" element={<ProtectedRoute><Saved /></ProtectedRoute>} />
              <Route path="/follow-requests" element={<ProtectedRoute><FollowRequests /></ProtectedRoute>} />
              <Route path="/storage/unlock" element={<ProtectedRoute><StorageVaultUnlock /></ProtectedRoute>} />
              <Route path="/storage" element={<ProtectedRoute><StorageVault /></ProtectedRoute>} />
              <Route path="/profile-setup" element={<ProtectedRoute><ProfileSetup /></ProtectedRoute>} />
              <Route path="/anonymous-feed" element={<ProtectedRoute><AnonymousFeed /></ProtectedRoute>} />
              <Route path="/anonymous/upload" element={<ProtectedRoute><AnonymousUpload /></ProtectedRoute>} />

              <Route path="/admin" element={<ProtectedRoute role="ADMIN"><AdminLayout /></ProtectedRoute>}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<AdminDashboard />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="posts" element={<AdminPosts />} />
                <Route path="live-recordings" element={<AdminLiveRecordings />} />
                <Route path="ambulance" element={<AdminAmbulanceRequests />} />
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

  if (!authed) return appShell;

  return (
    <ChatProvider>
      <VideoCall placement="page" />
      <VideoCall placement="thread" />
      {appShell}
    </ChatProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

