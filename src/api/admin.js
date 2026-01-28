import api from "./axios";

export const getAdminDashboard = () => {
  return api.get("/admin/dashboard");
};