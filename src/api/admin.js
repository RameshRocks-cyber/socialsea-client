import api from "./axios";

export const getAdminDashboard = () => {
  return api.get("/api/admin/dashboard");
};

export const getPendingAnonymousPosts = () => {
  return api.get("/api/admin/anonymous/pending");
};

export const getDashboardCharts = (days = 7) => {
  return api.get(`/api/admin/dashboard/charts?days=${days}`);
};

export const getReports = (params) => {
  return api.get("/api/admin/reports", { params });
};