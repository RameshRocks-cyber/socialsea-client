import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import Feed from "./components/Feed";
import Login from "./pages/Login";
import Register from "./pages/Register";
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
import AdminLayout from "./AdminLayout";
import Saved from "./pages/Saved";
import FollowRequests from "./pages/FollowRequests";
import LongVideos from "./pages/LongVideos";
import "./App.css";

function AppRoutes() {
  const location = useLocation();
  const showUserNavbar = !location.pathname.startsWith("/admin");
  const isReelsRoute = location.pathname === "/reels";

  return (
    <>
      {showUserNavbar && <Navbar />}
      <main
        className={`app-main ${showUserNavbar ? "with-user-nav" : ""} ${
          showUserNavbar ? "bg-gradient-to-br from-blue-950 via-slate-900 to-blue-900 text-white" : ""
        }`}
      >
        <div className={`app-content ${isReelsRoute ? "reels-content" : ""}`}>
          <Routes>
            <Route path="/" element={<Navigate to="/feed" replace />} />
            <Route path="/home" element={<Navigate to="/feed" replace />} />
            <Route path="/feed" element={<ProtectedRoute><Feed /></ProtectedRoute>} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/upload" element={<ProtectedRoute><Upload /></ProtectedRoute>} />
            <Route path="/reels" element={<ProtectedRoute><Reels /></ProtectedRoute>} />
            <Route path="/watch/:postId" element={<ProtectedRoute><LongVideos /></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
            <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
            <Route path="/profile/:username" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/saved" element={<ProtectedRoute><Saved /></ProtectedRoute>} />
            <Route path="/follow-requests" element={<ProtectedRoute><FollowRequests /></ProtectedRoute>} />
            <Route path="/profile-setup" element={<ProfileSetup />} />
            <Route path="/anonymous-feed" element={<AnonymousFeed />} />
            <Route path="/anonymous/upload" element={<ProtectedRoute><AnonymousUpload /></ProtectedRoute>} />
            
            <Route path="/admin" element={<ProtectedRoute role="ADMIN"><AdminLayout /></ProtectedRoute>}>
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="posts" element={<AdminPosts />} />
              <Route path="reports" element={<AdminReports />} />
              <Route path="anonymous/pending" element={<AdminAnonymousPending />} />
              <Route path="notifications" element={<NotificationsPage />} />
            </Route>

            <Route path="/unauthorized" element={<Unauthorized />} />
          </Routes>
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
