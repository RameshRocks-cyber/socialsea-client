import { Navigate } from "react-router-dom";
import { isAuthenticated, getUserRole } from "../auth";

export default function ProtectedRoute({ children, role }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" />;
  }
  if (role && getUserRole() !== role) {
    return <Navigate to="/unauthorized" />;
  }
  return children;
}