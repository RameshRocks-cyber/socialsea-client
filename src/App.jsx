import { BrowserRouter, Routes, Route } from "react-router-dom"
import Feed from "./pages/Feed"
import Upload from "./pages/Upload"
import AnonymousUpload from "./pages/AnonymousUpload"
import AnonymousFeed from "./pages/AnonymousFeed"
import ProtectedRoute from "./components/ProtectedRoute"
import Login from "./pages/Login"
import Navbar from "./components/Navbar"
import Profile from "./pages/Profile"
import Reels from "./pages/Reels"
import Notifications from "./pages/Notifications"

function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Feed />} />
        <Route path="/login" element={<Login />} />
        <Route path="/upload" element={<ProtectedRoute><Upload /></ProtectedRoute>} />
        <Route path="/anonymous-upload" element={<AnonymousUpload />} />
        <Route path="/anonymous-feed" element={<AnonymousFeed />} />
        <Route path="/reels" element={<Reels />} />
        <Route path="/profile/:username" element={<Profile />} />
        <Route path="/notifications" element={<Notifications />} />

      </Routes>
    </BrowserRouter>
  )
}

export default App
