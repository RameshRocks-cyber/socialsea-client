import { Navigate } from "react-router-dom"
import { isAuthenticated, getUserRole } from "../utils/auth";

export default function ProtectedRoute({ children, role }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  if (role && getUserRole() !== role) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}
