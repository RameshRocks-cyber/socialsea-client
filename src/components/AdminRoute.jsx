import { Navigate } from "react-router-dom";

export default function AdminRoute({ children }) {
  const role = localStorage.getItem("role");

  if (role !== "ADMIN") {
    return <Navigate to="/" />;
  }

  return children;
}