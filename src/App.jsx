import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Feed from "./pages/Feed";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Upload from "./pages/Upload";
import Reels from "./pages/Reels";
import Notifications from "./pages/Notifications";
import AnonymousFeed from "./pages/AnonymousFeed";
import AnonymousUpload from "./pages/AnonymousUpload";
import Profile from "./pages/Profile";
import Admin from "./pages/Admin";

function ProtectedRoute({ children }) {
  const token = localStorage.getItem("token");
  return token ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ProtectedRoute><Feed /></ProtectedRoute>} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/upload" element={<ProtectedRoute><Upload /></ProtectedRoute>} />
        <Route path="/reels" element={<ProtectedRoute><Reels /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
        <Route path="/anonymous-feed" element={<AnonymousFeed />} />
        <Route path="/anonymous-upload" element={<AnonymousUpload />} />
        <Route path="/profile/:username" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  );
}