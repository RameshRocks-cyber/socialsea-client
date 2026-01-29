import { getUserRole } from "./auth";

export default function PermissionGate({ children, permission }) {
  const role = getUserRole();

  // For now, assume ADMIN has all permissions
  if (role === "ADMIN") {
    return children;
  }

  return null;
}