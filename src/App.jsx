import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Feed from "./components/Feed";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Upload from "./pages/Upload";
import Reels from "./pages/Reels";
import Notifications from "./pages/Notifications";
import Profile from "./pages/Profile";
import AnonymousFeed from "./pages/AnonymousFeed";
import AnonymousUpload from "./pages/AnonymousUpload";
import AdminDashboard from "./AdminDashboard";
import PendingAnonymousPosts from "./PendingAnonymousPosts";
import ReportedPosts from "./ReportedPosts";
import NotificationsPage from "./NotificationsPage";
import Dashboard from "./Dashboard";
import ProtectedRoute from "./components/ProtectedRoute";
import Unauthorized from "./pages/Unauthorized";

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<ProtectedRoute><Feed /></ProtectedRoute>} />
        <Route path="/home" element={<ProtectedRoute><Feed /></ProtectedRoute>} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/upload" element={<ProtectedRoute><Upload /></ProtectedRoute>} />
        <Route path="/reels" element={<ProtectedRoute><Reels /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
        <Route path="/profile/:username" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/anonymous-feed" element={<AnonymousFeed />} />
        <Route path="/anonymous/upload" element={<ProtectedRoute><AnonymousUpload /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute role="ADMIN"><AdminDashboard /></ProtectedRoute>} />
        <Route path="/admin/pending" element={<ProtectedRoute role="ADMIN"><PendingAnonymousPosts /></ProtectedRoute>} />
        <Route path="/admin/reports" element={<ProtectedRoute role="ADMIN"><ReportedPosts /></ProtectedRoute>} />
        <Route path="/admin/notifications" element={<ProtectedRoute role="ADMIN"><NotificationsPage /></ProtectedRoute>} />
        <Route path="/admin/dashboard" element={<ProtectedRoute role="ADMIN"><Dashboard /></ProtectedRoute>} />
        <Route path="/unauthorized" element={<Unauthorized />} />
      </Routes>
    </BrowserRouter>
  );
}
