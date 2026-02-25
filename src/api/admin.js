import api from "./axios";

export const getAdminDashboard = () => {
  return api.get("/admin/dashboard");
};

export const getPendingAnonymousPosts = () => {
  return api.get("/admin/anonymous/pending");
};

export const getDashboardCharts = (days = 7) => {
  return api.get(`/admin/dashboard/charts?days=${days}`);
};

export const getReports = (params) => {
  return api.get("/admin/reports", { params });
};